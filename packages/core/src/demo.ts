import { addDays } from './summary';
import { dayKeyOf } from './normalize';
import type { RawTransaction } from './types';

/**
 * DEMO DATA ONLY. Deterministic, relative to `now`, so the dashboard always has
 * a "today" and "yesterday". Emitted as raw records and run through the real
 * engine, so every dashboard figure is still computed, not hardcoded.
 * Source is 'csv' (user-supplied) so no fake bank consent is implied.
 */
export const DEMO_ACCOUNTS = [
  { id: 'demo-hdfc', institution: 'HDFC Bank', mask: '4821' },
  { id: 'demo-sbi', institution: 'State Bank of India', mask: '7710' },
] as const;

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

const MERCHANTS: { name: string; vpa: string; min: number; max: number }[] = [
  { name: 'Swiggy', vpa: 'swiggy@icici', min: 180, max: 650 },
  { name: 'Zomato', vpa: 'zomato@hdfcbank', min: 200, max: 700 },
  { name: 'BigBasket', vpa: 'bigbasket@axisbank', min: 400, max: 1800 },
  { name: 'Blinkit', vpa: 'blinkit@yesbank', min: 150, max: 900 },
  { name: 'Uber', vpa: 'uber@axisbank', min: 120, max: 520 },
  { name: 'Rapido', vpa: 'rapido@ybl', min: 40, max: 160 },
  { name: 'Amazon', vpa: 'amazon@apl', min: 350, max: 3200 },
  { name: 'Airtel', vpa: 'airtel@paytm', min: 299, max: 599 },
  { name: 'Apollo Pharmacy', vpa: 'apollo@okhdfcbank', min: 120, max: 900 },
  { name: 'Netflix', vpa: 'netflix@icici', min: 199, max: 649 },
  { name: 'Chai Point', vpa: 'chaipoint@paytm', min: 30, max: 140 },
  { name: 'Ramesh Kumar', vpa: 'ramesh@oksbi', min: 100, max: 1500 }, // unknown person → review
];

export function generateDemoRaw(now: Date, days = 45): RawTransaction[] {
  const r = rng(20260411);
  const out: RawTransaction[] = [];
  const today = dayKeyOf(now);
  const nowMs = now.getTime();
  let rrn = 430000000000;
  const iso = (day: string, h: number, m: number) => `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`;
  const past = (day: string, h: number, m: number) => {
    // never emit a transaction in the future relative to `now`
    const t = iso(day, h, m);
    return new Date(t).getTime() > nowMs ? new Date(nowMs - 60_000).toISOString() : t;
  };

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const n = i === 0 ? 3 : 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const m = MERCHANTS[Math.floor(r() * MERCHANTS.length)]!;
      const amount = Math.round(m.min + r() * (m.max - m.min));
      const acct = r() < 0.7 ? DEMO_ACCOUNTS[0].id : DEMO_ACCOUNTS[1].id;
      rrn += 1 + Math.floor(r() * 9000);
      out.push({
        source: 'csv', accountId: acct, date: past(day, 8 + Math.floor(r() * 13), Math.floor(r() * 60)),
        direction: 'debit', amount,
        narration: `UPI/${rrn}/${m.name}/${m.vpa}`,
      });
      // ~1 in 4 payments are also seen as a notification from a payment app (same payment, other source)
      if (r() < 0.25) {
        const last = out[out.length - 1]!;
        out.push({
          source: 'manual', accountId: acct, date: last.date, direction: 'debit', amount,
          narration: `Paid to ${m.name}`, paymentApp: (['gpay', 'phonepe', 'paytm'] as const)[Math.floor(r() * 3)],
        });
      }
    }
  }

  // Salary on the 1st of this month and last month.
  for (const back of [0, 1]) {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1));
    const day = d.toISOString().slice(0, 10);
    if (day <= today) out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(day, 9, 5), direction: 'credit', amount: 85000, narration: 'NEFT-ACME TECHNOLOGIES-SALARY' });
  }
  // Rent
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(addDays(today, -Math.min(days - 1, 3)), 10, 0), direction: 'debit', amount: 18000, narration: 'UPI/430999999001/Landlord Rent/rent@oksbi' });
  // Own-account transfer HDFC -> SBI (must not be income or expense)
  const tDay = addDays(today, -2);
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(tDay, 14, 0), direction: 'debit', amount: 10000, narration: 'UPI/430999999002/Self Transfer to own account' });
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[1].id, date: past(tDay, 14, 1), direction: 'credit', amount: 10000, narration: 'UPI/430999999003/Received from self own account' });
  // Purchase + refund
  const pDay = addDays(today, -6);
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(pDay, 18, 20), direction: 'debit', amount: 2499, narration: 'UPI/430999999004/Myntra/myntra@icici' });
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(addDays(today, -4), 11, 0), direction: 'credit', amount: 2499, narration: 'Refund from Myntra' });
  // Failed payment that auto-reversed
  const fDay = addDays(today, -1);
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(fDay, 20, 0), direction: 'debit', amount: 799, narration: 'UPI/430999999005/Dominos/dominos@icici' });
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(fDay, 20, 3), direction: 'credit', amount: 799, narration: 'UPI REVERSAL/430999999005/Dominos' });
  // Outright failed + pending
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[0].id, date: past(today, 7, 30), direction: 'debit', amount: 1500, status: 'FAILED', narration: 'UPI/430999999006/Amazon/amazon@apl' });
  out.push({ source: 'csv', accountId: DEMO_ACCOUNTS[1].id, date: past(today, 7, 45), direction: 'debit', amount: 349, status: 'PENDING', narration: 'UPI/430999999007/Spotify/spotify@icici' });

  return out;
}
