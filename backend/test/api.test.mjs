// Integration tests: boots the real built server (dist/server.mjs) on a temp DB and drives every user-facing flow.
// Run: npm run build -w backend && npm test -w backend
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'paisa-test-'));
const DB = join(dir, 't.db');
const PORT = 4300 + Math.floor(Math.random() * 500);
const U = `http://127.0.0.1:${PORT}`;
const ADMIN_PW = 'admin-test-password-1';
let proc;

// A database created by the OLD app version (single `contact` column, no email/phone/avatar) to prove migration.
function seedLegacy() {
  const db = new DatabaseSync(DB);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
           CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
  return db;
}
import crypto from 'node:crypto';
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

before(async () => {
  const db = seedLegacy();
  for (const [id, name, contact] of [['legacy-mail', 'Old Mail', 'old@example.com'], ['legacy-phone', 'Old Phone', '9876500001']]) {
    const salt = 'aa'.repeat(16);
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id, name, contact, hashPw('oldpassword', salt), salt, new Date().toISOString());
  }
  db.close();
  proc = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT), DB_PATH: DB, ADMIN_PASSWORD: ADMIN_PW, NODE_NO_WARNINGS: '1', AUTH_RATE_LIMIT: '100000', SMTP_USER: '', SMTP_PASS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', (d) => { out += d; }); proc.stderr.on('data', (d) => { out += d; });
  proc.logs = () => out;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(U + '/health')).ok) return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start: ' + out);
});
after(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });

const call = async (m, p, b, h = {}) => { const r = await fetch(U + p, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, b: await r.json().catch(() => ({})), r }; };
const code = (email) => [...proc.logs().matchAll(new RegExp(`code for ${email.replace('.', '\\.')}: (\\d+)`, 'g'))].pop()?.[1];
const auth = (t) => ({ Authorization: 'Bearer ' + t });
const W = { email: 'asha@example.com', name: 'Asha Rao', phone: '9876543210', pw: 'password1' };
let token;

test('health + security headers', async () => {
  const { s, r } = await call('GET', '/health');
  assert.equal(s, 200);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('legacy accounts are migrated and can still log in (email + phone)', async () => {
  const a = await call('POST', '/auth/login', { contact: 'old@example.com', password: 'oldpassword' });
  assert.equal(a.s, 200); assert.equal(a.b.user.email, 'old@example.com'); assert.equal(a.b.user.emailVerified, true);
  const b = await call('POST', '/auth/login', { contact: '9876500001', password: 'oldpassword' });
  assert.equal(b.s, 200); assert.equal(b.b.user.phone, '9876500001'); assert.equal(b.b.user.email, null);
});

test('register: validation', async () => {
  assert.equal((await call('POST', '/auth/register/start', { name: 'A', email: W.email, password: W.pw })).s, 400);          // short name
  assert.equal((await call('POST', '/auth/register/start', { name: W.name, email: 'nope', password: W.pw })).s, 400);        // bad email
  assert.equal((await call('POST', '/auth/register/start', { name: W.name, email: W.email, password: 'short' })).s, 400);    // short password
  assert.equal((await call('POST', '/auth/register/start', { name: W.name, email: W.email, phone: '12345', password: W.pw })).s, 400); // bad phone
  assert.equal((await call('POST', '/auth/register/start', { name: W.name, email: 'old@example.com', password: W.pw })).s, 409);       // taken (legacy)
  assert.equal((await call('POST', '/auth/register/start', { name: W.name, email: W.email, phone: '9876500001', password: W.pw })).s, 409); // phone taken
  assert.equal((await call('POST', '/auth/register')).s, 410);                                                                // old endpoint retired
});

test('register: phone optional, OTP required, account only created after code', async () => {
  const st = await call('POST', '/auth/register/start', { name: W.name, email: W.email.toUpperCase(), phone: '98765 43210', password: W.pw });
  assert.equal(st.s, 200);
  // not yet an account
  assert.equal((await call('POST', '/auth/login', { contact: W.email, password: W.pw })).s, 401);
  // resend cooldown
  assert.equal((await call('POST', '/auth/register/resend', { email: W.email })).s, 429);
  // wrong code, counted
  const bad = await call('POST', '/auth/register/verify', { email: W.email, otp: '000000' });
  assert.equal(bad.s, 400); assert.match(bad.b.error, /4 tries left/);
  const ok = await call('POST', '/auth/register/verify', { email: W.email, otp: code(W.email) });
  assert.equal(ok.s, 201); token = ok.b.token;
  assert.equal(ok.b.user.email, W.email); assert.equal(ok.b.user.phone, W.phone); assert.equal(ok.b.user.emailVerified, true);
  // code is single-use
  assert.equal((await call('POST', '/auth/register/verify', { email: W.email, otp: '000000' })).s, 400);
});

test('register without phone works too', async () => {
  const e = 'nophone@example.com';
  await call('POST', '/auth/register/start', { name: 'No Phone', email: e, password: W.pw });
  const ok = await call('POST', '/auth/register/verify', { email: e, otp: code(e) });
  assert.equal(ok.s, 201); assert.equal(ok.b.user.phone, null);
});

test('OTP locks after 5 wrong tries', async () => {
  const e = 'brute@example.com';
  await call('POST', '/auth/register/start', { name: 'Brute Force', email: e, password: W.pw });
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/auth/register/verify', { email: e, otp: '111111' })).s, 400);
  const r = await call('POST', '/auth/register/verify', { email: e, otp: code(e) });
  assert.equal(r.s, 429);   // even the right code is refused once exhausted
});

test('login by email or phone, wrong password rejected', async () => {
  assert.equal((await call('POST', '/auth/login', { contact: W.email, password: W.pw })).s, 200);
  assert.equal((await call('POST', '/auth/login', { contact: '9876543210', password: W.pw })).s, 200);
  assert.equal((await call('POST', '/auth/login', { contact: W.email, password: 'nope' })).s, 401);
});

test('profile: GET/PATCH name + phone, duplicate phone refused, phone removable', async () => {
  const me = await call('GET', '/me', null, auth(token));
  assert.equal(me.b.user.name, W.name);
  assert.equal((await call('PATCH', '/me', { name: 'Asha R', phone: '9876500001' }, auth(token))).s, 409);
  const p = await call('PATCH', '/me', { name: 'Asha R', phone: '9123456789' }, auth(token));
  assert.equal(p.s, 200); assert.equal(p.b.user.name, 'Asha R'); assert.equal(p.b.user.phone, '9123456789');
  const rm = await call('PATCH', '/me', { phone: '' }, auth(token));
  assert.equal(rm.b.user.phone, null);
  assert.equal((await call('PATCH', '/me', { name: 'x' }, auth(token))).s, 400);
});

test('avatar: upload, reject non-image / oversize, remove', async () => {
  const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';
  assert.equal((await call('PUT', '/me/avatar', { image: img }, auth(token))).b.user.avatar, img);
  assert.equal((await call('PUT', '/me/avatar', { image: 'http://evil/x.jpg' }, auth(token))).s, 400);
  assert.equal((await call('PUT', '/me/avatar', { image: 'data:image/jpeg;base64,' + 'A'.repeat(500_000) }, auth(token))).s, 400);
  assert.equal((await call('DELETE', '/me/avatar', null, auth(token))).b.user.avatar, null);
});

test('change email requires code to the NEW address; old email stops working', async () => {
  const n = 'asha.new@example.com';
  assert.equal((await call('POST', '/me/email/start', { email: 'old@example.com' }, auth(token))).s, 409);
  assert.equal((await call('POST', '/me/email/start', { email: n }, auth(token))).s, 200);
  assert.equal((await call('POST', '/me/email/verify', { otp: '000000' }, auth(token))).s, 400);
  const ok = await call('POST', '/me/email/verify', { otp: code(n) }, auth(token));
  assert.equal(ok.s, 200); assert.equal(ok.b.user.email, n);
  assert.equal((await call('POST', '/auth/login', { contact: n, password: W.pw })).s, 200);
  assert.equal((await call('POST', '/auth/login', { contact: W.email, password: W.pw })).s, 401);
  W.email = n;
});

test('change password needs current password', async () => {
  assert.equal((await call('POST', '/me/password', { current: 'wrong', next: 'password2' }, auth(token))).s, 401);
  assert.equal((await call('POST', '/me/password', { current: W.pw, next: 'short' }, auth(token))).s, 400);
  assert.equal((await call('POST', '/me/password', { current: W.pw, next: 'password2' }, auth(token))).s, 200);
  W.pw = 'password2';
  assert.equal((await call('POST', '/auth/login', { contact: W.email, password: W.pw })).s, 200);
});

test('forgot password: no account enumeration, OTP reset, all sessions revoked', async () => {
  const unknown = await call('POST', '/auth/forgot', { email: 'ghost@example.com' });
  assert.equal(unknown.s, 200);                                             // same answer as for a real account
  assert.equal(code('ghost@example.com'), undefined);                       // …but nothing was sent
  assert.equal((await call('POST', '/auth/forgot', { email: W.email })).s, 200);
  assert.equal((await call('POST', '/auth/reset', { email: W.email, otp: '000000', password: 'newpassword3' })).s, 400);
  assert.equal((await call('POST', '/auth/reset', { email: W.email, otp: code(W.email), password: 'short' })).s, 400);
  // (short-password attempt consumed nothing: validated before the code)
  assert.equal((await call('POST', '/auth/reset', { email: W.email, otp: code(W.email), password: 'newpassword3' })).s, 200);
  assert.equal((await call('GET', '/me', null, auth(token))).s, 401);       // old session revoked
  assert.equal((await call('POST', '/auth/login', { contact: W.email, password: W.pw })).s, 401);
  const l = await call('POST', '/auth/login', { contact: W.email, password: 'newpassword3' });
  assert.equal(l.s, 200); token = l.b.token; W.pw = 'newpassword3';
});

test('sync + pull transactions, sign out everywhere', async () => {
  const t = { id: 't1', dayKey: '2026-11-06', occurredAt: '2026-11-06T10:00:00.000Z', fingerprint: 'fp1', amountPaise: 5000, direction: 'debit', status: 'confirmed' };
  assert.equal((await call('POST', '/transactions/sync', { transactions: [t] }, auth(token))).s, 200);
  assert.equal((await call('POST', '/transactions/sync', { transactions: [{ ...t, amountPaise: -1 }] }, auth(token))).s, 400);
  const pulled = await call('GET', '/transactions', null, auth(token));
  assert.equal(pulled.b.total, 1);
  const other = (await call('POST', '/auth/login', { contact: W.email, password: W.pw })).b.token;
  assert.equal((await call('POST', '/me/logout-all', null, auth(token))).s, 200);
  assert.equal((await call('GET', '/me', null, auth(token))).s, 401);
  assert.equal((await call('GET', '/me', null, auth(other))).s, 401);
  token = (await call('POST', '/auth/login', { contact: W.email, password: W.pw })).b.token;
});

test('feedback: validation, rate limit, stored with user', async () => {
  assert.equal((await call('POST', '/feedback', { message: 'hello there' })).s, 401);
  assert.equal((await call('POST', '/feedback', { message: 'hi' }, auth(token))).s, 400);
  assert.equal((await call('POST', '/feedback', { message: 'x'.repeat(2001) }, auth(token))).s, 400);
  const ok = await call('POST', '/feedback', { category: 'bug', rating: 2, message: 'The chart is slow to open.', appVersion: '0.6', device: 'android 14 · Pixel' }, auth(token));
  assert.equal(ok.s, 201);
  await call('POST', '/feedback', { category: 'weird', rating: 99, message: 'Unknown category falls back to other' }, auth(token));
  for (let i = 0; i < 3; i++) await call('POST', '/feedback', { message: 'filler feedback ' + i }, auth(token));
  assert.equal((await call('POST', '/feedback', { message: 'one too many in an hour' }, auth(token))).s, 429);
});

test('admin: feedback visible, filterable, status + delete, stats badge', async () => {
  const bad = await call('POST', '/admin/api/login', { password: 'wrong-password-123' });
  assert.equal(bad.s, 401);
  const lg = await fetch(U + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PW }) });
  assert.equal(lg.status, 200);
  const A = { Cookie: lg.headers.get('set-cookie').split(';')[0], 'X-Admin': '1' };
  assert.equal((await call('GET', '/admin/api/feedback')).s, 401);                      // needs admin session
  const all = await call('GET', '/admin/api/feedback', null, A);
  assert.ok(all.b.total >= 3); // invalid attempts also count toward the 5/hour limit
  assert.equal(all.b.unread, all.b.total);
  assert.equal(all.b.feedback.find((f) => f.category === 'bug').rating, 2);
  assert.equal(all.b.feedback.find((f) => f.message.startsWith('Unknown')).category, 'other');
  assert.equal(all.b.feedback.find((f) => f.message.startsWith('Unknown')).rating, null);
  assert.ok(all.b.feedback.every((f) => f.contact === W.email));
  assert.equal((await call('GET', '/admin/api/feedback?category=bug', null, A)).b.total, 1);
  assert.equal((await call('GET', '/admin/api/stats', null, A)).b.feedbackNew, all.b.total);
  const id = all.b.feedback[0].id;
  assert.equal((await call('PATCH', '/admin/api/feedback/' + id, { status: 'done' }, A)).s, 200);
  assert.equal((await call('PATCH', '/admin/api/feedback/' + id, { status: 'bogus' }, A)).s, 400);
  assert.equal((await call('GET', '/admin/api/feedback?status=done', null, A)).b.total, 1);
  assert.equal((await call('DELETE', '/admin/api/feedback/' + id, null, { Cookie: A.Cookie })).s, 403);   // CSRF header required
  assert.equal((await call('DELETE', '/admin/api/feedback/' + id, null, A)).s, 200);
  assert.equal((await call('DELETE', '/admin/api/feedback/' + id, null, A)).s, 404);
  const page = await (await fetch(U + '/admin', { headers: { Cookie: A.Cookie } })).text();
  assert.ok(page.includes('viewFeedback'));
});

test('festival themes: admin goes live, app config serves it, end date + validation', async () => {
  const lg = await fetch(U + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PW }) });
  const A = { Cookie: lg.headers.get('set-cookie').split(';')[0], 'X-Admin': '1' };
  assert.equal((await call('GET', '/config')).b.festival, null);                                   // default: nothing live
  const list = await call('GET', '/admin/api/festivals', null, A);
  assert.ok(list.b.festivals.length >= 12 && list.b.live === null);
  assert.equal((await call('PUT', '/admin/api/config', { festival: 'not-real' }, A)).s, 400);
  assert.equal((await call('PUT', '/admin/api/config', { festivalUntil: '12/11/2026' }, A)).s, 400);
  assert.equal((await call('PUT', '/admin/api/config', { festival: 'diwali', festivalUntil: '2099-01-01' }, A)).s, 200);
  const cfg = (await call('GET', '/config')).b.festival;
  assert.equal(cfg.id, 'diwali'); assert.equal(cfg.gradient.length, 3); assert.ok(cfg.particles.length > 0);
  assert.equal((await call('GET', '/admin/api/festivals', null, A)).b.live, 'diwali');
  await call('PUT', '/admin/api/config', { festivalUntil: '2020-01-01' }, A);                       // end date in the past => off
  assert.equal((await call('GET', '/config')).b.festival, null);
  await call('PUT', '/admin/api/config', { festival: 'holi', festivalUntil: '' }, A);
  assert.equal((await call('GET', '/config')).b.festival.id, 'holi');
  await call('PUT', '/admin/api/config', { festival: '' }, A);                                       // turned off
  assert.equal((await call('GET', '/config')).b.festival, null);
});

test('admin can create a verified account (used by the CI smoke test)', async () => {
  const lg = await fetch(U + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ADMIN_PW }) });
  const A = { Cookie: lg.headers.get('set-cookie').split(';')[0], 'X-Admin': '1' };
  assert.equal((await call('POST', '/admin/api/users', { name: 'Smoke', email: 'smoke@example.com', password: 'smoke-pass-1' })).s, 401);   // no admin session
  assert.equal((await call('POST', '/admin/api/users', { name: 'Smoke', email: 'smoke@example.com', password: 'short' }, A)).s, 400);
  assert.equal((await call('POST', '/admin/api/users', { name: 'Smoke', email: 'smoke@example.com', password: 'smoke-pass-1' }, A)).s, 201);
  assert.equal((await call('POST', '/admin/api/users', { name: 'Smoke', email: 'smoke@example.com', password: 'smoke-pass-1' }, A)).s, 409);
  const l = await call('POST', '/auth/login', { contact: 'smoke@example.com', password: 'smoke-pass-1' });
  assert.equal(l.s, 200); assert.equal(l.b.user.emailVerified, true);
});

test('production without a mail login refuses to pretend an OTP was sent', async () => {
  const port = PORT + 600;
  const p2 = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'prod.db'), NODE_ENV: 'production', AUTH_RATE_LIMIT: '100000', NODE_NO_WARNINGS: '1', SMTP_USER: '', SMTP_PASS: '' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    const r = await fetch(`http://127.0.0.1:${port}/auth/register/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'No Mail', email: 'nomail@example.com', password: 'password1' }) });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /not set up/);
    const f = await fetch(`http://127.0.0.1:${port}/auth/forgot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nomail@example.com' }) });
    assert.equal(f.status, 200);   // forgot stays uniform (no account enumeration) — it only errors when an account exists and mail is down
  } finally { p2.kill(); }
});

test('login lockout per account, unknown accounts throttled too', async () => {
  const id = 'victim@example.com';
  let lockedAt = 0;
  for (let i = 1; i <= 12 && !lockedAt; i++) { const r = await call('POST', '/auth/login', { contact: id, password: 'bad' + i }); if (r.s === 429) lockedAt = i; else assert.equal(r.s, 401); }
  assert.ok(lockedAt > 0 && lockedAt <= 9, 'locked at ' + lockedAt);
});

test('privacy + delete-account pages are public with CSP', async () => {
  for (const p of ['/privacy', '/delete-account']) {
    const r = await fetch(U + p); assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  }
});

test('delete account removes the user, their data and feedback', async () => {
  const del = await call('DELETE', '/me', null, auth(token));
  assert.equal(del.s, 200);
  assert.equal((await call('POST', '/auth/login', { contact: W.email, password: W.pw })).s, 401);
  const db = new DatabaseSync(DB, { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM txns').get().n, 0);
  db.close();
});
