import http from 'node:http';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { summarizeDay, summarizeDayByApp, type Transaction } from '../../packages/core/src/index';
import { createAdmin } from './admin';

const PORT = Number(process.env.PORT ?? 80);
const DB_PATH = process.env.DB_PATH ?? './paisa-server.db';
const SESSION_DAYS = 90;
const MAX_BODY = 5 * 1024 * 1024;
const MAX_BATCH = 1000;

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS txns (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
    day_key TEXT NOT NULL, occurred_at TEXT NOT NULL, fingerprint TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS txns_user_day ON txns (user_id, day_key);
  CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT
  );
`);
// Additive migrations for databases created before the admin dashboard existed.
function addColumn(table: string, col: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
addColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
addColumn('users', 'last_login_at', 'TEXT');
addColumn('sessions', 'created_at', 'INTEGER NOT NULL DEFAULT 0');

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 64).toString('hex');
const normContact = (c: string) => c.trim().toLowerCase().replace(/[\s-]/g, '');
const validContact = (c: string) => /^[6-9]\d{9}$/.test(c) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

interface UserRow { id: string; name: string; contact: string; pass_hash: string; salt: string; status: string }

const q = {
  userByContact: db.prepare('SELECT * FROM users WHERE contact = ?'),
  insertUser: db.prepare('INSERT INTO users (id, name, contact, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'),
  sessionUser: db.prepare('SELECT u.id, u.name, u.contact FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = \'active\''),
  delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  upsertTxn: db.prepare(`INSERT INTO txns (user_id, id, day_key, occurred_at, fingerprint, json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET day_key = excluded.day_key, occurred_at = excluded.occurred_at, fingerprint = excluded.fingerprint, json = excluded.json, updated_at = excluded.updated_at`),
  delTxn: db.prepare('DELETE FROM txns WHERE user_id = ? AND id = ?'),
  delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  touchLogin: db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
  countTxns: db.prepare('SELECT COUNT(*) c FROM txns WHERE user_id = ?'),
  txnsInRange: db.prepare('SELECT json FROM txns WHERE user_id = ? AND day_key >= ? AND day_key <= ? ORDER BY occurred_at DESC'),
};

function issueToken(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  q.insertSession.run(sha(token), userId, Date.now() + SESSION_DAYS * 86_400_000, Date.now());
  q.touchLogin.run(new Date().toISOString(), userId);
  return token;
}

// Naive per-IP limiter for auth endpoints.
const hits = new Map<string, number[]>();
function limit(ip: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (arr.length > max) throw new HttpError(429, 'Too many attempts, try again in a minute');
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body too large');
    chunks.push(c as Buffer);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' });
  res.end(data);
};

function authUser(req: http.IncomingMessage) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  const u = m ? (q.sessionUser.get(sha(m[1]!), Date.now()) as { id: string; name: string; contact: string } | undefined) : undefined;
  if (!u) throw new HttpError(401, 'Not signed in');
  return { ...u, tokenHash: sha(m![1]!) };
}

// Admin-controlled runtime settings (see admin.ts). Read per request: one tiny indexed lookup.
const CONFIG_DEFAULTS = { registrationsOpen: true, syncEnabled: true, maintenanceMode: false, maintenanceMessage: '', announcement: '', minAppVersion: '' };
type AppConfig = typeof CONFIG_DEFAULTS;
function getConfig(): AppConfig {
  const out: Record<string, unknown> = { ...CONFIG_DEFAULTS };
  for (const r of db.prepare('SELECT key, value FROM app_config').all() as { key: string; value: string }[]) {
    if (r.key in CONFIG_DEFAULTS) { try { out[r.key] = JSON.parse(r.value); } catch { /* keep default */ } }
  }
  return out as AppConfig;
}
function assertOnline() {
  const c = getConfig();
  if (c.maintenanceMode) throw new HttpError(503, c.maintenanceMessage || 'Paisa is under maintenance. Please try again shortly.');
}

const admin = createAdmin({ db, HttpError, send, readJson, limit, sha, hashPw, normContact, validContact, getConfig, CONFIG_DEFAULTS });

const isTxn = (t: any): t is Transaction =>
  t && typeof t.id === 'string' && t.id.length < 100 &&
  typeof t.dayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dayKey) &&
  typeof t.occurredAt === 'string' && typeof t.fingerprint === 'string' &&
  Number.isSafeInteger(t.amountPaise) && t.amountPaise > 0 &&
  (t.direction === 'debit' || t.direction === 'credit');

const loadTxns = (userId: string, from?: string, to?: string): Transaction[] =>
  (q.txnsInRange.all(userId, from ?? '0000-00-00', to ?? '9999-99-99') as { json: string }[]).map((r) => JSON.parse(r.json));

async function route(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const ip = req.socket.remoteAddress ?? '?';

  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    if (await admin.handle(req, res, url, ip)) return;
    throw new HttpError(404, 'Not found');
  }

  switch (`${req.method} ${url.pathname}`) {
    case 'GET /config': {
      const c = getConfig();
      return send(res, 200, { maintenanceMode: c.maintenanceMode, maintenanceMessage: c.maintenanceMessage, announcement: c.announcement, minAppVersion: c.minAppVersion, registrationsOpen: c.registrationsOpen });
    }

    case 'GET /':
    case 'GET /health':
      return send(res, 200, { ok: true, service: 'paisa-api', time: new Date().toISOString() });

    case 'POST /auth/register': {
      limit(ip);
      assertOnline();
      if (!getConfig().registrationsOpen) throw new HttpError(403, 'New sign-ups are paused right now.');
      const b = await readJson(req);
      const name = String(b.name ?? '').trim();
      const contact = normContact(String(b.contact ?? ''));
      const password = String(b.password ?? '');
      if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your name');
      if (!validContact(contact)) throw new HttpError(400, 'Enter a valid 10-digit mobile number or email');
      if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be at least 8 characters');
      if (q.userByContact.get(contact)) throw new HttpError(409, 'An account with this number/email already exists. Log in instead.');
      const id = crypto.randomUUID();
      const salt = crypto.randomBytes(16).toString('hex');
      q.insertUser.run(id, name, contact, hashPw(password, salt), salt, new Date().toISOString());
      return send(res, 201, { token: issueToken(id), user: { id, name, contact } });
    }

    case 'POST /auth/login': {
      limit(ip);
      assertOnline();
      const b = await readJson(req);
      const contact = normContact(String(b.contact ?? ''));
      const password = String(b.password ?? '');
      const u = q.userByContact.get(contact) as UserRow | undefined;
      const ok = !!u && crypto.timingSafeEqual(Buffer.from(hashPw(password, u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
      if (!u || !ok) throw new HttpError(401, 'Wrong number/email or password');
      if (u.status !== 'active') throw new HttpError(403, 'This account has been suspended. Contact support.');
      return send(res, 200, { token: issueToken(u.id), user: { id: u.id, name: u.name, contact: u.contact } });
    }

    case 'POST /auth/logout': {
      q.delSession.run(authUser(req).tokenHash);
      return send(res, 200, { ok: true });
    }

    case 'GET /me': {
      const { id, name, contact } = authUser(req);
      return send(res, 200, { user: { id, name, contact }, transactionCount: (q.countTxns.get(id) as { c: number }).c });
    }

    case 'DELETE /me': {
      q.delUser.run(authUser(req).id);
      return send(res, 200, { ok: true });
    }

    case 'POST /transactions/sync': {
      const u = authUser(req);
      assertOnline();
      if (!getConfig().syncEnabled) throw new HttpError(503, 'Cloud sync is temporarily disabled.');
      const b = await readJson(req);
      const list: unknown[] = Array.isArray(b.transactions) ? b.transactions : [];
      const del: unknown[] = Array.isArray(b.deleteIds) ? b.deleteIds : [];
      if (list.length > MAX_BATCH || del.length > MAX_BATCH) throw new HttpError(413, `At most ${MAX_BATCH} items per request`);
      const bad = list.findIndex((t) => !isTxn(t));
      if (bad >= 0) throw new HttpError(400, `transactions[${bad}] is not a valid transaction`);
      const now = Date.now();
      db.exec('BEGIN');
      try {
        for (const t of list as Transaction[]) q.upsertTxn.run(u.id, t.id, t.dayKey, t.occurredAt, t.fingerprint, JSON.stringify(t), now);
        for (const id of del) if (typeof id === 'string') q.delTxn.run(u.id, id);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return send(res, 200, { upserted: list.length, deleted: del.length });
    }

    case 'GET /transactions': {
      const u = authUser(req);
      const rows = loadTxns(u.id, url.searchParams.get('from') ?? undefined, url.searchParams.get('to') ?? undefined);
      const limitN = Math.min(Number(url.searchParams.get('limit') ?? 5000), 20000);
      const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
      return send(res, 200, { total: rows.length, transactions: rows.slice(offset, offset + limitN) });
    }

    case 'GET /summary/daily': {
      const u = authUser(req);
      const rows = loadTxns(u.id, url.searchParams.get('from') ?? undefined, url.searchParams.get('to') ?? undefined);
      const days = [...new Set(rows.map((t) => t.dayKey))].sort().reverse();
      return send(res, 200, {
        days: days.map((d) => {
          const s = summarizeDay(rows, d);
          return { dayKey: d, debitPaise: s.grossExpensePaise, creditPaise: s.incomePaise + s.refundPaise, netExpensePaise: s.expensePaise, count: s.count, byApp: summarizeDayByApp(rows, d) };
        }),
      });
    }
  }
  throw new HttpError(404, 'Not found');
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Server error' });
  });
});
server.requestTimeout = 30_000;
server.listen(PORT, '0.0.0.0', () => console.log(`paisa-api listening on :${PORT}`));
