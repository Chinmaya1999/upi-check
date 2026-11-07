import { describe, expect, it } from 'vitest';
import { APP_PACKAGES, ingestBatch, parseAppNotification, parseBankSms, parseMessagingNotification, parseTruecallerCard, summarizeDay } from '../src';

const T = Date.parse('2026-11-06T18:10:00+05:30');
const note = (pkg: string, title: string, text: string, id = 'n1') => parseAppNotification({ id, pkg, title, text, postedAt: T });
const GPAY = 'com.google.android.apps.nbu.paisa.user', PHONEPE = 'com.phonepe.app', CRED = 'com.dreamplug.androidapp';

describe('payment-app notifications (many apps, many phrasings)', () => {
  it('covers the major UPI, wallet and bank apps', () => {
    expect(Object.keys(APP_PACKAGES).length).toBeGreaterThanOrEqual(25);
    expect(Object.values(APP_PACKAGES)).toEqual(expect.arrayContaining(['gpay', 'phonepe', 'paytm', 'bhim', 'amazonpay', 'cred', 'airtel', 'bank_app']));
  });

  it.each([
    [GPAY, 'Google Pay', 'Paid ₹450 to Swiggy', 'debit', '450', 'Swiggy'],
    [GPAY, 'Google Pay', 'You paid ₹1,299.50 to Amazon Pay using HDFC Bank', 'debit', '1299.50', 'Amazon Pay'],
    [PHONEPE, 'PhonePe', 'Payment of ₹200 to Chai Point successful', 'debit', '200', 'Chai Point'],
    [PHONEPE, 'PhonePe', 'Sent ₹75 to Rahul Kumar', 'debit', '75', 'Rahul Kumar'],
    [CRED, 'CRED', "You've paid ₹5,000 to HDFC Credit Card", 'debit', '5000', 'HDFC Credit Card'],
    [PHONEPE, 'PhonePe', 'Received ₹500 from Anita', 'credit', '500', 'Anita'],
    [PHONEPE, 'PhonePe', 'Rahul Kumar sent you ₹250', 'credit', '250', 'Rahul Kumar'],
    [GPAY, 'Google Pay', 'Priya paid you ₹90', 'credit', '90', 'Priya'],
    ['com.snapwork.hdfc', 'HDFC Bank', 'Rs 500.00 debited from a/c XX1234 on 06-11-26', 'debit', '500.00', undefined],
    ['com.snapwork.hdfc', 'HDFC Bank', 'Rs 1,000 credited to your a/c XX1234', 'credit', '1000', undefined],
    ['com.myairtelapp', 'Airtel Thanks', 'Rs. 192.00 debited from Airtel Payments Bank a/c', 'debit', '192.00', undefined],
  ])('%s: "%s" -> %s %s', (pkg, title, text, dir, amount, who) => {
    const r = note(pkg, title, text);
    expect(r).toMatchObject({ direction: dir, amount, source: 'notification', paymentApp: APP_PACKAGES[pkg] });
    if (who) expect(r!.narration).toBe(`UPI/${who}`);
  });

  it('ignores things that are not a completed payment', () => {
    for (const t of [
      'Payment of ₹100 to Swiggy failed', 'Payment pending: ₹100 to Swiggy', 'Rahul requested ₹300 from you',
      'Reminder: pay ₹500 to Airtel', 'Get flat ₹100 cashback offer on your first payment', 'Your OTP for ₹500 payment is 123456',
      'Weekly offers from ₹99 only',
    ]) expect(note(PHONEPE, 'PhonePe', t)).toBeNull();
  });

  it('ignores apps that are not on the allow-list', () => {
    expect(note('com.whatsapp', 'Rahul', 'Paid ₹500 to you')).toBeNull();
    expect(note('com.example.unknown', 'X', 'Received ₹500 from Y')).toBeNull();
  });
});

describe('bank messages seen as SMS-app notifications (RCS / verified SMS)', () => {
  const GM = 'com.google.android.apps.messaging';
  const body = 'Rs. 33.00 debited from Airtel Payments Bank a/c Txn ID 075137952071 Bal:2331.75 Call 180023400 for help';
  const msg = (title: string, text: string, pkg = GM) => parseMessagingNotification({ id: 'm1', pkg, title, text, postedAt: T });

  it('parses a bank sender', () => {
    expect(msg('AX-AIRBNK-S', body)).toMatchObject({ direction: 'debit', amount: '33.00', accountId: 'AIRBNK:xxxx', source: 'sms' });
  });
  it('ignores people, display names, other apps and promos', () => {
    expect(msg('Mom', 'Paid Rs. 500 to you')).toBeNull();
    expect(msg('Airtel', body)).toBeNull();                       // display name: could not be matched to the SMS account
    expect(msg('AX-AIRBNK-S', body, 'com.whatsapp')).toBeNull();
    expect(msg('AX-BFLFIN-P', 'Complete KYC and unlock approval up to Rs.5L + flat Rs.1,000 cashback on your 1st EMI purchase')).toBeNull();
  });
  it('reads transaction alerts shown by Truecaller, including display-name senders', () => {
    expect(msg('AX-AIRBNK-S', body, 'com.truecaller')).toMatchObject({ direction: 'debit', amount: '33.00' });
    expect(msg('Airtel Payments Bank', body, 'com.truecaller')).toMatchObject({ direction: 'debit', amount: '33.00' });
    expect(msg('Missed call', 'Rahul called you', 'com.truecaller')).toBeNull();
    expect(msg('AX-HDFCBK', 'Congratulations! You won Rs 5000 credited to your account, click here')).toBeNull();
    expect(msg('Mom', 'Paid Rs. 500 to you', 'com.truecaller')).toBeNull(); // a chat with no account/UPI/ref detail is not a bank alert
  });
  it('counts one payment once when the same message also reached the SMS inbox', () => {
    const fromInbox = parseBankSms({ id: 77, address: 'AX-AIRBNK-S', body, date: T })!;
    const fromNotif = parseMessagingNotification({ id: 'm9', pkg: GM, title: 'AX-AIRBNK-S', text: body, postedAt: T + 4000 })!;
    const consents = [{ id: 'c', accountId: '*', sources: ['sms' as const, 'notification' as const], status: 'active' as const }];
    const { store } = ingestBatch([fromInbox, fromNotif], { existing: [], consents, now: new Date('2026-11-06T21:00:00+05:30') });
    expect(store).toHaveLength(1);
    expect(summarizeDay(store, '2026-11-06').expensePaise).toBe(3300);
  });
});

describe("a day of real Airtel Payments Bank SMS adds up to the bank's own figures", () => {
  it('6 messages: ₹381.82 spent, ₹10 received', () => {
    const D = (t: string) => Date.parse(`2026-11-06T${t}:00+05:30`);
    const sms: [string, string][] = [
      ['09:50', 'Rs. 33.00 debited from Airtel Payments Bank a/c Txn ID 075137952071 Bal:2331.75 Call 180023400 for help'],
      ['11:14', 'Rs. 116.82 debited from Airtel Payments Bank a/c Txn ID 884308484945 Bal:2214.93 Call 180023400 for help'],
      ['12:31', 'Rs. 30.00 debited from Airtel Payments Bank a/c Txn ID 631022258875 Bal:2184.93 Call 180023400 for help'],
      ['18:10', 'Rs. 192.00 debited from Airtel Payments Bank a/c Txn ID 631093218394 Bal:1992.93 Call 180023400 for help'],
      ['20:36', 'Airtel Payments Bank a/c is credited with Rs.10.00. Txn ID: 494517176534. Call 180023400 for help'],
      ['20:37', 'Rs. 10.00 debited from Airtel Payments Bank a/c Txn ID 584275252144 Bal:1992.93 Call 180023400 for help'],
    ];
    const raws = sms.map(([t, b], i) => parseBankSms({ id: i, address: 'AX-AIRBNK-S', body: b, date: D(t) })!);
    const consents = [{ id: 'c', accountId: '*', sources: ['sms' as const], status: 'active' as const }];
    const { store } = ingestBatch(raws, { existing: [], consents, now: new Date('2026-11-06T21:00:00+05:30') });
    const day = summarizeDay(store, '2026-11-06');
    expect(day.expensePaise).toBe(38182);
    expect(day.incomePaise).toBe(1000);
    expect(day.count).toBe(6);
  });
});

describe('Truecaller transaction card', () => {
  const card = (text: string) => parseTruecallerCard({ id: 'tc1', pkg: 'com.truecaller', title: 'Canara Bank', text, postedAt: T });
  it('reads the card shown in the shade', () => {
    expect(card('Canara Bank | + ₹10 | UPI transfer from Chinmaya to Account 3804 | Account xx3804')).toMatchObject({ direction: 'credit', amount: '10', accountId: 'CANARA BANK:3804' });
    expect(card('₹10 | UPI transfer from Chinmaya to your account')).toBeNull();            // no account digits
    expect(card('Canara Bank | - ₹250 | Paid to Zomato | Account xx3804')).toMatchObject({ direction: 'debit', amount: '250' });
    expect(card('Missed call from Rahul')).toBeNull();
    // As the app receives it: the listener puts the sign (read from the amount's colour) on the title.
    const real = (title: string) => parseTruecallerCard({ id: 'tc2', pkg: 'com.truecaller', title, text: 'Business chat from Canara Bank | •  Canara Bank  •  Chinmaya | Chinmaya | • Account xx3804 | ₹10', postedAt: T });
    expect(real('+ ₹10')).toMatchObject({ direction: 'credit', amount: '10', accountId: 'CANARA BANK:3804' });
    expect(real('- ₹10')).toMatchObject({ direction: 'debit', amount: '10' });
    expect(real('₹10')).toBeNull();                                                              // no direction at all: never guess
  });
});
