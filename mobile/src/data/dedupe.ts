import type { Transaction } from '@upi/core';
import { bankOf } from './banks';

const WINDOW_MS = 3 * 60_000;
/** Same bank, ignoring which account number the SMS mentioned (some SMS omit it). */
const brand = (t: Transaction) => bankOf(t).id.split(':')[0]!;

/**
 * One payment often produces two bank SMS (different sender code or wording, no shared reference).
 * Treat same bank + direction + amount within 3 minutes as one transaction — unless both carry
 * *different* references, which proves they are genuinely separate payments.
 * Returns the survivors that changed and the ids to delete.
 */
export function dedupeNear(all: Transaction[]): { update: Transaction[]; remove: string[] } {
  const live = all.filter((t) => t.status !== 'failed' && !t.accountId.startsWith('app:'));
  const groups = new Map<string, Transaction[]>();
  for (const t of live) {
    const k = `${brand(t)}|${t.direction}|${t.amountPaise}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const remove: string[] = [];
  const changed = new Map<string, Transaction>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const survivors: Transaction[] = [];
    for (const t of list) {
      const at = Date.parse(t.occurredAt);
      const twin = survivors.find((s) =>
        Math.abs(Date.parse(s.occurredAt) - at) <= WINDOW_MS &&
        !(s.reference && t.reference && s.reference !== t.reference));
      if (!twin) { survivors.push(t); continue; }
      const i = survivors.indexOf(twin);
      const rich = t.reference && !twin.reference ? t : twin; // keep the record that has the bank reference
      const other = rich === t ? twin : t;
      const merged: Transaction = {
        ...rich,
        reference: rich.reference ?? other.reference,
        paymentApp: rich.paymentApp !== 'unknown' ? rich.paymentApp : other.paymentApp,
        sources: [...new Set([...rich.sources, ...other.sources])],
        originals: [...rich.originals, ...other.originals],
        altFingerprints: [...new Set([...rich.altFingerprints, ...other.altFingerprints, other.fingerprint])].filter((f) => f !== rich.fingerprint),
      };
      survivors[i] = merged; changed.set(merged.id, merged);
      remove.push(other.id); changed.delete(other.id);
    }
  }
  return { update: [...changed.values()], remove };
}
