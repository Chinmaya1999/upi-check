import { dayKeyOf } from './normalize';
import type { DaySummary, Paise, Transaction } from './types';

/**
 * The single definition of "what counts". Used by dashboard, analytics,
 * reports and the AI assistant so they can never disagree.
 *  - only confirmed transactions
 *  - self transfers and reversal pairs are excluded
 *  - refunds reduce expense; they are not income
 */
export function summarizeDay(txns: Transaction[], dayKey: string): DaySummary {
  const s: DaySummary = { dayKey, incomePaise: 0, expensePaise: 0, grossExpensePaise: 0, refundPaise: 0, netPaise: 0, pendingDebitPaise: 0, count: 0 };
  for (const t of txns) {
    if (t.dayKey !== dayKey) continue;
    if (t.status === 'pending' && t.direction === 'debit' && t.kind === 'normal') s.pendingDebitPaise += t.amountPaise;
    if (t.status !== 'confirmed') continue;
    if (t.kind === 'reversal' || t.kind === 'self_transfer') continue;
    s.count++;
    if (t.kind === 'refund') s.refundPaise += t.amountPaise;
    else if (t.direction === 'debit') s.grossExpensePaise += t.amountPaise;
    else s.incomePaise += t.amountPaise;
  }
  // Shown net of refunds, floored at 0 for a single day's display.
  s.expensePaise = Math.max(0, s.grossExpensePaise - s.refundPaise);
  s.netPaise = s.incomePaise - s.expensePaise;
  return s;
}

export function summarizeRange(txns: Transaction[], fromDay: string, toDay: string): Omit<DaySummary, 'dayKey'> & { fromDay: string; toDay: string } {
  const days = new Map<string, Transaction[]>();
  for (const t of txns) if (t.dayKey >= fromDay && t.dayKey <= toDay) (days.get(t.dayKey) ?? days.set(t.dayKey, []).get(t.dayKey)!).push(t);
  const acc = { fromDay, toDay, incomePaise: 0, expensePaise: 0, grossExpensePaise: 0, refundPaise: 0, netPaise: 0, pendingDebitPaise: 0, count: 0 };
  for (const [d, list] of days) {
    const s = summarizeDay(list, d);
    acc.incomePaise += s.incomePaise; acc.grossExpensePaise += s.grossExpensePaise; acc.refundPaise += s.refundPaise;
    acc.pendingDebitPaise += s.pendingDebitPaise; acc.count += s.count;
  }
  // A refund may land on a different day than its purchase, so net over the whole range.
  acc.expensePaise = Math.max(0, acc.grossExpensePaise - acc.refundPaise);
  acc.netPaise = acc.incomePaise - acc.expensePaise;
  return acc;
}

export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}
export const monthStart = (dayKey: string) => `${dayKey.slice(0, 7)}-01`;

export function categoryBreakdown(txns: Transaction[], fromDay: string, toDay: string): { categoryId: string; paise: Paise }[] {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.status !== 'confirmed' || t.kind === 'reversal' || t.kind === 'self_transfer') continue;
    if (t.dayKey < fromDay || t.dayKey > toDay) continue;
    if (t.direction === 'debit') m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amountPaise);
    else if (t.kind === 'refund') m.set(t.categoryId, (m.get(t.categoryId) ?? 0) - t.amountPaise);
  }
  return [...m].map(([categoryId, paise]) => ({ categoryId, paise })).filter((x) => x.paise > 0).sort((a, b) => b.paise - a.paise);
}

export interface Budget { monthlyPaise: Paise; dailyLimitPaise?: Paise }

export interface Dashboard {
  today: DaySummary;
  yesterday: DaySummary;
  /** null when yesterday had no spending (percentage undefined). */
  changeVsYesterdayPct: number | null;
  month: { incomePaise: Paise; expensePaise: Paise; netPaise: Paise };
  budget: { monthlyPaise: Paise; spentPaise: Paise; remainingPaise: Paise; usedPct: number; daysLeft: number; safeDailyPaise: number } | null;
  last7Days: DaySummary[];
  recent: Transaction[];
  pendingCount: number;
  reviewCount: number;
}

export function buildDashboard(txns: Transaction[], now: Date, budget?: Budget): Dashboard {
  const todayKey = dayKeyOf(now);
  const today = summarizeDay(txns, todayKey);
  const yesterday = summarizeDay(txns, addDays(todayKey, -1));
  const m = summarizeRange(txns, monthStart(todayKey), todayKey);
  const [y, mo] = todayKey.split('-').map(Number);
  const dim = new Date(Date.UTC(y!, mo!, 0)).getUTCDate();
  const daysLeft = dim - Number(todayKey.slice(8)) + 1;
  return {
    today, yesterday,
    changeVsYesterdayPct: yesterday.expensePaise > 0 ? Math.round(((today.expensePaise - yesterday.expensePaise) / yesterday.expensePaise) * 100) : null,
    month: { incomePaise: m.incomePaise, expensePaise: m.expensePaise, netPaise: m.netPaise },
    budget: budget && budget.monthlyPaise > 0 ? {
      monthlyPaise: budget.monthlyPaise,
      spentPaise: m.expensePaise,
      remainingPaise: budget.monthlyPaise - m.expensePaise,
      usedPct: Math.round((m.expensePaise / budget.monthlyPaise) * 100),
      daysLeft,
      safeDailyPaise: Math.max(0, Math.floor((budget.monthlyPaise - m.expensePaise) / daysLeft)),
    } : null,
    last7Days: Array.from({ length: 7 }, (_, i) => summarizeDay(txns, addDays(todayKey, i - 6))),
    recent: [...txns].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8),
    pendingCount: txns.filter((t) => t.status === 'pending').length,
    reviewCount: txns.filter((t) => t.needsReview && t.status === 'confirmed').length,
  };
}
