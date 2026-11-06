import { CATEGORIES } from './categorize';
import { formatINR } from './format';
import { dayKeyOf } from './normalize';
import { addDays } from './summary';
import type { Transaction } from './types';

/**
 * Smart spending insights: plain-language highlights computed only from the user's own transactions.
 * Pure and deterministic (same data in, same cards out), so it is cheap to test and safe to run on every refresh.
 */
export type InsightTone = 'good' | 'info' | 'warn' | 'alert';
export interface Insight {
  id: string;
  kind: 'unusual' | 'category' | 'week' | 'month' | 'merchant' | 'peak';
  tone: InsightTone;
  /** Ionicons name */
  icon: string;
  title: string;
  detail: string;
  /** For `unusual`: the payment that triggered it (used to alert once per payment). */
  txnId?: string;
  occurredAt?: string;
}

const MIN_BASE_PAISE = 10_000;        // ignore percentage swings when the comparison period is under Rs 100
const MIN_UNUSUAL_PAISE = 50_000;     // a payment under Rs 500 is never "unusual"
const MIN_HISTORY = 8;                // payments needed before "typical" means anything
const UNUSUAL_WINDOW_DAYS = 90;

const isSpend = (t: Transaction) => t.direction === 'debit' && t.status === 'confirmed' && t.kind === 'normal';
const sum = (xs: Transaction[]) => xs.reduce((a, t) => a + t.amountPaise, 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const pctChange = (cur: number, prev: number) => Math.round(((cur - prev) / prev) * 100);
const dow = (dayKey: string) => new Date(`${dayKey}T12:00:00Z`).getUTCDay();             // 0 = Sunday
const weekStart = (dayKey: string) => addDays(dayKey, -((dow(dayKey) + 6) % 7));        // Monday
const monthStart = (dayKey: string) => `${dayKey.slice(0, 7)}-01`;
const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
const catIcon = (id: string) => CATEGORIES.find((c) => c.id === id)?.icon ?? 'pricetag';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const inRange = (txns: Transaction[], from: string, to: string) => txns.filter((t) => t.dayKey >= from && t.dayKey <= to);

export function buildInsights(all: Transaction[], now: Date = new Date(), max = 6): Insight[] {
  const txns = all.filter(isSpend);
  if (txns.length < 3) return [];
  const today = dayKeyOf(now);
  const out: Insight[] = [];

  // ── 1. Unusual payments (last 7 days) vs the user's own recent history ───────────────────────────
  const candidates = txns.filter((t) => t.dayKey > addDays(today, -7) && t.dayKey <= today).sort((a, b) => b.amountPaise - a.amountPaise);
  for (const t of candidates) {
    if (t.amountPaise < MIN_UNUSUAL_PAISE) continue;
    const before = txns.filter((o) => o.id !== t.id && o.occurredAt < t.occurredAt && o.dayKey >= addDays(t.dayKey, -UNUSUAL_WINDOW_DAYS));
    if (before.length < MIN_HISTORY) continue;
    const amounts = before.map((o) => o.amountPaise);
    const med = median(amounts);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const sd = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length);
    if (t.amountPaise < Math.max(MIN_UNUSUAL_PAISE, med * 3) || t.amountPaise < mean + 2 * sd) continue;
    // Bills and rent repeat at the same size: a regular merchant is not a surprise.
    const same = before.filter((o) => o.merchant.toLowerCase() === t.merchant.toLowerCase()).map((o) => o.amountPaise);
    if (same.length >= 2 && t.amountPaise <= median(same) * 1.5) continue;
    out.push({
      id: `unusual:${t.id}`, kind: 'unusual', tone: 'alert', icon: 'alert-circle', txnId: t.id, occurredAt: t.occurredAt,
      title: `Unusual payment: ${formatINR(t.amountPaise)} at ${t.merchant}`,
      detail: `That is ${(t.amountPaise / Math.max(med, 1)).toFixed(1)}x your typical payment of ${formatINR(Math.round(med))}.`,
    });
    if (out.length >= 2) break;
  }

  // ── 2. Category that jumped vs the same days last month ──────────────────────────────────────────
  const dom = Number(today.slice(8));
  const thisFrom = monthStart(today);
  const lastMonthLast = addDays(thisFrom, -1);
  const lastFrom = monthStart(lastMonthLast);
  const lastTo = addDays(lastFrom, dom - 1) > lastMonthLast ? lastMonthLast : addDays(lastFrom, dom - 1);
  const curM = inRange(txns, thisFrom, today), prevM = inRange(txns, lastFrom, lastTo);
  const byCat = (xs: Transaction[]) => { const m = new Map<string, number>(); for (const t of xs) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amountPaise); return m; };
  const cNow = byCat(curM), cPrev = byCat(prevM);
  let best: { id: string; cur: number; prev: number; delta: number } | null = null;
  for (const [id, cur] of cNow) {
    const prev = cPrev.get(id) ?? 0;
    const delta = cur - prev;
    const big = prev === 0 ? cur >= 100_000 : cur >= 50_000 && pctChange(cur, prev) >= 40;
    if (big && delta > 0 && (!best || delta > best.delta)) best = { id, cur, prev, delta };
  }
  if (best) {
    out.push({
      id: `category:${best.id}:${thisFrom}`, kind: 'category', tone: 'warn', icon: catIcon(best.id),
      title: best.prev === 0 ? `New big spend: ${catLabel(best.id)}` : `${catLabel(best.id)} is up ${pctChange(best.cur, best.prev)}%`,
      detail: best.prev === 0 ? `${formatINR(best.cur)} this month, nothing at this point last month.` : `${formatINR(best.cur)} this month vs ${formatINR(best.prev)} by this day last month.`,
    });
  }

  // ── 3. Week-to-date vs the same days last week ───────────────────────────────────────────────────
  const wFrom = weekStart(today), pwFrom = addDays(wFrom, -7), pwTo = addDays(today, -7);
  const wCur = sum(inRange(txns, wFrom, today)), wPrev = sum(inRange(txns, pwFrom, pwTo));
  if (wPrev >= MIN_BASE_PAISE && Math.abs(pctChange(wCur, wPrev)) >= 10) {
    const p = pctChange(wCur, wPrev), up = p > 0;
    out.push({
      id: `week:${wFrom}`, kind: 'week', tone: up ? 'warn' : 'good', icon: up ? 'trending-up' : 'trending-down',
      title: `Spending is ${up ? 'up' : 'down'} ${Math.abs(p)}% this week`,
      detail: `${formatINR(wCur)} so far vs ${formatINR(wPrev)} by this day last week.`,
    });
  }

  // ── 4. Month-to-date vs the same days last month ─────────────────────────────────────────────────
  const mCur = sum(curM), mPrev = sum(prevM);
  if (mPrev >= MIN_BASE_PAISE * 5 && Math.abs(pctChange(mCur, mPrev)) >= 10) {
    const p = pctChange(mCur, mPrev), up = p > 0;
    out.push({
      id: `month:${thisFrom}`, kind: 'month', tone: up ? 'warn' : 'good', icon: up ? 'arrow-up-circle' : 'checkmark-circle',
      title: up ? `You are spending ${Math.abs(p)}% more than last month` : `You are ${Math.abs(p)}% under last month's pace`,
      detail: `${formatINR(mCur)} in ${dom} days vs ${formatINR(mPrev)} over the same days last month.`,
    });
  }

  // ── 5. A merchant you keep paying ────────────────────────────────────────────────────────────────
  const byMerchant = new Map<string, { n: number; total: number; name: string }>();
  for (const t of curM) { const k = t.merchant.toLowerCase(); const e = byMerchant.get(k) ?? { n: 0, total: 0, name: t.merchant }; e.n++; e.total += t.amountPaise; byMerchant.set(k, e); }
  const topM = [...byMerchant.values()].filter((m) => m.n >= 4).sort((a, b) => b.total - a.total)[0];
  if (topM) out.push({ id: `merchant:${topM.name}:${thisFrom}`, kind: 'merchant', tone: 'info', icon: 'repeat', title: `${topM.name} ${topM.n} times this month`, detail: `${formatINR(topM.total)} in total, about ${formatINR(Math.round(topM.total / topM.n))} each.` });

  // ── 6. Biggest day this week ─────────────────────────────────────────────────────────────────────
  const days = new Map<string, number>();
  for (const t of inRange(txns, wFrom, today)) days.set(t.dayKey, (days.get(t.dayKey) ?? 0) + t.amountPaise);
  if (days.size >= 3) {
    const [dk, amt] = [...days.entries()].sort((a, b) => b[1] - a[1])[0]!;
    out.push({ id: `peak:${wFrom}`, kind: 'peak', tone: 'info', icon: 'calendar', title: `${dk === today ? 'Today is' : DAY_NAMES[dow(dk)]! + ' was'} your biggest spending day this week`, detail: `${formatINR(amt)} across ${txns.filter((t) => t.dayKey === dk).length} payments.` });
  }

  const rank: Record<Insight['kind'], number> = { unusual: 0, category: 1, week: 2, month: 3, merchant: 4, peak: 5 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, max);
}
