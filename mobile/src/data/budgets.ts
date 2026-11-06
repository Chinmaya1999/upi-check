import { addDays, dayKeyOf, formatINR, summarizeRange, type Transaction } from '@upi/core';

export type Period = 'day' | 'week' | 'month';
export const PERIODS: Period[] = ['day', 'week', 'month'];
export const PERIOD_LABEL: Record<Period, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
export type Limits = Record<Period, number | null>; // paise
export interface Prefs { alerts: boolean; sound: boolean; warnAt80: boolean }
export interface Notif { id: number; at: number; title: string; body: string; period: Period; level: 'warn' | 'over' }

export const DEFAULT_PREFS: Prefs = { alerts: true, sound: true, warnAt80: true };

/** Weeks run Monday → Sunday (IST day keys). */
export function weekStart(dayKey: string): string {
  const dow = new Date(`${dayKey}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dayKey, -((dow + 6) % 7));
}
export function periodRange(period: Period, now: Date): { from: string; to: string } {
  const today = dayKeyOf(now);
  if (period === 'day') return { from: today, to: today };
  if (period === 'week') return { from: weekStart(today), to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
export const spentIn = (txns: Transaction[], period: Period, now: Date): number => {
  const { from, to } = periodRange(period, now);
  return summarizeRange(txns, from, to).expensePaise;
};

export interface BudgetStatus { period: Period; limit: number | null; spent: number; pct: number | null; left: number | null }
export function statuses(txns: Transaction[], limits: Limits, now: Date): BudgetStatus[] {
  return PERIODS.map((period) => {
    const spent = spentIn(txns, period, now);
    const limit = limits[period];
    return { period, limit, spent, pct: limit ? Math.round((spent / limit) * 100) : null, left: limit ? limit - spent : null };
  });
}
/** The most-used budget — what the widget's progress bar shows. */
export function tightest(st: BudgetStatus[]): BudgetStatus | null {
  return st.filter((s) => s.pct !== null).sort((a, b) => b.pct! - a.pct!)[0] ?? null;
}

export interface PendingAlert { key: string; period: Period; level: 'warn' | 'over'; title: string; body: string }
/** Alerts that should fire now. `key` is unique per period instance + level, so each fires once per day/week/month. */
export function dueAlerts(st: BudgetStatus[], now: Date, prefs: Prefs): PendingAlert[] {
  const out: PendingAlert[] = [];
  for (const s of st) {
    if (!s.limit || s.pct === null) continue;
    const { from } = periodRange(s.period, now);
    const name = PERIOD_LABEL[s.period].toLowerCase();
    if (s.spent > s.limit) {
      out.push({
        key: `${s.period}:${from}:over`, period: s.period, level: 'over',
        title: `⚠️ ${PERIOD_LABEL[s.period]} budget exceeded`,
        body: `You've spent ${formatINR(s.spent)} against your ${name} budget of ${formatINR(s.limit)} — ${formatINR(s.spent - s.limit)} over.`,
      });
    } else if (prefs.warnAt80 && s.pct >= 80) {
      out.push({
        key: `${s.period}:${from}:warn`, period: s.period, level: 'warn',
        title: `${PERIOD_LABEL[s.period]} budget at ${s.pct}%`,
        body: `Only ${formatINR(s.limit - s.spent)} left of your ${name} budget of ${formatINR(s.limit)}.`,
      });
    }
  }
  return out;
}
