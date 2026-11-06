import { AppState } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { attributeApps, buildDashboard, ingestBatch, type Dashboard, type RawTransaction, type Transaction } from '@upi/core';
import * as db from './db';
import { ensureNotifyPermission, ensureReceiveSms, hasSmsPermission, lockScreenCardEnabled, postNotification, pushWidget, readInbox } from './inbox';
import { dedupeNear } from './dedupe';
import { DEFAULT_PREFS, PERIOD_LABEL, dueAlerts, spentIn, statuses, tightest, type Limits, type Notif, type Period, type Prefs } from './budgets';
import * as api from './api';

export interface SyncResult { added: number; scannedSms: number; message: string }

interface StoreCtx {
  ready: boolean;
  txns: Transaction[];
  dashboard: Dashboard;
  budgetPaise: number | null;
  limits: Limits;
  setLimit: (p: Period, paise: number | null) => Promise<void>;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => Promise<void>;
  notifs: Notif[];
  clearNotifs: () => Promise<void>;
  testAlert: () => Promise<boolean>;
  isDemo: boolean;
  error: string | null;
  now: Date;
  refresh: () => Promise<void>;
  addManual: (raw: Omit<RawTransaction, 'source'>) => Promise<{ ok: boolean; message: string }>;
  setBudget: (paise: number) => Promise<void>;
  removeTxn: (id: string) => Promise<void>;
  reset: () => Promise<void>;
  /** Pull new bank SMS + payment-app notifications from this device. */
  /** `auto` = background poll: skips all work (and UI churn) when nothing new has arrived. */
  syncDevice: (auto?: boolean) => Promise<SyncResult>;
  lastSync: number | null;
  /** Server backup state. */
  /** `offline`: the last backup failed because the server couldn't be reached (no internet). Local data keeps working. */
  server: { state: 'idle' | 'syncing' | 'ok' | 'error'; message: string | null; at: number | null; offline?: boolean };
  pushToServer: () => Promise<boolean>;
  pullFromServer: () => Promise<number>;
}
const Ctx = createContext<StoreCtx>(null as never);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [budgetPaise, setBudgetPaise] = useState<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [limits, setLimits] = useState<Limits>({ day: null, week: null, month: null });
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [server, setServer] = useState<StoreCtx['server']>({ state: 'idle', message: null, at: null });

  const refresh = useCallback(async () => {
    try {
      const [all, b, demo] = await Promise.all([db.loadAll(), db.getMeta('budget'), db.getMeta('demo')]);
      setTxns(all);
      setBudgetPaise(b ? Number(b) : null);
      setIsDemo(demo === '1');
      const [ld, lw, pj, nj] = await Promise.all([db.getMeta('limit_day'), db.getMeta('limit_week'), db.getMeta('prefs'), db.getMeta('notifs')]);
      setLimits({ day: Number(ld) || null, week: Number(lw) || null, month: Number(b) || null });
      setPrefsState({ ...DEFAULT_PREFS, ...(pj ? JSON.parse(pj) : {}) });
      setNotifs(nj ? JSON.parse(nj) : []);
      const ls = await db.getMeta('lastSync');
      setLastSync(ls ? Number(ls) : null);
      setNow(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addManual = useCallback<StoreCtx['addManual']>(async (raw) => {
    const at = new Date();
    const existing = await db.loadAll();
    const { results, store } = ingestBatch([{ ...raw, source: 'manual' }], { existing, consents: [], now: at });
    const r = results[0]!;
    if (r.outcome === 'rejected') return { ok: false, message: r.reason };
    await db.upsertMany(store);
    await refresh();
    pushToServer();
    return { ok: true, message: r.outcome === 'merged' ? 'Matched an existing transaction — not counted twice.' : 'Transaction saved.' };
  }, [refresh]);

  const removeTxn = useCallback(async (id: string) => { await db.deleteMany([id]); await refresh(); pushToServer([id]); }, [refresh]);
  const setBudget = useCallback(async (paise: number) => { await db.setMeta('budget', String(paise)); await refresh(); }, [refresh]);
  const setLimit = useCallback(async (p: Period, paise: number | null) => {
    if (p === 'month') { if (paise) await db.setMeta('budget', String(paise)); else await db.setMeta('budget', '0'); }
    else await db.setMeta(`limit_${p}`, String(paise ?? 0));
    if (paise) await ensureNotifyPermission(); // ask once, at the moment it matters
    await refresh();
  }, [refresh]);
  const setPrefs = useCallback(async (patch: Partial<Prefs>) => {
    await db.setMeta('prefs', JSON.stringify({ ...prefs, ...patch }));
    if (patch.alerts) await ensureNotifyPermission();
    await refresh();
  }, [prefs, refresh]);
  const clearNotifs = useCallback(async () => { await db.setMeta('notifs', '[]'); await refresh(); }, [refresh]);
  const testAlert = useCallback(async () => {
    const ok = await ensureNotifyPermission();
    if (ok) postNotification('Paisa alerts are on 🔔', 'You will hear this sound when a budget is crossed.', 9000, prefs.sound);
    return ok;
  }, [prefs.sound]);
  const reset = useCallback(async () => { await db.clearAll(); await refresh(); }, [refresh]);

  const pushing = useRef(false);
  /** Best-effort backup of everything to the API. Failed deletions are remembered and retried. */
  const pushToServer = useCallback(async (newDeletes: string[] = []) => {
    if (pushing.current) return false;
    if (!(await api.getToken())) return false;
    pushing.current = true;
    setServer((s) => ({ ...s, state: 'syncing' }));
    try {
      const pending: string[] = JSON.parse((await db.getMeta('pendingDeletes')) ?? '[]');
      const deletes = [...new Set([...pending, ...newDeletes])];
      await api.pushTransactions(await db.loadAll(), deletes);
      await db.setMeta('pendingDeletes', '[]');
      setServer({ state: 'ok', message: null, at: Date.now(), offline: false });
      return true;
    } catch (e) {
      const pend: string[] = JSON.parse((await db.getMeta('pendingDeletes')) ?? '[]');
      await db.setMeta('pendingDeletes', JSON.stringify([...new Set([...pend, ...newDeletes])]));
      setServer({ state: 'error', message: (e as Error).message, at: Date.now(), offline: (e as api.ApiError).status === 0 });
      return false;
    } finally { pushing.current = false; }
  }, []);

  /** Restore/merge the account's transactions from the server (used after sign-in). */
  const pullFromServer = useCallback(async () => {
    const r = await api.pullTransactions();
    const real = r.transactions.filter((t) => !t.accountId.startsWith('demo-'));
    if (real.length) await db.upsertMany(real);
    await refresh();
    return real.length;
  }, [refresh]);

  const syncing = useRef(false);
  const syncDevice = useCallback<StoreCtx['syncDevice']>(async (auto = false) => {
    if (syncing.current) return { added: 0, scannedSms: 0, message: 'Sync already running' };
    syncing.current = true;
    try {
      const at = new Date();
      const since = Number((await db.getMeta('smsCursor')) ?? 0);
      const batch = await readInbox(since);
      if (auto && !batch.sms.length && !batch.notifications.length) {
        if (batch.newestSmsAt > since) await db.setMeta('smsCursor', String(batch.newestSmsAt)); // skip past non-bank SMS
        return { added: 0, scannedSms: batch.scannedSms, message: 'Nothing new.' };
      }
      // First real data replaces sample data so demo and real numbers are never mixed.
      if ((await db.getMeta('demo')) === '1' && (batch.sms.length || batch.notifications.length)) {
        await db.clearTxns();
        await db.setMeta('demo', '0');
      }
      const existing = await db.loadAll();
      const consents = [{ id: 'device', accountId: '*', sources: ['notification' as const], status: 'active' as const }];
      const first = ingestBatch([...batch.sms, ...batch.notifications], { existing, consents, now: at });
      const all = [...existing.filter((e) => !first.store.some((s) => s.id === e.id)), ...first.store];
      const { update, remove } = attributeApps(all);
      await db.upsertMany([...first.store.filter((t) => !update.some((u) => u.id === t.id)), ...update]);
      await db.deleteMany(remove);
      // Collapse double bank SMS for one payment (also cleans up duplicates stored by earlier versions).
      const dd = dedupeNear(await db.loadAll());
      if (dd.update.length) await db.upsertMany(dd.update);
      if (dd.remove.length) await db.deleteMany(dd.remove);
      remove.push(...dd.remove);
      await db.setMeta('smsCursor', String(batch.newestSmsAt));
      await db.setMeta('lastSync', String(Date.now()));
      await refresh();
      pushToServer(remove);
      const added = batch.sms.length + batch.notifications.length;
      return { added, scannedSms: batch.scannedSms, message: added ? `Read ${batch.scannedSms} SMS, found ${batch.sms.length} bank alerts${batch.notifications.length ? ` and ${batch.notifications.length} app notifications` : ''}.` : 'Nothing new.' };
    } finally {
      syncing.current = false;
    }
  }, [refresh, pushToServer]);

  const dashboard = useMemo(
    () => buildDashboard(txns, now, budgetPaise ? { monthlyPaise: budgetPaise } : undefined),
    [txns, now, budgetPaise],
  );

  // Live data only: drop any leftover sample data, then read the phone's SMS on every launch once permission is granted.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        if ((await db.getMeta('demo')) === '1') { await db.clearTxns(); await db.setMeta('demo', '0'); await refresh(); }
        // Sample records from old builds (possibly restored from the server) never belong in real data.
        const sample = (await db.loadAll()).filter((t) => t.accountId.startsWith('demo-')).map((t) => t.id);
        if (sample.length) { await db.deleteMany(sample); await refresh(); pushToServer(sample); }
        if (await hasSmsPermission()) { await ensureReceiveSms(); await syncDevice(); }
        if (await lockScreenCardEnabled()) await ensureNotifyPermission(); // the lock-screen card is a notification
      } catch { /* the Sync card shows errors on manual sync */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Offline-first: everything is read from SMS and stored on the phone, so the app works with no internet.
  // Any backup that failed (usually: no connection) is retried automatically until it succeeds.
  const serverRef = useRef(server);
  serverRef.current = server;
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const retry = () => { if (serverRef.current.state === 'error') pushToServer().catch(() => {}); };
    const start = () => { if (!timer) { retry(); timer = setInterval(retry, 20_000); } };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (st) => (st === 'active' ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [ready, pushToServer]);

  // Live updates: a new bank SMS / payment notification shows up on its own, no pull-to-refresh needed.
  // Polls every few seconds while the app is on screen (cheap: only SMS newer than the cursor are read)
  // and catches up immediately when the app returns from the background.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => { syncDevice(true).catch(() => {}); };
    const start = () => { if (!timer) { tick(); timer = setInterval(tick, 4000); } };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (st) => (st === 'active' ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [ready, syncDevice]);

  // Fire budget alerts (once per day/week/month per level) whenever the numbers change.
  useEffect(() => {
    if (!ready || !prefs.alerts) return;
    (async () => {
      const due = dueAlerts(statuses(txns, limits, now), now, prefs);
      if (!due.length) return;
      const seen: Record<string, 1> = JSON.parse((await db.getMeta('alerted')) ?? '{}');
      const fresh = due.filter((a) => !seen[a.key]);
      if (!fresh.length) return;
      const log: Notif[] = JSON.parse((await db.getMeta('notifs')) ?? '[]');
      for (const a of fresh) {
        seen[a.key] = 1;
        const id = Date.now() % 100000 + log.length;
        postNotification(a.title, a.body, id, prefs.sound, a.level);
        log.unshift({ id, at: Date.now(), title: a.title, body: a.body, period: a.period, level: a.level });
      }
      await db.setMeta('alerted', JSON.stringify(Object.fromEntries(Object.keys(seen).slice(-200).map((k) => [k, 1]))));
      await db.setMeta('notifs', JSON.stringify(log.slice(0, 50)));
      setNotifs(log.slice(0, 50));
    })().catch(() => {});
  }, [ready, txns, limits, prefs, now]);

  // Keep the home-screen widget in step with the dashboard.
  useEffect(() => {
    if (!ready) return;
    const t = tightest(statuses(txns, limits, now));
    pushWidget(dashboard.today.expensePaise, dashboard.today.incomePaise, dashboard.month.expensePaise, spentIn(txns, 'week', now), t ? t.pct : null, t ? PERIOD_LABEL[t.period] : '', dashboard.today.dayKey);
  }, [ready, dashboard, txns, limits, now]);

  const value = useMemo(
    () => ({ ready, txns, dashboard, budgetPaise, limits, setLimit, prefs, setPrefs, notifs, clearNotifs, testAlert, isDemo, error, now, refresh, addManual, setBudget, removeTxn, reset, syncDevice, lastSync, server, pushToServer, pullFromServer }),
    [ready, txns, dashboard, budgetPaise, limits, setLimit, prefs, setPrefs, notifs, clearNotifs, testAlert, isDemo, error, now, refresh, addManual, setBudget, removeTxn, reset, syncDevice, lastSync, server, pushToServer, pullFromServer],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);
