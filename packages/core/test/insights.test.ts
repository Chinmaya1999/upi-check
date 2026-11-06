import { describe, expect, it } from 'vitest';
import { buildInsights } from '../src';
import type { Transaction } from '../src';

const NOW = new Date('2026-11-12T12:00:00+05:30'); // a Thursday
let n = 0;
const tx = (dayKey: string, rupees: number, merchant = 'Shop', categoryId = 'shopping', extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, accountId: 'a', direction: 'debit', amountPaise: Math.round(rupees * 100), currency: 'INR', occurredAt: `${dayKey}T09:00:00+05:30`, dayKey,
  status: 'confirmed', kind: 'normal', channel: 'upi', paymentApp: 'unknown', merchant, narration: '', reference: null, categoryId, needsReview: false,
  linkedTransactionId: null, fingerprint: `f${n}`, altFingerprints: [], sources: ['sms'], originals: [], ...extra,
});
const history = () => Array.from({ length: 20 }, (_, i) => tx(`2026-10-${String(1 + i).padStart(2, '0')}`, 200 + (i % 5) * 20, `M${i % 6}`, 'food'));

describe('insights', () => {
  it('needs a little data before saying anything', () => { expect(buildInsights([tx('2026-11-11', 100)], NOW)).toEqual([]); });

  it('flags a payment far above the usual size', () => {
    const r = buildInsights([...history(), tx('2026-11-11', 4500, 'Croma', 'shopping')], NOW);
    const u = r.find((i) => i.kind === 'unusual');
    expect(u).toBeTruthy();
    expect(u!.title).toContain('Croma');
    expect(u!.tone).toBe('alert');
  });

  it('does not flag a regular bill that repeats at the same size', () => {
    const rent = ['2026-09-28', '2026-10-28'].map((d) => tx(d, 4500, 'Rent', 'rent'));
    const r = buildInsights([...history(), ...rent, tx('2026-11-10', 4500, 'Rent', 'rent')], NOW);
    expect(r.find((i) => i.kind === 'unusual')).toBeUndefined();
  });

  it('never flags small amounts, even if they are out of pattern', () => {
    const r = buildInsights([...history(), tx('2026-11-11', 450, 'Cafe', 'food')], NOW);
    expect(r.find((i) => i.kind === 'unusual')).toBeUndefined();
  });

  it('reports a category that jumped versus the same days last month', () => {
    const last = Array.from({ length: 6 }, (_, i) => tx(`2026-10-0${i + 1}`, 200, 'Zomato', 'food'));
    const cur = Array.from({ length: 6 }, (_, i) => tx(`2026-11-0${i + 1}`, 500, 'Zomato', 'food'));
    const r = buildInsights([...last, ...cur], NOW);
    const c = r.find((i) => i.kind === 'category');
    expect(c?.title).toBe('Food & Dining is up 150%');
  });

  it('compares this week with the same days last week', () => {
    const lastWeek = ['2026-11-02', '2026-11-03', '2026-11-04'].map((d) => tx(d, 300));
    const thisWeek = ['2026-11-09', '2026-11-10', '2026-11-11'].map((d) => tx(d, 600));
    const w = buildInsights([...lastWeek, ...thisWeek], NOW).find((i) => i.kind === 'week');
    expect(w?.title).toBe('Spending is up 100% this week');
  });

  it('ignores failed, pending, refunded and self-transfer rows', () => {
    const odd = [tx('2026-11-11', 9000, 'X', 'shopping', { status: 'failed' }), tx('2026-11-11', 9000, 'Y', 'shopping', { status: 'pending' }), tx('2026-11-11', 9000, 'Z', 'shopping', { kind: 'self_transfer' })];
    expect(buildInsights([...history(), ...odd], NOW).find((i) => i.kind === 'unusual')).toBeUndefined();
  });
});
