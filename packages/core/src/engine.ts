import { categorize } from './categorize';
import {
  dayKeyOf, detectChannel, detectDirection, extractMerchant, extractReference,
  normalizeNarration, normalizeStatus, parseAmountPaise, parseDate,
} from './normalize';
import type { Consent, IngestResult, RawTransaction, SourceKind, Transaction } from './types';

/** Sources the user supplies themselves; no standing consent record needed. */
const USER_SUPPLIED: SourceKind[] = ['manual', 'csv', 'pdf', 'sms'];
const TEN_MIN = 10 * 60_000;
const DAY = 24 * 60 * 60_000;

export interface IngestContext {
  /** Everything already stored for this user. */
  existing: Transaction[];
  consents: Consent[];
  now?: Date;
  newId?: () => string;
}

export interface IngestOutcome {
  result: IngestResult;
  /** Records to persist (new + any existing ones modified by this ingest). */
  changes: Transaction[];
}

let counter = 0;
const defaultId = () => `txn_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/** Steps 2-3: validate source and consent. */
export function validateSourceAndConsent(raw: RawTransaction, consents: Consent[], now: Date): string | null {
  if (!['account_aggregator', 'notification', 'csv', 'pdf', 'manual', 'sms'].includes(raw.source)) return `unknown source "${raw.source}"`;
  if (USER_SUPPLIED.includes(raw.source)) return null;
  const ok = consents.some((c) =>
    c.status === 'active' &&
    c.sources.includes(raw.source) &&
    (c.accountId === '*' || c.accountId === raw.accountId) &&
    (!c.expiresAt || new Date(c.expiresAt) > now));
  return ok ? null : `no active consent for ${raw.source} on account ${raw.accountId}`;
}

export function fingerprintOf(t: Pick<Transaction, 'accountId' | 'reference' | 'amountPaise' | 'direction' | 'dayKey' | 'occurredAt' | 'narration'>, hasTime: boolean): string {
  if (t.reference) return `ref|${t.accountId}|${t.reference}|${t.amountPaise}|${t.direction}`;
  const when = hasTime ? t.occurredAt.slice(0, 16) : t.dayKey;
  return `nr|${t.accountId}|${when}|${t.amountPaise}|${t.direction}|${normalizeNarration(t.narration)}`;
}

const tokens = (s: string) => new Set(normalizeNarration(s).split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w)));
const overlaps = (a: string, b: string) => { const tb = tokens(b); return [...tokens(a)].some((w) => tb.has(w)); };

/** Steps 8: find the stored transaction this one duplicates, if any. */
export function findDuplicate(c: Transaction, existing: Transaction[]): Transaction | undefined {
  const same = existing.filter((e) => e.accountId === c.accountId && e.amountPaise === c.amountPaise && e.direction === c.direction);
  const byFp = same.find((e) => e.fingerprint === c.fingerprint || e.altFingerprints.includes(c.fingerprint));
  if (byFp) return byFp;
  if (c.reference) {
    const byRef = same.find((e) => e.reference === c.reference);
    if (byRef) return byRef;
  }
  // Cross-source fuzzy match: bank record (with RRN) vs notification (without), or vice versa.
  return same.find((e) =>
    !e.sources.includes(c.sources[0]!) &&
    (!e.reference || !c.reference) &&
    Math.abs(new Date(e.occurredAt).getTime() - new Date(c.occurredAt).getTime()) <= DAY &&
    e.dayKey === c.dayKey &&
    (e.merchant === c.merchant || overlaps(e.narration, c.narration)));
}

function mergeInto(base: Transaction, inc: Transaction): Transaction {
  const rank = { failed: 0, reversed: 1, pending: 2, confirmed: 3 } as const;
  return {
    ...base,
    // Bank-reported data wins on reference/status; a pending record gets promoted.
    reference: base.reference ?? inc.reference,
    status: rank[inc.status] > rank[base.status] ? inc.status : base.status,
    paymentApp: base.paymentApp !== 'unknown' ? base.paymentApp : inc.paymentApp,
    channel: base.channel === 'other' ? inc.channel : base.channel,
    sources: [...new Set([...base.sources, ...inc.sources])],
    originals: [...base.originals, ...inc.originals],
    fingerprint: base.reference || !inc.reference ? base.fingerprint : inc.fingerprint,
    altFingerprints: [...new Set([...base.altFingerprints, base.fingerprint, inc.fingerprint])].filter((f) => f !== (base.reference || !inc.reference ? base.fingerprint : inc.fingerprint)),
  };
}

/** Step 10: refunds and reversals. Mutates nothing; returns modified copies. */
function classifyRefundOrReversal(t: Transaction, existing: Transaction[]): { t: Transaction; touched: Transaction[] } {
  if (t.direction !== 'credit' || t.status !== 'confirmed') return { t, touched: [] };
  const n = t.narration;
  const isReversal = /\b(reversal|reversed|rev\b|failed txn|txn failed|auto.?revers)/i.test(n);
  const isRefund = /\brefund(ed)?\b/i.test(n);
  if (!isReversal && !isRefund) return { t, touched: [] };

  const t0 = new Date(t.occurredAt).getTime();
  const debits = existing.filter((e) =>
    e.direction === 'debit' && e.accountId === t.accountId && !e.linkedTransactionId &&
    e.amountPaise >= t.amountPaise && new Date(e.occurredAt).getTime() <= t0 &&
    t0 - new Date(e.occurredAt).getTime() <= (isReversal ? 3 : 60) * DAY);
  const orig =
    (t.reference && debits.find((d) => d.reference === t.reference && d.amountPaise === t.amountPaise)) ||
    debits.filter((d) => d.amountPaise === t.amountPaise && (d.merchant === t.merchant || overlaps(d.narration, n)))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ||
    (isReversal ? debits.filter((d) => d.amountPaise === t.amountPaise).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] : undefined);

  if (isReversal && orig) {
    // Money left and came straight back: neither side is spending or income.
    const credit: Transaction = { ...t, kind: 'reversal', linkedTransactionId: orig.id, categoryId: 'transfer', needsReview: false };
    const debit: Transaction = { ...orig, kind: 'reversal', status: 'reversed', linkedTransactionId: t.id };
    return { t: credit, touched: [debit] };
  }
  // Refund (partial or full): credit that offsets spend. Linked when we can find the purchase.
  const credit: Transaction = { ...t, kind: 'refund', linkedTransactionId: orig?.id ?? null, categoryId: orig?.categoryId ?? t.categoryId, needsReview: !orig };
  return { t: credit, touched: orig ? [{ ...orig, linkedTransactionId: t.id }] : [] };
}

/** Step 11: transfers between the user's own accounts. */
function detectSelfTransfer(t: Transaction, existing: Transaction[]): { t: Transaction; touched: Transaction[] } {
  if (t.kind !== 'normal' || t.status !== 'confirmed') return { t, touched: [] };
  const hint = /\b(own account|self|my account|to self|a\/c transfer|acct transfer)\b/i.test(t.narration);
  const t0 = new Date(t.occurredAt).getTime();
  const peer = existing.find((e) =>
    e.kind === 'normal' && e.status === 'confirmed' && e.accountId !== t.accountId &&
    e.direction !== t.direction && e.amountPaise === t.amountPaise &&
    Math.abs(new Date(e.occurredAt).getTime() - t0) <= (hint ? DAY : TEN_MIN));
  if (!peer) return { t, touched: [] };
  return {
    t: { ...t, kind: 'self_transfer', linkedTransactionId: peer.id, categoryId: 'transfer', needsReview: false },
    touched: [{ ...peer, kind: 'self_transfer', linkedTransactionId: t.id, categoryId: 'transfer', needsReview: false }],
  };
}

export function ingest(raw: RawTransaction, ctx: IngestContext): IngestOutcome {
  const now = ctx.now ?? new Date();
  const reject = (reason: string): IngestOutcome => ({ result: { outcome: 'rejected', reason }, changes: [] });

  const bad = validateSourceAndConsent(raw, ctx.consents, now);
  if (bad) return reject(bad);

  let amountPaise: number, occurredAt: string;
  try {
    amountPaise = parseAmountPaise(raw);
    occurredAt = parseDate(raw.date);
  } catch (e) { return reject((e as Error).message); }
  if (amountPaise === 0) return reject('zero amount');
  if ((raw.currency ?? 'INR').toUpperCase() !== 'INR') return reject(`unsupported currency ${raw.currency}`);
  if (!raw.accountId) return reject('missing accountId');

  const direction = detectDirection(raw);
  if (!direction) return reject('cannot determine debit/credit');

  const hasTime = /[T ]\d{1,2}:\d{2}/.test(raw.date) && !/T00:00:00(\+05:30)?$/.test(occurredAt);
  const merchant = extractMerchant(raw.narration);
  const cat = categorize(merchant, raw.narration, direction);
  const base: Transaction = {
    id: (ctx.newId ?? defaultId)(),
    accountId: raw.accountId,
    direction,
    amountPaise,
    currency: 'INR',
    occurredAt,
    dayKey: dayKeyOf(occurredAt),
    status: normalizeStatus(raw.status),
    kind: 'normal',
    channel: detectChannel(raw.narration),
    paymentApp: raw.paymentApp ?? 'unknown',
    merchant,
    narration: raw.narration,
    reference: extractReference(raw),
    categoryId: direction === 'credit' && cat.needsReview ? 'income' : cat.categoryId,
    needsReview: direction === 'credit' ? false : cat.needsReview,
    linkedTransactionId: null,
    fingerprint: '',
    altFingerprints: [],
    sources: [raw.source],
    originals: [{ source: raw.source, payload: raw.original ?? raw, receivedAt: now.toISOString() }],
  };
  base.fingerprint = fingerprintOf(base, hasTime) + (base.reference || !raw.sourceRecordId ? '' : `|${raw.sourceRecordId}`);

  const dup = findDuplicate(base, ctx.existing);
  if (dup) {
    const merged = mergeInto(dup, base);
    return { result: { outcome: 'merged', transaction: merged, duplicateOf: dup.id }, changes: [merged] };
  }

  const others = ctx.existing;
  const r = classifyRefundOrReversal(base, others);
  const s = r.t.kind === 'normal' ? detectSelfTransfer(r.t, others) : { t: r.t, touched: [] };
  const changes = [s.t, ...r.touched, ...s.touched];
  return { result: { outcome: 'saved', transaction: s.t }, changes };
}

/**
 * Ingest many records. Sorted oldest-first so a debit exists before its refund,
 * and identical rows inside one batch are kept distinct via an occurrence index
 * (two genuine ₹50 chai payments, same day, same narration, no reference).
 */
export function ingestBatch(raws: RawTransaction[], ctx: IngestContext): { results: IngestResult[]; store: Transaction[] } {
  const store = new Map(ctx.existing.map((t) => [t.id, t]));
  const seen = new Map<string, number>();
  const ordered = [...raws].sort((a, b) => {
    try { return parseDate(a.date).localeCompare(parseDate(b.date)); } catch { return 0; }
  });
  const results: IngestResult[] = [];
  for (const raw of ordered) {
    const key = `${raw.source}|${raw.accountId}|${raw.date}|${raw.amount ?? raw.amountPaise}|${raw.narration}|${raw.reference ?? ''}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    // Re-importing the same file yields the same occurrence indices, so it stays idempotent.
    const withIdx = nth > 0 && !raw.reference ? { ...raw, sourceRecordId: raw.sourceRecordId ?? `#${nth}` } : raw;
    const out = ingest(withIdx, { ...ctx, existing: [...store.values()] });
    for (const c of out.changes) store.set(c.id, c);
    results.push(out.result);
  }
  return { results, store: [...store.values()] };
}
