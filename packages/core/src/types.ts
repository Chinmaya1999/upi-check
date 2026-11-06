/** All money is integer paise. Never floats. */
export type Paise = number;

export type TxnDirection = 'debit' | 'credit';
export type TxnStatus = 'confirmed' | 'pending' | 'failed' | 'reversed';
export type SourceKind = 'account_aggregator' | 'notification' | 'csv' | 'pdf' | 'manual' | 'sms';
export type PaymentChannel = 'upi' | 'bank_transfer' | 'card' | 'cash' | 'other';

/**
 * Payment app is only set when a source positively identifies it (e.g. a
 * notification posted by the Google Pay package). Bank data alone never
 * tells us the app, so the default is 'unknown'. We do not guess.
 */
export type PaymentApp =
  | 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'amazonpay' | 'cred' | 'mobikwik' | 'freecharge' | 'airtel' | 'jio'
  | 'slice' | 'navi' | 'jupiter' | 'fi' | 'payzapp' | 'bharatpe' | 'fampay' | 'bank_app' | 'unknown';

/**
 * How a transaction participates in totals.
 *  normal        - counts as income/expense
 *  refund        - merchant refund: credit that REDUCES spend, not income
 *  reversal      - failed/auto-reversed payment pair: excluded both sides
 *  self_transfer - between the user's own accounts: excluded
 */
export type TxnKind = 'normal' | 'refund' | 'reversal' | 'self_transfer';

export interface RawTransaction {
  source: SourceKind;
  /** Identifier of the record inside the source system, if any. */
  sourceRecordId?: string;
  accountId: string;
  /** Rupees as string/number ("1,250.50") or already-paise via amountPaise. */
  amount?: string | number;
  amountPaise?: Paise;
  currency?: string;
  /** ISO-8601 or "DD/MM/YYYY[ HH:mm[:ss]]" or "DD-MM-YYYY". */
  date: string;
  direction?: TxnDirection;
  narration: string;
  reference?: string;
  status?: string;
  paymentApp?: PaymentApp;
  balancePaise?: Paise;
  /** Untouched payload from the source, preserved verbatim. */
  original?: unknown;
}

export interface Transaction {
  id: string;
  accountId: string;
  direction: TxnDirection;
  amountPaise: Paise;
  currency: 'INR';
  /** ISO-8601 with explicit offset. */
  occurredAt: string;
  /** yyyy-mm-dd in IST — the day this transaction belongs to. */
  dayKey: string;
  status: TxnStatus;
  kind: TxnKind;
  channel: PaymentChannel;
  paymentApp: PaymentApp;
  merchant: string;
  narration: string;
  /** UPI RRN / UTR / bank reference when available. */
  reference: string | null;
  categoryId: string;
  needsReview: boolean;
  /** For refunds/reversals: the debit this credit relates to. */
  linkedTransactionId: string | null;
  fingerprint: string;
  /** Fingerprints of every raw record merged in, so re-importing any of them is a no-op. */
  altFingerprints: string[];
  sources: SourceKind[];
  /** Every raw record that produced or was merged into this transaction. */
  originals: { source: SourceKind; payload: unknown; receivedAt: string }[];
}

export interface Consent {
  id: string;
  accountId: string | '*';
  sources: SourceKind[];
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: string;
}

export type IngestResult =
  | { outcome: 'saved'; transaction: Transaction }
  | { outcome: 'merged'; transaction: Transaction; duplicateOf: string }
  | { outcome: 'rejected'; reason: string };

export interface DaySummary {
  dayKey: string;
  incomePaise: Paise;
  /** Net spend: gross debits minus refunds received, floored at 0. */
  expensePaise: Paise;
  grossExpensePaise: Paise;
  refundPaise: Paise;
  netPaise: Paise;
  pendingDebitPaise: Paise;
  count: number;
}
