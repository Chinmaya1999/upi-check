import { describe, expect, it } from 'vitest';
import { buildDashboard, formatINR, ingest, ingestBatch, summarizeDay } from '../src';
import type { Consent, RawTransaction, Transaction } from '../src';

const consents: Consent[] = [{ id: 'c1', accountId: '*', sources: ['account_aggregator', 'notification'], status: 'active' }];
const NOW = new Date('2026-11-04T10:00:00+05:30');
let n = 0;
const ctx = (existing: Transaction[] = [], c = consents) => ({ existing, consents: c, now: NOW, newId: () => `t${n++}` });
const run = (raws: RawTransaction[], existing: Transaction[] = []) => ingestBatch(raws, ctx(existing)).store;

const hdfc = (o: Partial<RawTransaction>): RawTransaction => ({
  source: 'account_aggregator', accountId: 'hdfc', date: '2026-11-04T09:15:00+05:30',
  narration: 'UPI/412345678901/Swiggy/swiggy@icici', amount: '450.00', direction: 'debit', ...o,
});

describe('normalisation', () => {
  it('parses Indian-formatted amounts to paise exactly', () => {
    const [t] = run([hdfc({ amount: '₹1,25,000.50' })]);
    expect(t!.amountPaise).toBe(12500050);
  });
  it('parses DD/MM/YYYY CSV dates as IST', () => {
    const [t] = run([hdfc({ source: 'csv', date: '04/11/2026 23:30' })]);
    expect(t!.dayKey).toBe('2026-11-04');
  });
  it('extracts UPI reference and merchant, categorises, keeps app unknown', () => {
    const [t] = run([hdfc({})]);
    expect(t).toMatchObject({ reference: '412345678901', merchant: 'Swiggy', categoryId: 'food', paymentApp: 'unknown', channel: 'upi' });
  });
  it('flags unknown merchants for review instead of guessing', () => {
    const [t] = run([hdfc({ narration: 'UPI/412345678902/Ramesh Kumar/ramesh@oksbi' })]);
    expect(t).toMatchObject({ categoryId: 'uncategorized', needsReview: true });
  });
  it('rejects bad input without throwing', () => {
    expect(ingest(hdfc({ amount: 'abc' }), ctx()).result.outcome).toBe('rejected');
    expect(ingest(hdfc({ amount: '0' }), ctx()).result.outcome).toBe('rejected');
    expect(ingest(hdfc({ currency: 'USD' }), ctx()).result.outcome).toBe('rejected');
  });
  it('preserves the original record', () => {
    const [t] = run([hdfc({ original: { raw: 'x' } })]);
    expect(t!.originals[0]!.payload).toEqual({ raw: 'x' });
  });
});

describe('consent and source validation', () => {
  it('rejects AA/notification data without active consent', () => {
    expect(ingest(hdfc({}), ctx([], [])).result).toMatchObject({ outcome: 'rejected' });
    const revoked: Consent[] = [{ ...consents[0]!, status: 'revoked' }];
    expect(ingest(hdfc({}), ctx([], revoked)).result.outcome).toBe('rejected');
    const expired: Consent[] = [{ ...consents[0]!, expiresAt: '2026-01-01T00:00:00Z' }];
    expect(ingest(hdfc({}), ctx([], expired)).result.outcome).toBe('rejected');
  });
  it('allows user-supplied sources (csv/manual) without a consent record', () => {
    expect(ingest(hdfc({ source: 'manual' }), ctx([], [])).result.outcome).toBe('saved');
  });
  it('rejects unknown sources', () => {
    expect(ingest({ ...hdfc({}), source: 'accessibility_scrape' as never }, ctx()).result.outcome).toBe('rejected');
  });
});

describe('deduplication', () => {
  it('never counts the same bank record twice (re-import)', () => {
    const once = run([hdfc({})]);
    const twice = run([hdfc({})], once);
    expect(twice).toHaveLength(1);
  });
  it('merges AA record and notification for the same payment, keeping the payment app', () => {
    const aa = run([hdfc({})]);
    const merged = run([{
      source: 'notification', accountId: 'hdfc', date: '2026-11-04T09:15:30+05:30',
      narration: 'Paid ₹450 to Swiggy', amount: 450, direction: 'debit', paymentApp: 'gpay',
    }], aa);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ paymentApp: 'gpay', reference: '412345678901' });
    expect(merged[0]!.sources.sort()).toEqual(['account_aggregator', 'notification']);
    expect(merged[0]!.originals).toHaveLength(2);
    expect(summarizeDay(merged, '2026-11-04').expensePaise).toBe(45000);
  });
  it('merges by reference even when narration differs between sources', () => {
    const a = run([hdfc({})]);
    const b = run([hdfc({ source: 'csv', narration: 'UPI-SWIGGY-412345678901', date: '04/11/2026' })], a);
    expect(b).toHaveLength(1);
  });
  it('keeps two genuine identical purchases from one batch', () => {
    const row = hdfc({ source: 'csv', narration: 'POS CHAI POINT', date: '04/11/2026', amount: '50' });
    const s = run([row, { ...row }]);
    expect(s).toHaveLength(2);
    expect(run([row, { ...row }], s)).toHaveLength(2); // idempotent re-import
  });
  it('does not merge different amounts or different accounts', () => {
    const s = run([hdfc({ reference: undefined, narration: 'Swiggy order', amount: 100 }), hdfc({ source: 'notification', accountId: 'sbi', narration: 'Swiggy order', amount: 100 })]);
    expect(s).toHaveLength(2);
  });
  it('upgrades pending to confirmed on later arrival', () => {
    const p = run([hdfc({ status: 'pending' })]);
    expect(p[0]!.status).toBe('pending');
    const c = run([hdfc({ status: 'success' })], p);
    expect(c).toHaveLength(1);
    expect(c[0]!.status).toBe('confirmed');
  });
});

describe('status handling', () => {
  it('failed transactions are stored but never counted', () => {
    const s = run([hdfc({ status: 'FAILED' })]);
    expect(s).toHaveLength(1);
    expect(summarizeDay(s, '2026-11-04').expensePaise).toBe(0);
  });
  it('pending debits are tracked separately from confirmed spend', () => {
    const s = run([hdfc({ status: 'pending' })]);
    const d = summarizeDay(s, '2026-11-04');
    expect(d.expensePaise).toBe(0);
    expect(d.pendingDebitPaise).toBe(45000);
  });
});

describe('refunds and reversals', () => {
  const buy = hdfc({ narration: 'UPI/500000000001/Amazon/amazon@apl', amount: 1000, date: '2026-11-01T12:00:00+05:30' });
  it('links a refund to its purchase and nets it off spending, not income', () => {
    const s = run([buy, hdfc({ direction: 'credit', narration: 'Refund from Amazon', amount: 1000, date: '2026-11-03T12:00:00+05:30' })]);
    const refund = s.find((t) => t.direction === 'credit')!;
    expect(refund.kind).toBe('refund');
    expect(refund.linkedTransactionId).toBe(s.find((t) => t.direction === 'debit')!.id);
    expect(summarizeDay(s, '2026-11-03')).toMatchObject({ incomePaise: 0, refundPaise: 100000 });
    const dash = buildDashboard(s, NOW);
    expect(dash.month.expensePaise).toBe(0);
    expect(dash.month.incomePaise).toBe(0);
  });
  it('partial refund reduces spend by the refunded amount only', () => {
    const s = run([buy, hdfc({ direction: 'credit', narration: 'Refund from Amazon', amount: 300, date: '2026-11-03T12:00:00+05:30' })]);
    expect(buildDashboard(s, NOW).month.expensePaise).toBe(70000);
  });
  it('auto-reversal removes both the debit and the credit from totals', () => {
    const s = run([
      hdfc({ amount: 500, narration: 'UPI/600000000001/Shop One/x@y', date: '2026-11-04T08:00:00+05:30' }),
      hdfc({ direction: 'credit', amount: 500, narration: 'UPI REVERSAL/600000000001/Shop One', date: '2026-11-04T08:05:00+05:30' }),
    ]);
    expect(s.find((t) => t.direction === 'debit')).toMatchObject({ kind: 'reversal', status: 'reversed' });
    expect(s.find((t) => t.direction === 'credit')!.kind).toBe('reversal');
    expect(summarizeDay(s, '2026-11-04')).toMatchObject({ expensePaise: 0, incomePaise: 0 });
  });
  it('an unmatched refund is flagged for review but still not income', () => {
    const s = run([hdfc({ direction: 'credit', narration: 'Refund from Unknown Store', amount: 200 })]);
    expect(s[0]).toMatchObject({ kind: 'refund', needsReview: true });
    expect(summarizeDay(s, '2026-11-04').incomePaise).toBe(0);
  });
});

describe('own-account transfers', () => {
  it('excludes a matched debit/credit pair across own accounts', () => {
    const s = run([
      hdfc({ accountId: 'hdfc', amount: 5000, narration: 'UPI/700000000001/Self Transfer', date: '2026-11-04T09:00:00+05:30' }),
      hdfc({ accountId: 'sbi', direction: 'credit', amount: 5000, narration: 'UPI/700000000002/Received from self', date: '2026-11-04T09:01:00+05:30' }),
    ]);
    expect(s.every((t) => t.kind === 'self_transfer')).toBe(true);
    expect(summarizeDay(s, '2026-11-04')).toMatchObject({ incomePaise: 0, expensePaise: 0 });
  });
  it('does not pair same-amount movements hours apart without a hint', () => {
    const s = run([
      hdfc({ accountId: 'hdfc', amount: 5000, narration: 'UPI/700000000003/Landlord', date: '2026-11-04T01:00:00+05:30' }),
      hdfc({ accountId: 'sbi', direction: 'credit', amount: 5000, narration: 'UPI/700000000004/Friend Ravi', date: '2026-11-04T09:00:00+05:30' }),
    ]);
    expect(s.map((t) => t.kind)).toEqual(['normal', 'normal']);
  });
});

describe('dashboard', () => {
  const seed = () => run([
    hdfc({ amount: 1250, narration: 'UPI/800000000001/Zomato/z@p', date: '2026-11-04T09:00:00+05:30' }),
    hdfc({ amount: 1000, narration: 'UPI/800000000002/Uber/u@p', date: '2026-11-03T09:00:00+05:30' }),
    hdfc({ direction: 'credit', amount: 50000, narration: 'NEFT SALARY ACME', date: '2026-11-01T09:00:00+05:30' }),
  ]);
  it('computes figures from stored transactions', () => {
    const d = buildDashboard(seed(), NOW, { monthlyPaise: 3000000 });
    expect(d.today.expensePaise).toBe(125000);
    expect(d.yesterday.expensePaise).toBe(100000);
    expect(d.changeVsYesterdayPct).toBe(25);
    expect(d.month).toMatchObject({ incomePaise: 5000000, expensePaise: 225000 });
    expect(d.budget).toMatchObject({ spentPaise: 225000, remainingPaise: 2775000, usedPct: 8 });
  });
  it('percentage change is null when yesterday had no spend', () => {
    expect(buildDashboard(run([hdfc({})]), NOW).changeVsYesterdayPct).toBeNull();
  });
  it('today boundary uses IST, not UTC', () => {
    const late = new Date('2026-11-04T19:00:00Z'); // 00:30 IST on Nov 5
    expect(buildDashboard(seed(), late).today.dayKey).toBe('2026-11-05');
  });
});

describe('formatINR', () => {
  it('uses Indian grouping', () => {
    expect(formatINR(12500050)).toBe('₹1,25,000.50');
    expect(formatINR(125000)).toBe('₹1,250');
    expect(formatINR(-99)).toBe('-₹0.99');
  });
});

describe('demo dataset', () => {
  it('runs through the engine, dedupes, and satisfies the money rules', async () => {
    const { generateDemoRaw } = await import('../src');
    const raws = generateDemoRaw(NOW);
    const { results, store } = ingestBatch(raws, ctx());
    expect(results.some((r) => r.outcome === 'rejected')).toBe(false);
    expect(results.some((r) => r.outcome === 'merged')).toBe(true);           // app + bank copies merged
    expect(store.length).toBeLessThan(raws.length);
    expect(store.filter((t) => t.kind === 'self_transfer')).toHaveLength(2);
    expect(store.filter((t) => t.kind === 'refund')).toHaveLength(1);
    expect(store.filter((t) => t.kind === 'reversal')).toHaveLength(2);
    const again = ingestBatch(raws, { ...ctx(store) });
    expect(again.store).toHaveLength(store.length);                              // idempotent
    const d = buildDashboard(store, NOW, { monthlyPaise: 3000000 });
    expect(d.today.expensePaise).toBeGreaterThan(0);
    expect(d.today.pendingDebitPaise).toBe(34900);
    expect(d.month.incomePaise).toBe(8500000);                                   // salary only; transfer/refund/reversal excluded
  });
});
