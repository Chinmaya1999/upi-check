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

/** A genuine debit/credit alert always points at the user's own account, card or a UPI/bank rail. Merchant receipts
 *  ("Txn ID", "Order #") and registration/policy receipts do not, so they are not counted. */
const TXN_ANCHOR = /\b(?:a\/c|acct?|account|card|upi|vpa|imps|neft|rtgs|atm)\b|\bx{2,}\d{3,4}\b|\*{2,}\d{3,4}/i;
/** Promotions, bonuses, receipts and phishing that merely contain "credited"/"debit" and an amount. */
const FAKE_HINT = /\b(?:won|winner|lottery|prize|congratulations|claim|gift|click here|update your kyc|(?:will be )?(?:blocked|suspended)|bit\.ly|tinyurl|sale|discount|cashback|bonus|redeem|rewards?|points?|vouchers?|coupons?|promo|promo code|use code|coupon code|code:|use [A-Z0-9]{5,}|shop now|visit|t&c|worth|checkout|benefit|exclusive|warranty|exchange|birthday|off on|min(?:imum)?\s+(?:purchase|order|rs)|order\s*#|enjoy|receipt no)\b/i;
const LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:io|ltd|co|com|in|me)\/|\bbit\.ly/i;
const MASKED_ACCOUNT = /\b(?:a\/c|acct?|account|card)\W{0,6}(?:no\.?\W{0,3})?(?:x+|\*+|\.+)?\s?\d{3,4}\b/i;
/** True for a completed debit/credit alert on the user's account. Everything else (promos, OTPs, receipts, chats) is false. */
export function isGenuineTxnText(text: string): boolean {
  const body = text.replace(/\s+/g, ' ').trim();
  if (NOT_A_TXN.test(body) || FAKE_HINT.test(body) || !TXN_ANCHOR.test(body) || !AMOUNT.test(body)) return false;
  // A link is fine only when the message names a masked account (real alerts); promos with links never do.
  return !LINK.test(body) || MASKED_ACCOUNT.test(body);
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
  if (!isGenuineTxnText(body)) return null;

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

/**
 * Payment, wallet and bank apps whose notifications Paisa understands (an allow-list: no other app is ever read).
 * Several bank apps share the 'bank_app' tag; the exact bank still comes from the matching SMS when there is one.
 */
export const APP_PACKAGES: Record<string, PaymentApp> = {
  // UPI & wallets
  'com.google.android.apps.nbu.paisa.user': 'gpay',
  'com.phonepe.app': 'phonepe',
  'net.one97.paytm': 'paytm',
  'in.org.npci.upiapp': 'bhim',
  'in.amazon.mShop.android.shopping': 'amazonpay',
  'com.dreamplug.androidapp': 'cred',
  'com.mobikwik_new': 'mobikwik',
  'com.freecharge.android': 'freecharge',
  'com.myairtelapp': 'airtel',
  'com.jio.myjio': 'jio',
  'indwin.c3.shareapp': 'slice',
  'com.naviapp': 'navi',
  'money.jupiter': 'jupiter',
  'com.epifi.paisa': 'fi',
  'com.enstage.wibmo.hdfc': 'payzapp',
  'com.bharatpe.app': 'bharatpe',
  'com.fampay.in': 'fampay',
  'com.sliceit.app': 'slice',
  'com.sbi.upi': 'bank_app',
  'com.pnb.onestop': 'bank_app',
  'com.infrasoft.uboi': 'bank_app',
  'com.kotak811mobilebankingapp.instantsavingsupiscanandpayrecharge': 'bank_app',
  'com.upi.axispay': 'bank_app',
  // Bank apps
  'com.snapwork.hdfc': 'bank_app',
  'com.sbi.lotusintouch': 'bank_app',
  'com.sbi.SBIFreedomPlus': 'bank_app',
  'com.csam.icici.bank.imobile': 'bank_app',
  'com.icicibank.pockets': 'bank_app',
  'com.axis.mobile': 'bank_app',
  'com.msf.kbank.mobile': 'bank_app',
  'com.bankofbaroda.mconnect': 'bank_app',
  'com.canarabank.mobility': 'bank_app',
  'com.idfcfirstbank.optimus': 'bank_app',
  'com.yesbank': 'bank_app',
};

/** Display names for every PaymentApp (labels in lists, receipts and the per-app summary). */
export const PAYMENT_APP_NAMES: Record<PaymentApp, string> = {
  gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM', amazonpay: 'Amazon Pay', cred: 'CRED', mobikwik: 'MobiKwik',
  freecharge: 'Freecharge', airtel: 'Airtel Thanks', jio: 'Jio', slice: 'slice', navi: 'Navi', jupiter: 'Jupiter', fi: 'Fi', payzapp: 'PayZapp', bharatpe: 'BharatPe', fampay: 'FamPay',
  bank_app: 'Bank app', unknown: 'Unknown app',
};

/** SMS apps. Only used (direct build) to catch bank messages that arrive as RCS / "verified SMS" and never reach the SMS inbox. */
export const MESSAGING_PACKAGES = new Set([
  'com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms', 'com.truecaller',
]);
/** Truecaller (as SMS app / smart-SMS inbox) often shows the sender as a name ("HDFC Bank") instead of a sender ID. */
const TRUECALLER = 'com.truecaller';

// Payment-app wording varies a lot: "Paid ₹100 to X", "You've sent Rs 100 to X", "Payment of ₹100 to X successful",
// "X sent you ₹100", "₹100 received from X", "Rs.100 debited from a/c XX1234".
const SENT_YOU = /\b(?:sent|paid|transferred)\s+you\b/i;
const PAID = /\b(?:paid|sent|payment of|transferred)\b/i;
const RECEIVED = /\b(?:received|credited|refund(?:ed)?)\b/i;
const DEBITED = /\bdebited\b/i;
const NOT_PAYMENT_NOTE = /\b(pending|processing|scheduled|request(?:ed)?|reminder|will be|failed|declined|unsuccessful|couldn'?t|could not)\b/i;

/** "Name + 7 more", "3 new messages": grouped summaries repeat or hide real payments, never one payment. */
export const BUNDLE_NOTE = /\+\s*\d+\s*more\b|\b\d+\s+(?:new\s+)?(?:messages?|notifications?|transactions?)\b/i;
const PROMO_NOTE = /\b(?:cashback|rewards?|scratch|offers?|win|bonus|coupons?|vouchers?|get up to|earn|discounts?|refer|unlock|deals?|sale|minimum purchase|purchase value|min(?:imum)? order|website|download|invite|claim|exclusive|hurry|limited time|expires?|valid (?:till|until)|use code)\b|%\s*off|\boff\*/i;

/** Parses a notification from a supported payment / bank app. The app is known from the package name. */
export function parseAppNotification(n: AppNotification): RawTransaction | null {
  const app = APP_PACKAGES[n.pkg];
  if (!app) return null;
  const text = `${n.title} ${n.text}`.replace(/\s+/g, ' ').trim();
  if (NOT_A_TXN.test(text) || NOT_PAYMENT_NOTE.test(text) || BUNDLE_NOTE.test(text) || PROMO_NOTE.test(text)) return null;
  const amt = text.match(AMOUNT);
  if (!amt) return null;

  let direction: TxnDirection | null = null;
  let who: string | undefined;
  const clean = (v?: string) => v?.replace(/[.!,]+$/, '').trim() || undefined;
  const toName = text.match(/\bto\s+(.{2,40}?)(?:\s+(?:using|via|from|on|successful|successfully|at|ref)|[.!,(]|$)/i)?.[1];
  const fromName = text.match(/\bfrom\s+(.{2,40}?)(?:\s+(?:using|via|on|at|ref|a\/c)|[.!,(]|$)/i)?.[1];

  if (SENT_YOU.test(text)) {                      // "Rahul sent you ₹500"
    direction = 'credit';
    who = clean(n.text.replace(/\s+/g, ' ').trim().match(/^(.{2,40}?)\s+(?:has\s+)?(?:sent|paid|transferred)\s+you\b/i)?.[1]) ?? clean(fromName);
  } else if (RECEIVED.test(text) && !/\b(?:paid|sent)\s+(?:₹|rs|inr)/i.test(text.slice(0, 14))) {
    direction = 'credit'; who = clean(fromName);
  } else if (PAID.test(text) || DEBITED.test(text)) {
    direction = 'debit'; who = clean(toName);
  }
  if (!direction) return null;
  const name = who ?? (direction === 'debit' ? 'payment' : 'received');
  return {
    source: 'notification',
    sourceRecordId: `ntf:${n.id}`,
    accountId: `app:${app}`,
    amount: amt[1]!.replace(/,/g, ''),
    date: toIso(n.postedAt),
    direction,
    narration: `UPI/${name}`,
    paymentApp: app,
    original: n,
  };
}

const SENDER_ID = /^[A-Z]{2}-[A-Z0-9]{3,10}(?:-[A-Z])?$/;
/**
 * A bank message seen as a notification from the phone's SMS app (RCS / verified SMS never lands in the SMS inbox).
 * Only strict sender IDs like "AX-AIRBNK-S" are accepted, so it yields the same account as the SMS reader and the
 * engine de-duplicates by Txn ID. Chats with people and display names like "Airtel" are ignored.
 */
export function parseMessagingNotification(n: AppNotification): RawTransaction | null {
  if (!MESSAGING_PACKAGES.has(n.pkg)) return null;
  const title = n.title.trim();
  // Truecaller: accept display names too; parseBankSms still needs an amount + debit/credit wording, so calls/spam alerts are ignored.
  if (!SENDER_ID.test(title) && !(n.pkg === TRUECALLER && looksLikeBankSender(title))) return null;
  const r = parseBankSms({ id: `n${n.id}`, address: title, body: n.text, date: n.postedAt });
  return r ? { ...r, sourceRecordId: `sms:n${n.id}` } : null;
}

/**
 * Truecaller's transaction card, e.g. title "Canara Bank", "+ ₹10", "UPI transfer from Chinmaya to Account 3804", "Account xx3804".
 * The listener sends every string of the card joined with " | ". Anything that is not clearly a money movement is ignored.
 */
export function parseTruecallerCard(n: AppNotification): RawTransaction | null {
  if (n.pkg !== TRUECALLER) return null;
  const text = `${n.title} | ${n.text}`.replace(/\s+/g, ' ').trim();
  if (NOT_A_TXN.test(text) || NOT_PAYMENT_NOTE.test(text)) return null;
  const am = text.match(/([+\-−–])?\s*(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)(?![\d,]*\s?(?:l|k|cr|lakh|lac|crore)\b)/i);
  if (!am) return null;
  const last4 = text.match(/\b(?:account|a\/c|acct?|card)\W{0,4}(?:no\.?\W{0,3})?(?:x+|\*+|\.+)?\s?(\d{3,4})\b/i)?.[1];
  const sign = am[1];
  let direction: TxnDirection | null = null;
  if (sign === '+') direction = 'credit';
  else if (sign) direction = 'debit';
  else if (/\bto\s+(?:your\s+)?(?:a\/c|acct?|account)\b/i.test(text) || RECEIVED.test(text)) direction = 'credit';
  else if (/\bfrom\s+(?:your\s+)?(?:a\/c|acct?|account)\b/i.test(text) || PAID.test(text) || DEBITED.test(text)) direction = 'debit';
  if (!direction || !last4) return null;               // without an account we cannot tell whose money moved: leave it to the SMS
  const bank = (text.match(/\b([A-Z][A-Za-z&]+(?:\s[A-Z][A-Za-z&]+)?\s(?:Bank|Payments Bank|Finance Bank))\b/)?.[1] ?? n.title).trim().toUpperCase();
  const who = text.match(/\bfrom\s+(.{2,30}?)\s+to\b/i)?.[1] ?? text.match(/\bto\s+(.{2,30}?)(?:\s*[|.]|$)/i)?.[1];
  return {
    source: 'sms',
    sourceRecordId: `tc:${n.id}`,
    accountId: `${bank}:${last4}`,
    amount: am[2]!.replace(/,/g, ''),
    date: toIso(n.postedAt),
    direction,
    narration: `UPI/${who && !/account/i.test(who) ? who : direction === 'credit' ? 'received' : 'payment'}`,
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
  // "…in your slice bank a/c xx9882" names the account the money moved in. A bank record for a different account is a different payment.
  const last4Of = (t: Transaction) => JSON.stringify(t.originals).match(/(?:a\/c|acct?|account|card)\W{0,6}(?:no\.?\W{0,3})?(?:x+|\*+|\.+)?\s?(\d{3,4})\b/i)?.[1];
  for (const a of appOnly) {
    const at = Date.parse(a.occurredAt);
    const aL4 = last4Of(a);
    const hit = bank
      .filter((b) => { const bL4 = b.accountId.split(':')[1]; return !(aL4 && bL4 && /^\d{3,4}$/.test(bL4) && aL4 !== bL4); })
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
