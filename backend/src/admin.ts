import type http from 'node:http';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { DESIGNS, MOTIONS, MOTION_LABELS, resolveDesign } from '../../packages/core/src/index';
import adminHtml from './admin.html';

// Admin dashboard: served at /admin, JSON API at /admin/api/*.
// Disabled entirely unless the ADMIN_PASSWORD env var is set (>= 12 chars).

interface Ctx {
  db: DatabaseSync;
  HttpError: new (status: number, message: string) => Error & { status: number };
  send: (res: http.ServerResponse, status: number, body: unknown) => void;
  readJson: (req: http.IncomingMessage) => Promise<any>;
  limit: (ip: string, max?: number, windowMs?: number) => void;
  sha: (s: string) => string;
  hashPw: (pw: string, salt: string) => string;
  normContact: (c: string) => string;
  validContact: (c: string) => boolean;
  getConfig: () => Record<string, unknown>;
  CONFIG_DEFAULTS: Record<string, unknown>;
}

const ADMIN_SESSION_MS = 12 * 3600_000;
const COOKIE = 'paisa_admin';

export function createAdmin(ctx: Ctx) {
  const { db, HttpError, send, readJson, sha, hashPw, normContact, validContact, getConfig, CONFIG_DEFAULTS } = ctx;
  const PASSWORD = process.env.ADMIN_PASSWORD ?? '';
  const enabled = PASSWORD.length >= 12;
  if (!enabled) console.warn('ADMIN_PASSWORD not set (or shorter than 12 chars): admin dashboard is disabled');

  const sessions = new Map<string, number>(); // sha(token) -> expiry
  const failures = new Map<string, number[]>(); // ip -> failed-login timestamps
  const startedAt = Date.now();

  const audit = (action: string, target: string | null, detail: unknown, ip: string) =>
    db.prepare('INSERT INTO audit_log (at, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)')
      .run(new Date().toISOString(), action, target, detail == null ? null : JSON.stringify(detail), ip);

  const safeEq = (a: string, b: string) => {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  };

  const cookieToken = (req: http.IncomingMessage) => {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`).exec(req.headers.cookie ?? '');
    return m?.[1];
  };
  const isAuthed = (req: http.IncomingMessage) => {
    const t = cookieToken(req);
    if (!t) return false;
    const exp = sessions.get(sha(t));
    if (!exp || exp < Date.now()) { sessions.delete(sha(t)); return false; }
    return true;
  };

  /** Cookie gets the Secure flag whenever the browser reached us over HTTPS (Caddy sets X-Forwarded-Proto). */
  const secure = (req: http.IncomingMessage) => (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');
  const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const int = (v: string | null, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
  };
  const isDay = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const csvCell = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };

  function userRow(id: string) {
    return db.prepare(`SELECT id, name, contact, status, created_at, last_login_at FROM users WHERE id = ?`).get(id) as
      | { id: string; name: string; contact: string; status: string; created_at: string; last_login_at: string | null } | undefined;
  }
  function mustUser(id: string) {
    const u = userRow(id);
    if (!u) throw new HttpError(404, 'User not found');
    return u;
  }
  const revokeSessions = (id: string) => Number(db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id).changes);

  function stats() {
    const now = Date.now();
    const one = <T,>(sql: string, ...a: any[]) => db.prepare(sql).get(...a) as T;
    const all = <T,>(sql: string, ...a: any[]) => db.prepare(sql).all(...a) as T[];
    const day = (offset: number) => new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    const since = (d: number) => new Date(now - d * 86_400_000).toISOString();
    const users = one<{ total: number; active: number; suspended: number; d7: number; d30: number }>(
      `SELECT COUNT(*) total, SUM(status='active') active, SUM(status!='active') suspended,
              SUM(created_at >= ?) d7, SUM(created_at >= ?) d30 FROM users`, since(7), since(30));
    const t = one<{ total: number; debit: number | null; credit: number | null; review: number }>(
      `SELECT COUNT(*) total,
              SUM(CASE WHEN json_extract(json,'$.direction')='debit'  AND json_extract(json,'$.status')='confirmed' THEN json_extract(json,'$.amountPaise') END) debit,
              SUM(CASE WHEN json_extract(json,'$.direction')='credit' AND json_extract(json,'$.status')='confirmed' THEN json_extract(json,'$.amountPaise') END) credit,
              SUM(json_extract(json,'$.needsReview') = 1) review FROM txns`);
    const signups = all<{ d: string; n: number }>(`SELECT substr(created_at,1,10) d, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY d`, since(14));
    const perDay = all<{ d: string; n: number }>(`SELECT day_key d, COUNT(*) n FROM txns WHERE day_key >= ? GROUP BY d`, day(13));
    const series = (rows: { d: string; n: number }[]) => {
      const m = new Map(rows.map((r) => [r.d, r.n]));
      return Array.from({ length: 14 }, (_, i) => { const d = day(13 - i); return { day: d, count: m.get(d) ?? 0 }; });
    };
    const byApp = all<{ k: string | null; n: number; amt: number }>(
      `SELECT json_extract(json,'$.paymentApp') k, COUNT(*) n, SUM(json_extract(json,'$.amountPaise')) amt FROM txns
       WHERE json_extract(json,'$.direction')='debit' AND json_extract(json,'$.status')='confirmed' GROUP BY k ORDER BY amt DESC`);
    const byCategory = all<{ k: string | null; n: number; amt: number }>(
      `SELECT json_extract(json,'$.categoryId') k, COUNT(*) n, SUM(json_extract(json,'$.amountPaise')) amt FROM txns
       WHERE json_extract(json,'$.direction')='debit' AND json_extract(json,'$.status')='confirmed' GROUP BY k ORDER BY amt DESC LIMIT 12`);
    const activeSessions = one<{ n: number }>('SELECT COUNT(*) n FROM sessions WHERE expires_at > ?', now).n;
    const dbPages = one<{ page_count: number; page_size: number }>(`SELECT (SELECT page_count FROM pragma_page_count) page_count, (SELECT page_size FROM pragma_page_size) page_size`);
    return {
      feedbackNew: one<{ n: number }>("SELECT COUNT(*) n FROM feedback WHERE status = 'new'").n,
      users: { total: users.total, active: users.active ?? 0, suspended: users.suspended ?? 0, last7d: users.d7 ?? 0, last30d: users.d30 ?? 0 },
      transactions: { total: t.total, debitPaise: t.debit ?? 0, creditPaise: t.credit ?? 0, needsReview: t.review ?? 0 },
      activeSessions,
      signups: series(signups),
      transactionsPerDay: series(perDay),
      byApp: byApp.map((r) => ({ key: r.k ?? 'unknown', count: r.n, paise: r.amt ?? 0 })),
      byCategory: byCategory.map((r) => ({ key: r.k ?? 'uncategorized', count: r.n, paise: r.amt ?? 0 })),
      server: { uptimeSec: Math.round((Date.now() - startedAt) / 1000), node: process.version, dbBytes: dbPages.page_count * dbPages.page_size, memoryMb: Math.round(process.memoryUsage().rss / 1048576) },
      config: getConfig(),
    };
  }

  function listUsers(p: URLSearchParams) {
    const search = (p.get('search') ?? '').trim();
    const status = p.get('status');
    const limitN = int(p.get('limit'), 50, 1, 200);
    const offset = int(p.get('offset'), 0, 0, 1e9);
    const where: string[] = [];
    const args: any[] = [];
    if (search) { where.push(`(u.name LIKE ? ESCAPE '\\' OR u.contact LIKE ? ESCAPE '\\' OR u.id = ?)`); args.push(like(search), like(search), search); }
    if (status === 'active' || status === 'suspended') { where.push('u.status = ?'); args.push(status); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (db.prepare(`SELECT COUNT(*) n FROM users u ${w}`).get(...args) as { n: number }).n;
    const rows = db.prepare(`
      SELECT u.id, u.name, u.contact, u.status, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM txns t WHERE t.user_id = u.id) txn_count,
        (SELECT MAX(updated_at) FROM txns t WHERE t.user_id = u.id) last_sync,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) sessions
      FROM users u ${w} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(Date.now(), ...args, limitN, offset);
    return { total, users: rows };
  }

  const shapeTxn = (r: { user_id: string; id: string; json: string; contact?: string; name?: string }) => {
    let t: any = {};
    try { t = JSON.parse(r.json); } catch { /* corrupt row: show what we have */ }
    return {
      userId: r.user_id, userName: r.name, userContact: r.contact, id: r.id, dayKey: t.dayKey, occurredAt: t.occurredAt,
      direction: t.direction, amountPaise: t.amountPaise, status: t.status, kind: t.kind, merchant: t.merchant,
      categoryId: t.categoryId, paymentApp: t.paymentApp, channel: t.channel, needsReview: !!t.needsReview, reference: t.reference ?? null,
    };
  };

  function listTxns(p: URLSearchParams) {
    const where: string[] = [];
    const args: any[] = [];
    const search = (p.get('search') ?? '').trim();
    if (search) { where.push(`(json_extract(t.json,'$.merchant') LIKE ? ESCAPE '\\' OR json_extract(t.json,'$.reference') LIKE ? ESCAPE '\\')`); args.push(like(search), like(search)); }
    const user = p.get('user'); if (user) { where.push('t.user_id = ?'); args.push(user); }
    const dir = p.get('direction'); if (dir === 'debit' || dir === 'credit') { where.push(`json_extract(t.json,'$.direction') = ?`); args.push(dir); }
    const st = p.get('status'); if (st && /^[a-z_]{1,20}$/.test(st)) { where.push(`json_extract(t.json,'$.status') = ?`); args.push(st); }
    if (p.get('review') === '1') where.push(`json_extract(t.json,'$.needsReview') = 1`);
    const from = p.get('from'); if (isDay(from)) { where.push('t.day_key >= ?'); args.push(from); }
    const to = p.get('to'); if (isDay(to)) { where.push('t.day_key <= ?'); args.push(to); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitN = int(p.get('limit'), 50, 1, 200);
    const offset = int(p.get('offset'), 0, 0, 1e9);
    const total = (db.prepare(`SELECT COUNT(*) n FROM txns t ${w}`).get(...args) as { n: number }).n;
    const rows = db.prepare(`SELECT t.user_id, t.id, t.json, u.name, u.contact FROM txns t JOIN users u ON u.id = t.user_id ${w}
      ORDER BY t.occurred_at DESC LIMIT ? OFFSET ?`).all(...args, limitN, offset) as any[];
    return { total, transactions: rows.map(shapeTxn) };
  }

  const CONFIG_TYPES: Record<string, 'boolean' | 'string'> = {
    registrationsOpen: 'boolean', syncEnabled: 'boolean', maintenanceMode: 'boolean',
    maintenanceMessage: 'string', announcement: 'string', minAppVersion: 'string', uiDesign: 'string', uiMotion: 'string',
  };

  async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ip: string) {
    const path = url.pathname.slice('/admin/api'.length) || '/';
    const method = req.method ?? 'GET';
    const p = url.searchParams;

    if (method === 'POST' && path === '/login') {
      const now = Date.now();
      const recent = (failures.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
      if (recent.length >= 5) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
      const b = await readJson(req);
      if (!safeEq(String(b.password ?? ''), PASSWORD)) {
        recent.push(now); failures.set(ip, recent);
        audit('admin.login_failed', null, null, ip);
        throw new HttpError(401, 'Wrong admin password');
      }
      failures.delete(ip);
      for (const [k, exp] of sessions) if (exp < now) sessions.delete(k);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(sha(token), now + ADMIN_SESSION_MS);
      audit('admin.login', null, null, ip);
      res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_MS / 1000}${secure(req)}`);
      return send(res, 200, { ok: true });
    }

    if (!isAuthed(req)) throw new HttpError(401, 'Admin sign-in required');
    // CSRF: state-changing calls must carry a custom header a cross-site form cannot send (cookie is also SameSite=Strict).
    if (method !== 'GET' && req.headers['x-admin'] !== '1') throw new HttpError(403, 'Missing X-Admin header');

    if (method === 'POST' && path === '/logout') {
      const t = cookieToken(req); if (t) sessions.delete(sha(t));
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure(req)}`);
      return send(res, 200, { ok: true });
    }
    if (method === 'GET' && path === '/session') return send(res, 200, { ok: true });
    if (method === 'GET' && path === '/stats') return send(res, 200, stats());

    if (method === 'GET' && path === '/users') return send(res, 200, listUsers(p));

    if (method === 'GET' && path === '/users.csv') {
      const rows = db.prepare(`SELECT u.id, u.name, u.contact, u.status, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM txns t WHERE t.user_id = u.id) txns FROM users u ORDER BY u.created_at`).all() as any[];
      const head = ['id', 'name', 'contact', 'status', 'created_at', 'last_login_at', 'transactions'];
      const csv = [head.join(','), ...rows.map((r) => [r.id, r.name, r.contact, r.status, r.created_at, r.last_login_at, r.txns].map(csvCell).join(','))].join('\n');
      audit('users.export', null, { rows: rows.length }, ip);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="paisa-users.csv"', 'Cache-Control': 'no-store' });
      return void res.end(csv);
    }

    const um = /^\/users\/([0-9a-f-]{36})(?:\/([a-z-]+))?$/.exec(path);
    if (um) {
      const id = um[1]!;
      const sub = um[2];
      if (method === 'GET' && !sub) {
        const u = mustUser(id);
        const sess = db.prepare('SELECT substr(token_hash,1,12) id, created_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC').all(id, Date.now());
        const recent = db.prepare('SELECT user_id, id, json FROM txns WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 25').all(id) as any[];
        const agg = db.prepare(`SELECT COUNT(*) n,
          SUM(CASE WHEN json_extract(json,'$.direction')='debit'  AND json_extract(json,'$.status')='confirmed' THEN json_extract(json,'$.amountPaise') END) debit,
          SUM(CASE WHEN json_extract(json,'$.direction')='credit' AND json_extract(json,'$.status')='confirmed' THEN json_extract(json,'$.amountPaise') END) credit,
          MIN(day_key) first_day, MAX(day_key) last_day FROM txns WHERE user_id = ?`).get(id) as any;
        return send(res, 200, {
          user: u, sessions: sess, recentTransactions: recent.map(shapeTxn),
          totals: { count: agg.n, debitPaise: agg.debit ?? 0, creditPaise: agg.credit ?? 0, firstDay: agg.first_day, lastDay: agg.last_day },
        });
      }
      if (method === 'PATCH' && !sub) {
        const u = mustUser(id);
        const b = await readJson(req);
        const name = b.name === undefined ? u.name : String(b.name).trim();
        const contact = b.contact === undefined ? u.contact : normContact(String(b.contact));
        if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Name must be 2-80 characters');
        if (!validContact(contact)) throw new HttpError(400, 'Enter a valid 10-digit mobile number or email');
        const clash = db.prepare('SELECT id FROM users WHERE contact = ? AND id != ?').get(contact, id);
        if (clash) throw new HttpError(409, 'Another account already uses that contact');
        db.prepare('UPDATE users SET name = ?, contact = ? WHERE id = ?').run(name, contact, id);
        if (contact !== u.contact) db.prepare(contact.includes('@') ? 'UPDATE users SET email = ?, email_verified = 1 WHERE id = ?' : 'UPDATE users SET phone = ? WHERE id = ?').run(contact, id);
        audit('user.edit', id, { from: { name: u.name, contact: u.contact }, to: { name, contact } }, ip);
        return send(res, 200, { user: userRow(id) });
      }
      if (method === 'POST' && (sub === 'suspend' || sub === 'unsuspend')) {
        mustUser(id);
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(sub === 'suspend' ? 'suspended' : 'active', id);
        const revoked = sub === 'suspend' ? revokeSessions(id) : 0;
        audit(`user.${sub}`, id, { revoked }, ip);
        return send(res, 200, { user: userRow(id), revokedSessions: revoked });
      }
      if (method === 'POST' && sub === 'logout') {
        mustUser(id);
        const revoked = revokeSessions(id);
        audit('user.force_logout', id, { revoked }, ip);
        return send(res, 200, { revokedSessions: revoked });
      }
      if (method === 'POST' && sub === 'reset-password') {
        mustUser(id);
        const b = await readJson(req);
        const generated = b.password === undefined || b.password === '';
        const password = generated ? crypto.randomBytes(9).toString('base64url') : String(b.password);
        if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be at least 8 characters');
        const salt = crypto.randomBytes(16).toString('hex');
        db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hashPw(password, salt), salt, id);
        const revoked = revokeSessions(id);
        audit('user.reset_password', id, { generated, revoked }, ip);
        return send(res, 200, { password: generated ? password : undefined, revokedSessions: revoked });
      }
      if (method === 'DELETE' && sub === 'transactions') {
        mustUser(id);
        const n = Number(db.prepare('DELETE FROM txns WHERE user_id = ?').run(id).changes);
        audit('user.clear_transactions', id, { deleted: n }, ip);
        return send(res, 200, { deleted: n });
      }
      if (method === 'DELETE' && !sub) {
        const u = mustUser(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        audit('user.delete', id, { name: u.name, contact: u.contact }, ip);
        return send(res, 200, { ok: true });
      }
    }

    if (method === 'GET' && path === '/transactions') return send(res, 200, listTxns(p));
    const tm = /^\/transactions\/([0-9a-f-]{36})\/([^/]{1,100})$/.exec(path);
    if (tm && method === 'DELETE') {
      const n = Number(db.prepare('DELETE FROM txns WHERE user_id = ? AND id = ?').run(tm[1]!, decodeURIComponent(tm[2]!)).changes);
      if (!n) throw new HttpError(404, 'Transaction not found');
      audit('txn.delete', tm[1]!, { id: decodeURIComponent(tm[2]!) }, ip);
      return send(res, 200, { ok: true });
    }

    if (method === 'GET' && path === '/feedback') {
      const status = p.get('status'), category = p.get('category');
      const limitN = int(p.get('limit'), 25, 1, 100), offset = int(p.get('offset'), 0, 0, 1e9);
      const where: string[] = [], args: any[] = [];
      if (status && ['new', 'read', 'done'].includes(status)) { where.push('f.status = ?'); args.push(status); }
      if (category && ['idea', 'bug', 'praise', 'other'].includes(category)) { where.push('f.category = ?'); args.push(category); }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = (db.prepare(`SELECT COUNT(*) n FROM feedback f ${w}`).get(...args) as { n: number }).n;
      const rows = db.prepare(`SELECT f.id, f.category, f.rating, f.message, f.app_version, f.device, f.status, f.created_at, u.id user_id, u.name, u.contact
        FROM feedback f JOIN users u ON u.id = f.user_id ${w} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`).all(...args, limitN, offset);
      const avg = (db.prepare('SELECT AVG(rating) a, COUNT(rating) n FROM feedback WHERE rating IS NOT NULL').get() as { a: number | null; n: number });
      const unread = (db.prepare("SELECT COUNT(*) n FROM feedback WHERE status = 'new'").get() as { n: number }).n;
      return send(res, 200, { total, feedback: rows, unread, avgRating: avg.a, ratings: avg.n });
    }
    const fm = /^\/feedback\/(\d{1,12})$/.exec(path);
    if (fm && method === 'PATCH') {
      const st = String((await readJson(req)).status ?? '');
      if (!['new', 'read', 'done'].includes(st)) throw new HttpError(400, 'Invalid status');
      const n = Number(db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(st, Number(fm[1])).changes);
      if (!n) throw new HttpError(404, 'Feedback not found');
      return send(res, 200, { ok: true });
    }
    if (fm && method === 'DELETE') {
      const n = Number(db.prepare('DELETE FROM feedback WHERE id = ?').run(Number(fm[1])).changes);
      if (!n) throw new HttpError(404, 'Feedback not found');
      audit('feedback.delete', fm[1]!, null, ip);
      return send(res, 200, { ok: true });
    }

    if (method === 'GET' && path === '/sessions') {
      const rows = db.prepare(`SELECT substr(s.token_hash,1,12) id, s.created_at, s.expires_at, u.id user_id, u.name, u.contact
        FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.expires_at > ? ORDER BY s.created_at DESC LIMIT 500`).all(Date.now());
      return send(res, 200, { sessions: rows });
    }
    const sm = /^\/sessions\/([0-9a-f]{12})$/.exec(path);
    if (sm && method === 'DELETE') {
      const n = Number(db.prepare('DELETE FROM sessions WHERE substr(token_hash,1,12) = ?').run(sm[1]!).changes);
      audit('session.revoke', sm[1]!, null, ip);
      return send(res, 200, { revoked: n });
    }

    if (method === 'GET' && path === '/designs') {
      const c = getConfig();
      return send(res, 200, { designs: DESIGNS, motions: Object.entries(MOTIONS).map(([id, spec]) => ({ id, label: MOTION_LABELS[id as keyof typeof MOTIONS], spec })), active: resolveDesign(c.uiDesign as string, c.uiMotion as string).id, motion: c.uiMotion });
    }
    if (method === 'GET' && path === '/config') return send(res, 200, { config: getConfig() });
    if (method === 'PUT' && path === '/config') {
      const b = await readJson(req);
      const changes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) {
        const type = CONFIG_TYPES[k];
        if (!type) throw new HttpError(400, `Unknown setting: ${k}`);
        if (typeof v !== type) throw new HttpError(400, `${k} must be a ${type}`);
        if (k === 'uiDesign' && !DESIGNS.some((d) => d.id === v)) throw new HttpError(400, 'Unknown design');
        if (k === 'uiMotion' && v !== '' && !(v as string in MOTIONS)) throw new HttpError(400, 'Unknown animation style');
        if (type === 'string' && (v as string).length > 500) throw new HttpError(400, `${k} is too long (max 500 chars)`);
        changes[k] = type === 'string' ? (v as string).trim() : v;
      }
      const up = db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(changes)) up.run(k, JSON.stringify(v));
      audit('config.update', null, changes, ip);
      return send(res, 200, { config: getConfig() });
    }

    if (method === 'GET' && path === '/audit') {
      const limitN = int(p.get('limit'), 100, 1, 500);
      const offset = int(p.get('offset'), 0, 0, 1e9);
      const total = (db.prepare('SELECT COUNT(*) n FROM audit_log').get() as { n: number }).n;
      const rows = db.prepare('SELECT id, at, action, target, detail, ip FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limitN, offset);
      return send(res, 200, { total, entries: rows });
    }

    throw new HttpError(404, 'Not found');
  }

  return {
    CONFIG_DEFAULTS,
    /** Returns true when the request was an admin route and has been answered. */
    async handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ip: string): Promise<boolean> {
      if (!enabled) throw new HttpError(404, 'Not found');
      if (url.pathname === '/admin' || url.pathname === '/admin/') {
        if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
        const nonce = crypto.randomBytes(16).toString('base64');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Frame-Options': 'DENY',
          ...(req.headers['x-forwarded-proto'] === 'https' ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex, nofollow',
          'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        });
        res.end(adminHtml.replaceAll('__NONCE__', nonce));
        return true;
      }
      if (url.pathname.startsWith('/admin/api/')) {
        try {
          await api(req, res, url, ip);
        } catch (e) {
          if (e instanceof HttpError) return send(res, e.status, { error: e.message }), true;
          throw e;
        }
        return true;
      }
      return false;
    },
  };
}
