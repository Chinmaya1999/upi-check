import type { Transaction } from '@upi/core';

export interface Bank { id: string; name: string; short: string; bg: string; fg: string; last4: string | null }

/** Sender-code prefixes used by Indian banks in SMS headers (e.g. "AX-HDFCBK", "VM-AIRBNK"). Colours are each brand's primary colour. */
const BANKS: { re: RegExp; id: string; name: string; short: string; bg: string; fg?: string }[] = [
  { re: /^(AIRBNK|AIRTEL|AIRPAY|APBL|AIRPB)/, id: 'airtel', name: 'Airtel Payments Bank', short: 'a', bg: '#E40000' },
  { re: /^(PYTM|PAYTM|PPBL)/, id: 'paytmbank', name: 'Paytm Payments Bank', short: 'P', bg: '#00B9F1' },
  { re: /^(JIOPAY|JPBL|JIOBNK)/, id: 'jio', name: 'Jio Payments Bank', short: 'Jio', bg: '#0A2885' },
  { re: /^(IPPB|INDPOST)/, id: 'ippb', name: 'India Post Payments Bank', short: 'IP', bg: '#D32F2F' },
  { re: /^(HDFC)/, id: 'hdfc', name: 'HDFC Bank', short: 'H', bg: '#004C8F' },
  { re: /^(SBI|SBM|SBIN)/, id: 'sbi', name: 'State Bank of India', short: 'SBI', bg: '#1C74D0' },
  { re: /^(ICICI)/, id: 'icici', name: 'ICICI Bank', short: 'i', bg: '#F37E20' },
  { re: /^(AXIS|AXISBK|AXISB)/, id: 'axis', name: 'Axis Bank', short: 'A', bg: '#97144D' },
  { re: /^(KOTAK|KMBL|KKBK)/, id: 'kotak', name: 'Kotak Mahindra Bank', short: 'K', bg: '#ED1C24' },
  { re: /^(PNB|PUNB)/, id: 'pnb', name: 'Punjab National Bank', short: 'PNB', bg: '#A20A3A' },
  { re: /^(BOB|BARODA)/, id: 'bob', name: 'Bank of Baroda', short: 'BoB', bg: '#F26522' },
  { re: /^(CANBNK|CANARA|CNRB)/, id: 'canara', name: 'Canara Bank', short: 'C', bg: '#0070B8' },
  { re: /^(UNION|UBI|UBIN)/, id: 'union', name: 'Union Bank of India', short: 'U', bg: '#D6201F' },
  { re: /^(IDBI)/, id: 'idbi', name: 'IDBI Bank', short: 'ID', bg: '#00836C' },
  { re: /^(YES)/, id: 'yes', name: 'YES Bank', short: 'Y', bg: '#0066B3' },
  { re: /^(INDUS|IBL)/, id: 'indusind', name: 'IndusInd Bank', short: 'In', bg: '#7B1E3A' },
  { re: /^(IDFC)/, id: 'idfc', name: 'IDFC FIRST Bank', short: 'F', bg: '#9C1D26' },
  { re: /^(FEDBK|FEDERAL|FDRL)/, id: 'federal', name: 'Federal Bank', short: 'Fe', bg: '#0F4C9B' },
  { re: /^(BOI|BKOI)/, id: 'boi', name: 'Bank of India', short: 'BoI', bg: '#00539B' },
  { re: /^(INDBNK|INDIAN|IDIB)/, id: 'indian', name: 'Indian Bank', short: 'IB', bg: '#1B3A6B' },
  { re: /^(CBSSBI|CENTRAL|CBIN)/, id: 'cbi', name: 'Central Bank of India', short: 'CB', bg: '#D5252A' },
  { re: /^(UCO)/, id: 'uco', name: 'UCO Bank', short: 'UCO', bg: '#1F4E9E' },
  { re: /^(AU|AUBANK|AUSFB)/, id: 'au', name: 'AU Small Finance Bank', short: 'AU', bg: '#F26B21' },
  { re: /^(RBL)/, id: 'rbl', name: 'RBL Bank', short: 'R', bg: '#21409A' },
  { re: /^(BANDHAN|BDBL)/, id: 'bandhan', name: 'Bandhan Bank', short: 'B', bg: '#D32027' },
  { re: /^(SIB|SOUTHIN)/, id: 'sib', name: 'South Indian Bank', short: 'SIB', bg: '#00539F' },
  { re: /^(KVB|KARURV)/, id: 'kvb', name: 'Karur Vysya Bank', short: 'KV', bg: '#006B3F' },
  { re: /^(DCB)/, id: 'dcb', name: 'DCB Bank', short: 'DCB', bg: '#0A8A4B' },
];

const APPS: Record<string, { name: string; short: string; bg: string }> = {
  gpay: { name: 'Google Pay', short: 'G', bg: '#4285F4' },
  phonepe: { name: 'PhonePe', short: 'Pe', bg: '#5F259F' },
  paytm: { name: 'Paytm', short: 'P', bg: '#00B9F1' },
  bhim: { name: 'BHIM', short: 'B', bg: '#F58220' },
  amazonpay: { name: 'Amazon Pay', short: 'A', bg: '#FF9900' },
  cred: { name: 'CRED', short: 'C', bg: '#1C1C1E' },
  mobikwik: { name: 'MobiKwik', short: 'M', bg: '#2E6BE6' },
  freecharge: { name: 'Freecharge', short: 'F', bg: '#F26A21' },
  airtel: { name: 'Airtel Thanks', short: 'a', bg: '#E40000' },
  jio: { name: 'Jio', short: 'J', bg: '#0A2885' },
  slice: { name: 'slice', short: 's', bg: '#6B2FD6' },
  navi: { name: 'Navi', short: 'N', bg: '#4C5BFF' },
  jupiter: { name: 'Jupiter', short: 'J', bg: '#FF7A00' },
  fi: { name: 'Fi', short: 'F', bg: '#00B8A9' },
  payzapp: { name: 'PayZapp', short: 'P', bg: '#004C8F' },
  bank_app: { name: 'Bank app', short: '₹', bg: '#475467' },
};

/** Which bank / wallet a transaction belongs to, derived from the SMS sender code stored in accountId. */
export function bankOf(t: Pick<Transaction, 'accountId' | 'sources'>): Bank {
  const [code = '', l4 = ''] = t.accountId.split(':');
  const last4 = /^\d{3,4}$/.test(l4) ? l4 : null;
  if (code === 'app') return { id: `app:${l4}`, name: APPS[l4]?.name ?? 'Payment app', short: APPS[l4]?.short ?? '₹', bg: APPS[l4]?.bg ?? '#667085', fg: '#fff', last4: null };
  if (t.sources.includes('manual') && !t.sources.includes('sms')) return { id: 'manual', name: 'Cash / manual', short: '₹', bg: '#12B886', fg: '#fff', last4: null };
  const hit = BANKS.find((b) => b.re.test(code.toUpperCase()));
  if (hit) return { id: hit.id + (last4 ? `:${last4}` : ''), name: hit.name, short: hit.short, bg: hit.bg, fg: hit.fg ?? '#fff', last4 };
  const pretty = code ? code.replace(/(BK|BNK|BANK)$/i, '') : 'Bank';
  return { id: `other:${code}${last4 ? ':' + last4 : ''}`, name: `${pretty.charAt(0).toUpperCase()}${pretty.slice(1).toLowerCase()} Bank`, short: (pretty[0] ?? 'B').toUpperCase(), bg: '#475467', fg: '#fff', last4 };
}
