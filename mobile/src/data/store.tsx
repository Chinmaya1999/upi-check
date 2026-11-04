import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { attributeApps, buildDashboard, generateDemoRaw, ingestBatch, type Dashboard, type RawTransaction, type Transaction } from '@upi/core';
import * as db from './db';
import { pushWidget, readInbox } from './inbox';
import * as api from './api';

export interface SyncResult { added: number; scannedSms: number; message: string }

interface StoreCtx {
  ready: boolean;
  txns: Transaction[];
  dashboard: Dashboard;
  budgetPaise: number | null;
  isDemo: boolean;
  error: string | null;
  now: Date;
  refresh: () => Promise<void>;
  loadDemo: () => Promise<void>;
  addManual: (raw: Omit<RawTransaction, 'source'>) => Promise<{ ok: boolean; message: string }>;
  setBudget: (paise: number) => Promise<void>;
  reset: () => Promise<void>;
  /** Pull new bank SMS + payment-app notifications from this device. */
  syncDevice: () => Promise<SyncResult>;
  lastSync: number | null;
  /** Server backup state. */
  server: { state: 'idle' | 'syncing' | 'ok' | 'error'; message: string | null; at: number | null };
  pushToServer: () => Promise<boolean>;
  pullFromServer: () => Promise<number>;
}
const Ctx = createContext<StoreCtx>(null as never);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [budgetPaise, setBudgetPaise] = useState<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);
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

  const loadDemo = useCallback(async () => {
    const at = new Date();
    const { store } = ingestBatch(generateDemoRaw(at), { existing: await db.loadAll(), consents: [], now: at });
    await db.upsertMany(store);
    await db.setMeta('demo', '1');
    if (!(await db.getMeta('budget'))) await db.setMeta('budget', String(4000000));
    await refresh();
  }, [refresh]);

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

  const setBudget = useCallback(async (paise: number) => { await db.setMeta('budget', String(paise)); await refresh(); }, [refresh]);
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
      setServer({ state: 'ok', message: null, at: Date.now() });
      return true;
    } catch (e) {
      const pend: string[] = JSON.parse((await db.getMeta('pendingDeletes')) ?? '[]');
      await db.setMeta('pendingDeletes', JSON.stringify([...new Set([...pend, ...newDeletes])]));
      setServer({ state: 'error', message: (e as Error).message, at: Date.now() });
      return false;
    } finally { pushing.current = false; }
  }, []);

  /** Restore/merge the account's transactions from the server (used after sign-in). */
  const pullFromServer = useCallback(async () => {
    const r = await api.pullTransactions();
    if (r.transactions.length) await db.upsertMany(r.transactions);
    await refresh();
    return r.transactions.length;
  }, [refresh]);

  const syncing = useRef(false);
  const syncDevice = useCallback<StoreCtx['syncDevice']>(async () => {
    if (syncing.current) return { added: 0, scannedSms: 0, message: 'Sync already running' };
    syncing.current = true;
    try {
      const at = new Date();
      const since = Number((await db.getMeta('smsCursor')) ?? 0);
      const batch = await readInbox(since);
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

  // Keep the home-screen widget in step with the dashboard.
  useEffect(() => {
    if (!ready) return;
    pushWidget(dashboard.today.expensePaise, dashboard.today.incomePaise, dashboard.month.expensePaise, dashboard.budget ? dashboard.budget.usedPct : null, dashboard.today.dayKey);
  }, [ready, dashboard]);

  const value = useMemo(
    () => ({ ready, txns, dashboard, budgetPaise, isDemo, error, now, refresh, loadDemo, addManual, setBudget, reset, syncDevice, lastSync, server, pushToServer, pullFromServer }),
    [ready, txns, dashboard, budgetPaise, isDemo, error, now, refresh, loadDemo, addManual, setBudget, reset, syncDevice, lastSync, server, pushToServer, pullFromServer],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);
