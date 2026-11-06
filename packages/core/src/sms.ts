import type { PaymentApp, RawTransaction, Transaction, TxnDirection } from './types';
import { dayKeyOf } from './normalize';

export interface SmsMessage { id: string | number; address: string; body: string; date: number }
export interface AppNotification { id: string; pkg: string; title: string; text: string; postedAt: number }

const NOT_A_TXN = /\b(otp|one[- ]time|verification code|will be (?:debited|credited)|has been requested|request(?:ed)? (?:money|from)|collect request|declined|failed|unsuccessful|reversed|not (?:been )?(?:debited|credited)|if not (?:done|you)|minimum (?:amount )?due|total (?:amount )?due|payment due|bill (?:of|for)|statement|e-?mandate|autopay|reminder|offer|cashback offer|apply now|click|loan|emi due|kyc|unlock|pre-?approved|approval|flat rs\.?\s?[\d,]+\s+cashback|check now|eligible|limit (?:of|up to|upto))\b/i;
const DEBIT_WORDS = /\b(debited|debit|spent|sent|paid|withdrawn|purchase|purchased|deducted|transferred to|trf to)\b/i;
const CREDIT_WORDS = /\b(credited|credit(?:ed)? to|received|deposited|refund(?:ed)?)\b/i;
// (?!…) rejects shorthand like "Rs.5L" / "Rs.2K" / "Rs.1Cr", which are marketing figures, not real amounts.
const AMOUNT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)(?![\d,]*\s?(?:l|k|cr|lakh|lac|crore)\b)/i;

/** Sender IDs like "AX-HDFCBK", "VM-SBIUPI", "JD-ICICIT-S"; personal numbers are ignored. */
export function looksLikeBankSender(address: string): boolean {
  return !!address && !/^\+?[\d\s-]{8,}$/.test(address) && /[A-Za-z]{3,}/.test(address);
}

const senderCode = (address: string) => address.replace(/^[A-Za-z]{2}-/, '').replace(/-[A-Z]$/i, '').toUpperCase();

function detectDirection(text: string): TxnDirection | null {
  const d = text.search(DEBIT_WORDS), c = text.search(CREDIT_WORDS);
  if (d < 0 && c < 0) return null;
  if (d < 0) return 'credit';
  if (c < 0) return 'debit';
  // "credited to beneficiary" style: whichever verb comes first in the message wins
  return d < c ? 'debit' : 'credit';
}

function toIso(ms: number) { return new Date(ms).toISOString(); }

/** Turns one bank SMS into a RawTransaction, or null when it is not a completed debit/credit alert. */
export function parseBankSms(m: SmsMessage): RawTransaction | null {
  if (!looksLikeBankSender(m.address)) return null;
  const body = m.body.replace(/\s+/g, ' ').trim();
  if (NOT_A_TXN.test(body)) return null;

  // Ignore the trailing "Avl Bal Rs.x" amount: cut before the balance clause when extracting the txn amount.
  const balIdx = body.search(/\b(?:avl|avail(?:able)?|total|clear)\.?\s*bal/i);
  const main = balIdx > 0 ? body.slice(0, balIdx) : body;
  const amt = main.match(AMOUNT);
  if (!amt) return null;
  const direction = detectDirection(main);
  if (!direction) return null;

  const last4 = body.match(/(?:a\/c|acct?|account|card)\W{0,6}(?:no\.?\W{0,3})?(?:x+|\*+|\.+)?\s?(\d{3,4})\b/i)?.[1];
  const ref = body.match(/(?:upi\s*(?:ref(?:erence)?)?(?:\s*no\.?)?|ref(?:erence)?(?:\s*no\.?)?|rrn|utr|txn\s*id)\W{0,4}(\d{12})\b/i)?.[1];
  const vpa = body.match(/([a-z0-9._-]{2,}@[a-z]{2,})/i)?.[1];
  // Debits name the payee after "to"; credits name the payer after "from". (A bank's own name follows the other word.)
  const nameAfter = (w: string) => body.match(new RegExp(`\\b${w}\\s+(?:vpa\\s+)?(?!a\\/c|your|account|\\d)([A-Za-z0-9 &.'-]{2,40}?)(?=\\s+(?:on|ref|upi|via|using|\\(|-|at)\\b|[.,(]|$)`, 'i'))?.[1]?.trim();
  const name = direction === 'debit' ? nameAfter('to') ?? nameAfter('at') : nameAfter('from');
  const bal = body.match(/(?:avl|avail(?:able)?|total|clear)\.?\s*bal(?:ance)?\W{0,6}(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  const isUpi = /\bupi\b/i.test(body) || !!vpa || !!ref;

  const narration = isUpi && ref && (name || vpa)
    ? `UPI/${ref}/${name ?? vpa!.split('@')[0]}/${vpa ?? ''}`
    : body;

  return {
    source: 'sms',
    sourceRecordId: `sms:${m.id}`,
    accountId: `${senderCode(m.address)}:${last4 ?? 'xxxx'}`,
    amount: amt[1]!.replace(/,/g, ''),
    date: toIso(m.date),
    direction,
    narration,
    reference: ref,
    balancePaise: bal ? Math.round(parseFloat(bal.replace(/,/g, '')) * 100) : undefined,
    original: { address: m.address, body: m.body, date: m.date },
  };
}

export const APP_PACKAGES: Record<string, PaymentApp> = {
  'com.google.android.apps.nbu.paisa.user': 'gpay',
  'com.phonepe.app': 'phonepe',
  'net.one97.paytm': 'paytm',
  'in.org.npci.upiapp': 'bhim',
};

/** Parses a payment-app notification ("Paid ₹100 to X", "Received ₹500 from Y"). The app is known from the package. */
export function parseAppNotification(n: AppNotification): RawTransaction | null {
  const app = APP_PACKAGES[n.pkg];
  if (!app) return null;
  const text = `${n.title} ${n.text}`.replace(/\s+/g, ' ').trim();
  if (NOT_A_TXN.test(text) || /\b(pending|processing)\b/i.test(text)) return null;
  const amt = text.match(AMOUNT);
  if (!amt) return null;
  let direction: TxnDirection | null = null;
  let who: string | undefined;
  const paid = text.match(/\b(?:paid|sent|payment of)\b.*?\bto\s+(.{2,40}?)(?:\s+(?:using|via|from|on|successful)|[.!]|$)/i);
  const recv = text.match(/\b(?:received|credited)\b.*?\bfrom\s+(.{2,40}?)(?:\s+(?:using|via|on)|[.!]|$)/i);
  if (paid && !/received/i.test(text.slice(0, paid.index! + 5))) { direction = 'debit'; who = paid[1]; }
  else if (recv) { direction = 'credit'; who = recv[1]; }
  if (!direction) return null;
  return {
    source: 'notification',
    sourceRecordId: `ntf:${n.id}`,
    accountId: `app:${app}`,
    amount: amt[1]!.replace(/,/g, ''),
    date: toIso(n.postedAt),
    direction,
    narration: `UPI/${who!.trim()}`,
    paymentApp: app,
    original: n,
  };
}

const WINDOW_MS = 20 * 60 * 1000;

/**
 * The same payment can show up as a bank SMS and as an app notification. Keep the bank record
 * (it has the real account) and copy the app onto it; drop the app-only duplicate.
 */
export function attributeApps(all: Transaction[]): { update: Transaction[]; remove: string[] } {
  const appOnly = all.filter((t) => t.accountId.startsWith('app:'));
  const bank = all.filter((t) => !t.accountId.startsWith('app:'));
  const update = new Map<string, Transaction>();
  const remove: string[] = [];
  for (const a of appOnly) {
    const at = Date.parse(a.occurredAt);
    const hit = bank
      .filter((b) => b.direction === a.direction && b.amountPaise === a.amountPaise && Math.abs(Date.parse(b.occurredAt) - at) <= WINDOW_MS)
      .sort((x, y) => Math.abs(Date.parse(x.occurredAt) - at) - Math.abs(Date.parse(y.occurredAt) - at))
      .find((b) => (update.get(b.id) ?? b).paymentApp === 'unknown' || (update.get(b.id) ?? b).paymentApp === a.paymentApp);
    if (!hit) continue;
    const cur = update.get(hit.id) ?? hit;
    update.set(hit.id, {
      ...cur,
      paymentApp: a.paymentApp,
      sources: [...new Set([...cur.sources, ...a.sources])],
      originals: [...cur.originals, ...a.originals],
    });
    remove.push(a.id);
  }
  return { update: [...update.values()], remove };
}

export interface AppDayRow { app: PaymentApp; debitPaise: number; creditPaise: number; count: number }

/** Per-app debit/credit totals for one IST day. Same exclusion rules as summarizeDay (confirmed, normal/refund only). */
export function summarizeDayByApp(txns: Transaction[], dayKey: string): AppDayRow[] {
  const rows = new Map<PaymentApp, AppDayRow>();
  for (const t of txns) {
    if (t.dayKey !== dayKey || t.status !== 'confirmed' || t.kind === 'reversal' || t.kind === 'self_transfer') continue;
    const r = rows.get(t.paymentApp) ?? { app: t.paymentApp, debitPaise: 0, creditPaise: 0, count: 0 };
    if (t.direction === 'debit') r.debitPaise += t.amountPaise; else r.creditPaise += t.amountPaise;
    r.count++;
    rows.set(t.paymentApp, r);
  }
  return [...rows.values()].sort((a, b) => b.debitPaise + b.creditPaise - (a.debitPaise + a.creditPaise));
}

export const dayOf = dayKeyOf;
