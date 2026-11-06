import { describe, expect, it } from 'vitest';
import { attributeApps, ingestBatch, parseAppNotification, parseBankSms, summarizeDayByApp } from '../src';

const T = Date.parse('2026-11-04T09:15:00+05:30');
const sms = (body: string, address = 'AX-HDFCBK', id = 1, date = T) => parseBankSms({ id, address, body, date });
const now = new Date('2026-11-04T12:00:00+05:30');
const ingest = (raws: any[], existing: any[] = []) => ingestBatch(raws, { existing, consents: [{ id: 'c', accountId: '*', sources: ['notification'], status: 'active' }], now }).store;

describe('bank SMS parsing', () => {
  it('ignores promotional SMS that mention amounts (Rs.5L, Rs.1,000 cashback)', () => {
    expect(sms('Complete KYC and unlock approval up to Rs.5L + flat Rs.1,000 cashback on your 1st EMI purchase with Bajaj Easy EMI. Check now https://a.bflcomm.in/BAJAJF/iLQzo', 'AX-BFLFIN-P')).toBeNull();
    expect(sms('Get pre-approved limit up to Rs.2K on your first purchase', 'AX-BFLFIN-P')).toBeNull();
  });
  it('parses a UPI debit', () => {
    const r = sms('Rs.450.00 debited from a/c XX1234 on 04-11-26 to VPA swiggy@icici (UPI Ref No 412345678901). Avl Bal Rs.12,000.50')!;
    expect(r).toMatchObject({ direction: 'debit', amount: '450.00', reference: '412345678901', accountId: 'HDFCBK:1234', balancePaise: 1200050 });
    const [t] = ingest([r]);
    expect(t).toMatchObject({ amountPaise: 45000, merchant: 'Swiggy', channel: 'upi', dayKey: '2026-11-04' });
  });
  it('parses a credit and does not take the balance as the amount', () => {
    const r = sms('INR 5,000.00 credited to A/c XX1234 on 04-Nov-26 by UPI from ramesh@oksbi. UPI Ref 412345678902. Avl Bal INR 17,000.00', 'VM-SBIUPI')!;
    expect(r).toMatchObject({ direction: 'credit', amount: '5000.00', reference: '412345678902' });
  });
  it('parses "Sent Rs.x From ... To ..." style', () => {
    const r = sms('Sent Rs.120.00 From HDFC Bank A/C *1234 To ZOMATO On 04/11/26 Ref 412345678903')!;
    expect(r).toMatchObject({ direction: 'debit', amount: '120.00', reference: '412345678903' });
    expect(ingest([r])[0]).toMatchObject({ merchant: 'Zomato', categoryId: 'food' });
  });
  it('ignores OTPs, requests, failures, dues, promos and personal numbers', () => {
    expect(sms('123456 is your OTP for Rs.500 txn. Do not share.')).toBeNull();
    expect(sms('Rs.500 will be debited from your a/c on 05-11-26 for autopay')).toBeNull();
    expect(sms('Your txn of Rs.500 failed. Amount not debited.')).toBeNull();
    expect(sms('Minimum amount due Rs.2,000 on your credit card. Pay now')).toBeNull();
    expect(sms('Rs.450 debited from a/c XX1234', '+919876543210')).toBeNull();
  });
  it('same SMS ingested twice is counted once', () => {
    const r = sms('Rs.450.00 debited from a/c XX1234 to VPA swiggy@icici (UPI Ref No 412345678901)')!;
    const first = ingest([r]);
    expect(ingest([r], first).length).toBe(1);
  });
});

describe('app notifications + attribution', () => {
  const n = (pkg: string, title: string, text = '', postedAt = T + 20_000) => parseAppNotification({ id: `${pkg}${postedAt}`, pkg, title, text, postedAt });
  it('parses paid / received and identifies the app by package', () => {
    expect(n('com.phonepe.app', 'Paid ₹450 to Swiggy')).toMatchObject({ direction: 'debit', paymentApp: 'phonepe', amount: '450' });
    expect(n('com.google.android.apps.nbu.paisa.user', 'Received ₹1,200 from Ramesh')).toMatchObject({ direction: 'credit', paymentApp: 'gpay', amount: '1200' });
    expect(n('com.whatsapp', 'Paid ₹450 to X')).toBeNull();
    expect(n('com.phonepe.app', 'Payment of ₹450 failed')).toBeNull();
  });
  it('merges a notification into the matching bank SMS txn and attributes the app', () => {
    const bank = ingest([sms('Rs.450.00 debited from a/c XX1234 to VPA swiggy@icici (UPI Ref No 412345678901)')!]);
    const all = ingest([n('com.phonepe.app', 'Paid ₹450 to Swiggy')!], bank);
    expect(all.length).toBe(2);
    const { update, remove } = attributeApps(all);
    expect(remove.length).toBe(1);
    expect(update[0]!.paymentApp).toBe('phonepe');
  });
  it('per-app day totals', () => {
    const bank = ingest([
      sms('Rs.450.00 debited from a/c XX1234 to VPA swiggy@icici (UPI Ref No 412345678901)')!,
      sms('INR 5,000.00 credited to A/c XX1234 UPI Ref 412345678902', 'AX-HDFCBK', 2, T + 60_000)!,
    ]);
    const rows = summarizeDayByApp(bank, '2026-11-04');
    expect(rows).toEqual([{ app: 'unknown', debitPaise: 45000, creditPaise: 500000, count: 2 }]);
  });
});
