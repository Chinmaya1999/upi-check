import http from 'node:http';
import { privacyHtml, deleteHtml } from './legal';
import { sendOtp, sendNotice, type OtpPurpose } from './mail';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolveDesign, resolveFestival, summarizeDay, summarizeDayByApp, type Transaction } from '../../packages/core/src/index';
import { createAdmin } from './admin';

const PORT = Number(process.env.PORT ?? 80);
const DB_PATH = process.env.DB_PATH ?? './paisa-server.db';
const SESSION_DAYS = 90;
const MAX_SESSIONS = 10;
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
addColumn('users', 'email', 'TEXT');
addColumn('users', 'phone', 'TEXT');
addColumn('users', 'avatar', 'TEXT');
addColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
// Accounts made before email became mandatory: the old single `contact` was either an email or a phone number.
db.exec(`
  UPDATE users SET email = contact, email_verified = 1 WHERE email IS NULL AND contact LIKE '%@%';
  UPDATE users SET phone = contact WHERE phone IS NULL AND contact NOT LIKE '%@%';
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users(email) WHERE email IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uq ON users(phone) WHERE phone IS NOT NULL;
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL, rating INTEGER, message TEXT NOT NULL, app_version TEXT, device TEXT,
    status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created_at DESC);
  CREATE TABLE IF NOT EXISTS otps (
    key TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER NOT NULL, payload TEXT
  );
`);

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 64).toString('hex');
const normContact = (c: string) => c.trim().toLowerCase().replace(/[\s-]/g, '');
const validEmail = (e: string) => e.length <= 254 && /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e);
const validPhone = (p: string) => /^[6-9]\d{9}$/.test(p);
const normPhone = (p: string) => p.replace(/[\s-]/g, '').replace(/^(\+?91)(?=\d{10}$)/, '');
const validContact = (c: string) => /^[6-9]\d{9}$/.test(c) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

interface UserRow { id: string; name: string; contact: string; pass_hash: string; salt: string; status: string }

const q = {
  userByContact: db.prepare('SELECT * FROM users WHERE contact = ?'),
  userByLogin: db.prepare('SELECT * FROM users WHERE email = ? OR phone = ? OR contact = ?'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userByPhone: db.prepare('SELECT id FROM users WHERE phone = ?'),
  userById: db.prepare('SELECT id, name, contact, email, phone, email_verified, avatar FROM users WHERE id = ?'),
  insertUserFull: db.prepare('INSERT INTO users (id, name, contact, email, phone, email_verified, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)'),
  setProfile: db.prepare('UPDATE users SET name = ?, phone = ?, contact = ? WHERE id = ?'),
  setEmail: db.prepare('UPDATE users SET email = ?, email_verified = 1, contact = ? WHERE id = ?'),
  setPassword: db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?'),
  setAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
  delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  getOtp: db.prepare('SELECT * FROM otps WHERE key = ?'),
  putOtp: db.prepare('INSERT INTO otps (key, code_hash, expires_at, attempts, sent_at, payload) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(key) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at, payload = excluded.payload'),
  delOtp: db.prepare('DELETE FROM otps WHERE key = ?'),
  bumpOtp: db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE key = ?'),
  purgeOtps: db.prepare('DELETE FROM otps WHERE expires_at < ?'),
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
  // Keep only the newest MAX_SESSIONS devices per account, and drop expired rows.
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)').run(userId, userId, MAX_SESSIONS);
  q.touchLogin.run(new Date().toISOString(), userId);
  return token;
}

// Per-account lockout: repeated wrong passwords for one identity are throttled no matter how many IPs the guesses come from.
const fails = new Map<string, { n: number; first: number }>();
const LOCK_MAX = 8, LOCK_WINDOW = 15 * 60_000;
function lockCheck(id: string) {
  const f = fails.get(id);
  if (f && Date.now() - f.first > LOCK_WINDOW) fails.delete(id);
  else if (f && f.n >= LOCK_MAX) throw new HttpError(429, 'Too many wrong passwords. Try again in 15 minutes, or reset your password with email.');
}
const lockFail = (id: string) => { const f = fails.get(id); if (f && Date.now() - f.first <= LOCK_WINDOW) f.n++; else fails.set(id, { n: 1, first: Date.now() }); };
const lockClear = (id: string) => fails.delete(id);
const DUMMY = { salt: crypto.randomBytes(16).toString('hex'), hash: '' };
DUMMY.hash = crypto.scryptSync('dummy-password', DUMMY.salt, 64).toString('hex');

// Naive per-IP limiter for auth endpoints.
const hits = new Map<string, number[]>();
// Per-IP auth cap. Mobile carriers put many users behind one IP, so this is generous; the real brute-force defences
// are the per-account lockout and the per-email OTP limits above.
const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 60);
function limit(ip: string, max = AUTH_LIMIT, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (arr.length > max) throw new HttpError(429, 'Too many attempts, try again in a minute');
}

// ── Email OTP ──────────────────────────────────────────────────────────────────────────────
const OTP_MIN = 10, OTP_RESEND_MS = 45_000, OTP_MAX_TRIES = 5;
interface OtpRow { key: string; code_hash: string; expires_at: number; attempts: number; sent_at: number; payload: string | null }

async function issueOtp(purpose: OtpPurpose, email: string, payload: unknown, name?: string, scope = email) {
  limit(`otp:${email}`, 6, 3_600_000);            // 6 emails / hour / address
  const key = `${purpose}:${scope}`;
  const prev = q.getOtp.get(key) as OtpRow | undefined;
  if (prev && Date.now() - prev.sent_at < OTP_RESEND_MS) throw new HttpError(429, `Please wait ${Math.ceil((OTP_RESEND_MS - (Date.now() - prev.sent_at)) / 1000)}s before requesting another code`);
  const code = String(crypto.randomInt(100000, 1000000));
  q.purgeOtps.run(Date.now());
  q.putOtp.run(key, sha(`${key}:${code}`), Date.now() + OTP_MIN * 60_000, Date.now(), payload === undefined ? null : JSON.stringify(payload));
  try { await sendOtp(email, purpose, code, name, OTP_MIN); }
  catch (e) { q.delOtp.run(key); console.error('mail failed', e); throw new HttpError(502, "We couldn't send the email right now. Please try again in a minute."); }
}

/** Returns the stored payload when the code is right; consumes it. Wrong tries are capped. */
function checkOtp(purpose: OtpPurpose, scope: string, code: string): any {
  const key = `${purpose}:${scope}`;
  const r = q.getOtp.get(key) as OtpRow | undefined;
  if (!r || r.expires_at < Date.now()) { if (r) q.delOtp.run(key); throw new HttpError(400, 'That code has expired. Request a new one.'); }
  if (r.attempts >= OTP_MAX_TRIES) { q.delOtp.run(key); throw new HttpError(429, 'Too many wrong attempts. Request a new code.'); }
  const good = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(sha(`${key}:${code}`)), Buffer.from(r.code_hash));
  if (!good) { q.bumpOtp.run(key); throw new HttpError(400, `Incorrect code. ${OTP_MAX_TRIES - r.attempts - 1} tries left.`); }
  q.delOtp.run(key);
  return r.payload ? JSON.parse(r.payload) : null;
}

const MAX_AVATAR = 400_000; // characters of data URL (client sends ~256px JPEG, ≈30 KB)
const publicUser = (u: { id: string; name: string; contact: string; email: string | null; phone: string | null; email_verified: number; avatar?: string | null }) =>
  ({ id: u.id, name: u.name, contact: u.contact, email: u.email, phone: u.phone, emailVerified: !!u.email_verified, avatar: u.avatar ?? null });
const checkPassword = (pw: string) => { if (pw.length < 8 || pw.length > 128) throw new HttpError(400, 'Password must be at least 8 characters'); };
const hashNew = (pw: string) => { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: hashPw(pw, salt) }; };
const pwOk = (u: UserRow, pw: string) => crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));

// Housekeeping so the in-memory limiters can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) if (!arr.length || now - arr[arr.length - 1]! > 3_600_000) hits.delete(k);
  for (const [k, f] of fails) if (now - f.first > LOCK_WINDOW) fails.delete(k);
}, 600_000).unref();

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

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const send = (res: http.ServerResponse, status: number, body: unknown) => {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store', ...SEC_HEADERS });
  res.end(data);
};

function authUser(req: http.IncomingMessage) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  const u = m ? (q.sessionUser.get(sha(m[1]!), Date.now()) as { id: string; name: string; contact: string } | undefined) : undefined;
  if (!u) throw new HttpError(401, 'Not signed in');
  return { ...u, tokenHash: sha(m![1]!) };
}

// Admin-controlled runtime settings (see admin.ts). Read per request: one tiny indexed lookup.
const CONFIG_DEFAULTS = { registrationsOpen: true, syncEnabled: true, maintenanceMode: false, maintenanceMessage: '', announcement: '', minAppVersion: '', uiDesign: 'aurora', uiMotion: '', festival: '', festivalUntil: '' };
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
  // Behind Caddy (the only thing that can reach this port) the real client is in X-Forwarded-For.
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]!.trim() || (req.socket.remoteAddress ?? '?');

  if (url.pathname !== '/health' && url.pathname !== '/') limit(`g:${ip}`, 300);   // generous overall cap per IP per minute

  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    if (await admin.handle(req, res, url, ip)) return;
    throw new HttpError(404, 'Not found');
  }

  switch (`${req.method} ${url.pathname}`) {
    case 'GET /config': {
      const c = getConfig();
      return send(res, 200, { maintenanceMode: c.maintenanceMode, maintenanceMessage: c.maintenanceMessage, announcement: c.announcement, minAppVersion: c.minAppVersion, registrationsOpen: c.registrationsOpen, design: resolveDesign(c.uiDesign, c.uiMotion), festival: resolveFestival(c.festival, c.festivalUntil) });
    }

    case 'GET /privacy':
    case 'GET /delete-account': {
      const html = url.pathname === '/privacy' ? privacyHtml() : deleteHtml();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", ...SEC_HEADERS });
      return void res.end(html);
    }

    case 'GET /':
    case 'GET /health':
      return send(res, 200, { ok: true, service: 'paisa-api', time: new Date().toISOString() });

    // Step 1: validate, park the details with an emailed code. The account is only created once the code is entered.
    case 'POST /auth/register/start': {
      limit(ip);
      assertOnline();
      if (!getConfig().registrationsOpen) throw new HttpError(403, 'New sign-ups are paused right now.');
      const b = await readJson(req);
      const name = String(b.name ?? '').trim();
      const email = normContact(String(b.email ?? ''));
      const phone = b.phone ? normPhone(String(b.phone)) : '';
      const password = String(b.password ?? '');
      if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your name');
      if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
      if (phone && !validPhone(phone)) throw new HttpError(400, 'Enter a valid 10-digit mobile number, or leave it empty');
      checkPassword(password);
      if (q.userByEmail.get(email) || q.userByContact.get(email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
      if (phone && q.userByPhone.get(phone)) throw new HttpError(409, 'That mobile number is already used by another account.');
      const { salt, hash } = hashNew(password);
      await issueOtp('register', email, { name, phone: phone || null, salt, hash }, name);
      return send(res, 200, { ok: true, email, expiresInSec: OTP_MIN * 60 });
    }

    case 'POST /auth/register/resend': {
      limit(ip);
      const email = normContact(String((await readJson(req)).email ?? ''));
      const r = q.getOtp.get(`register:${email}`) as OtpRow | undefined;
      if (!r?.payload) throw new HttpError(400, 'Start sign-up again.');
      const p = JSON.parse(r.payload);
      await issueOtp('register', email, p, p.name);
      return send(res, 200, { ok: true, email, expiresInSec: OTP_MIN * 60 });
    }

    case 'POST /auth/register/verify': {
      limit(ip);
      const b = await readJson(req);
      const email = normContact(String(b.email ?? ''));
      const p = checkOtp('register', email, String(b.otp ?? '').trim());
      if (q.userByEmail.get(email) || q.userByContact.get(email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
      if (p.phone && q.userByPhone.get(p.phone)) throw new HttpError(409, 'That mobile number is already used by another account.');
      const id = crypto.randomUUID();
      q.insertUserFull.run(id, p.name, email, email, p.phone, p.hash, p.salt, new Date().toISOString());
      return send(res, 201, { token: issueToken(id), user: publicUser(q.userById.get(id) as any) });
    }

    case 'POST /auth/register':
      throw new HttpError(410, 'Please update Paisa from the store to sign up — sign-up now needs email verification.');

    case 'POST /auth/login': {
      limit(ip);
      assertOnline();
      const b = await readJson(req);
      const id = normContact(String(b.contact ?? b.email ?? ''));
      const password = String(b.password ?? '');
      lockCheck(id);
      const u = q.userByLogin.get(id, normPhone(id), id) as UserRow | undefined;
      // Unknown accounts do the same scrypt work, so response time doesn't reveal whether an account exists.
      const ok = u ? pwOk(u, password) : (crypto.timingSafeEqual(Buffer.from(hashPw(password, DUMMY.salt), 'hex'), Buffer.from(DUMMY.hash, 'hex')), false);
      if (!u || !ok) { lockFail(id); throw new HttpError(401, 'Wrong email/number or password'); }
      lockClear(id);
      if (u.status !== 'active') throw new HttpError(403, 'This account has been suspended. Contact support.');
      return send(res, 200, { token: issueToken(u.id), user: publicUser(q.userById.get(u.id) as any) });
    }

    // Forgot password: always answers "sent" so the endpoint can't be used to discover which emails have accounts.
    case 'POST /auth/forgot': {
      limit(ip);
      const email = normContact(String((await readJson(req)).email ?? ''));
      if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
      const u = q.userByEmail.get(email) as UserRow | undefined;
      if (u && u.status === 'active') await issueOtp('reset', email, { id: u.id }, u.name);
      return send(res, 200, { ok: true, email, expiresInSec: OTP_MIN * 60 });
    }

    case 'POST /auth/reset': {
      limit(ip);
      const b = await readJson(req);
      const email = normContact(String(b.email ?? ''));
      const password = String(b.password ?? '');
      checkPassword(password);
      const p = checkOtp('reset', email, String(b.otp ?? '').trim());
      const { salt, hash } = hashNew(password);
      q.setPassword.run(hash, salt, p.id);
      q.delUserSessions.run(p.id); // every device is signed out
      lockClear(email);
      void sendNotice(email, 'password_changed');
      return send(res, 200, { ok: true });
    }

    // In-app feedback / improvement ideas, shown in the admin dashboard.
    case 'POST /feedback': {
      const { id } = authUser(req);
      limit(`fb:${id}`, 5, 3_600_000);
      const b = await readJson(req);
      const category = ['idea', 'bug', 'praise', 'other'].includes(b.category) ? String(b.category) : 'other';
      const message = String(b.message ?? '').trim();
      if (message.length < 5) throw new HttpError(400, 'Please write a few words so we can understand.');
      if (message.length > 2000) throw new HttpError(400, 'Please keep feedback under 2000 characters.');
      const rating = Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : null;
      const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
      db.prepare('INSERT INTO feedback (user_id, category, rating, message, app_version, device, status, created_at) VALUES (?, ?, ?, ?, ?, ?, \'new\', ?)')
        .run(id, category, rating, message, clip(b.appVersion, 40), clip(b.device, 80), Date.now());
      return send(res, 201, { ok: true });
    }

    case 'POST /me/logout-all': {
      q.delUserSessions.run(authUser(req).id);
      return send(res, 200, { ok: true });
    }

    case 'POST /auth/logout': {
      q.delSession.run(authUser(req).tokenHash);
      return send(res, 200, { ok: true });
    }

    case 'GET /me': {
      const { id } = authUser(req);
      return send(res, 200, { user: publicUser(q.userById.get(id) as any), transactionCount: (q.countTxns.get(id) as { c: number }).c });
    }

    case 'PATCH /me': {
      const { id } = authUser(req);
      const b = await readJson(req);
      const cur = q.userById.get(id) as any;
      const name = b.name === undefined ? cur.name : String(b.name).trim();
      if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your name');
      const phone = b.phone === undefined ? cur.phone : (String(b.phone ?? '').trim() ? normPhone(String(b.phone)) : null);
      if (phone && !validPhone(phone)) throw new HttpError(400, 'Enter a valid 10-digit mobile number');
      if (phone && phone !== cur.phone && q.userByPhone.get(phone)) throw new HttpError(409, 'That mobile number is already used by another account.');
      q.setProfile.run(name, phone, cur.email ?? phone ?? cur.contact, id);
      return send(res, 200, { user: publicUser(q.userById.get(id) as any) });
    }

    // Changing the email re-verifies it: a code goes to the NEW address first.
    case 'POST /me/email/start': {
      const { id } = authUser(req);
      limit(ip);
      const b = await readJson(req);
      const email = normContact(String(b.email ?? ''));
      if (!validEmail(email)) throw new HttpError(400, 'Enter a valid email address');
      const cur = q.userById.get(id) as any;
      if (email === cur.email) throw new HttpError(400, 'That is already your email');
      if (q.userByEmail.get(email) || q.userByContact.get(email)) throw new HttpError(409, 'That email is already used by another account.');
      await issueOtp('change_email', email, { id, email }, cur.name, `${id}`);
      return send(res, 200, { ok: true, email, expiresInSec: OTP_MIN * 60 });
    }

    case 'POST /me/email/verify': {
      const { id } = authUser(req);
      limit(ip);
      const p = checkOtp('change_email', id, String((await readJson(req)).otp ?? '').trim());
      if (p.id !== id) throw new HttpError(400, 'Request a new code.');
      if (q.userByEmail.get(p.email) || q.userByContact.get(p.email)) throw new HttpError(409, 'That email is already used by another account.');
      const before = (q.userById.get(id) as any)?.email as string | null;
      q.setEmail.run(p.email, p.email, id);
      if (before) void sendNotice(before, 'email_changed', p.email);
      return send(res, 200, { user: publicUser(q.userById.get(id) as any) });
    }

    case 'POST /me/password': {
      const { id } = authUser(req);
      limit(ip);
      const b = await readJson(req);
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
      lockCheck(`pw:${id}`);
      if (!pwOk(u, String(b.current ?? ''))) { lockFail(`pw:${id}`); throw new HttpError(401, 'Current password is wrong'); }
      lockClear(`pw:${id}`);
      checkPassword(String(b.next ?? ''));
      const { salt, hash } = hashNew(String(b.next));
      q.setPassword.run(hash, salt, id);
      if ((q.userById.get(id) as any)?.email) void sendNotice((q.userById.get(id) as any).email, 'password_changed');
      return send(res, 200, { ok: true });
    }

    case 'PUT /me/avatar': {
      const { id } = authUser(req);
      const image = String((await readJson(req)).image ?? '');
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_AVATAR) throw new HttpError(400, 'Choose a smaller JPEG or PNG photo');
      q.setAvatar.run(image, id);
      return send(res, 200, { user: publicUser(q.userById.get(id) as any) });
    }

    case 'DELETE /me/avatar': {
      const { id } = authUser(req);
      q.setAvatar.run(null, id);
      return send(res, 200, { user: publicUser(q.userById.get(id) as any) });
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
      const bad = list.findIndex((t) => !isTxn(t) || JSON.stringify(t).length > 32_000);
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
server.headersTimeout = 15_000;
server.maxHeadersCount = 50;
server.listen(PORT, '0.0.0.0', () => console.log(`paisa-api listening on :${PORT}`));
