import type { PaymentChannel, Paise, RawTransaction, TxnDirection, TxnStatus } from './types';

const IST_OFFSET_MIN = 330;

export function parseAmountPaise(raw: RawTransaction): Paise {
  if (raw.amountPaise !== undefined) {
    if (!Number.isInteger(raw.amountPaise)) throw new Error('amountPaise must be an integer');
    return Math.abs(raw.amountPaise);
  }
  if (raw.amount === undefined) throw new Error('missing amount');
  const s = String(raw.amount).replace(/[₹,\s]|INR|Rs\.?/gi, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`invalid amount "${raw.amount}"`);
  const [whole, frac = ''] = s.replace('-', '').split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Returns ISO-8601 with +05:30 offset unless the input carries its own offset. */
export function parseDate(input: string): string {
  const s = input.trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = dmy;
    const year = y!.length === 2 ? 2000 + Number(y) : Number(y);
    const p = (n: string | number, w = 2) => String(n).padStart(w, '0');
    return `${year}-${p(m!)}-${p(d!)}T${p(hh)}:${p(mm)}:${p(ss)}+05:30`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+05:30`;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  const t = Date.parse(hasOffset ? s : `${s}+05:30`);
  if (Number.isNaN(t)) throw new Error(`invalid date "${input}"`);
  return new Date(t).toISOString();
}

/** yyyy-mm-dd of the instant in IST. All "today" logic keys off this. */
export function dayKeyOf(iso: string | number | Date): string {
  const ms = typeof iso === 'number' ? iso : new Date(iso).getTime();
  return new Date(ms + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function normalizeStatus(s?: string): TxnStatus {
  const v = (s ?? 'success').toLowerCase();
  if (/fail|declin|reject|unsuccess/.test(v)) return 'failed';
  if (/pend|process|initiat|await/.test(v)) return 'pending';
  if (/revers/.test(v)) return 'reversed';
  return 'confirmed';
}

/** Direction from explicit field, else from narration wording. Returns null if ambiguous. */
export function detectDirection(raw: RawTransaction): TxnDirection | null {
  if (raw.direction) return raw.direction;
  const n = raw.narration.toLowerCase();
  if (/\b(debited|paid to|sent to|withdrawn|purchase|spent)\b/.test(n)) return 'debit';
  if (/\b(credited|received from|deposit|refund|cashback)\b/.test(n)) return 'credit';
  return null;
}

/** UPI RRNs are 12 digits; also accepts explicit reference field. */
export function extractReference(raw: RawTransaction): string | null {
  if (raw.reference?.trim()) return raw.reference.trim().toUpperCase();
  const m = raw.narration.match(/(?:UPI[/-]|RRN[: ]|Ref(?:erence)?(?: No\.?)?[: ]+|UTR[: ]+)(?:[A-Z]+[/-])?(\d{12})\b/i)
    ?? raw.narration.match(/\b(\d{12})\b/);
  return m ? m[1]! : null;
}

export function detectChannel(narration: string): PaymentChannel {
  const n = narration.toUpperCase();
  if (/\bUPI\b|@[A-Z]{2,}/.test(n)) return 'upi';
  if (/\b(NEFT|IMPS|RTGS)\b/.test(n)) return 'bank_transfer';
  if (/\b(POS|ATM|CARD|VISA|MASTERCARD|RUPAY)\b/.test(n)) return 'card';
  if (/\bCASH\b/.test(n)) return 'cash';
  return 'other';
}

/** Best-effort merchant label pulled from common bank narration formats. */
export function extractMerchant(narration: string): string {
  const parts = narration.split('/').map((p) => p.trim());
  if (/^UPI$/i.test(parts[0] ?? '') && parts.length >= 4) {
    // UPI/<type>/<rrn>/<name>/...  or UPI/<rrn>/<name>/...
    const nameIdx = /^\d{12}$/.test(parts[1] ?? '') ? 2 : 3;
    if (parts[nameIdx]) return tidy(parts[nameIdx]!);
  }
  const m = narration.match(/(?:paid to|sent to|received from|at)\s+([A-Za-z0-9 &.'-]{2,40})/i);
  if (m) return tidy(m[1]!);
  return tidy(narration.replace(/\d{6,}/g, '').slice(0, 40)) || 'Unknown';
}

function tidy(s: string): string {
  return s.replace(/@[a-z0-9]+$/i, '').replace(/\s+/g, ' ').trim()
    .replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
}

export function normalizeNarration(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
