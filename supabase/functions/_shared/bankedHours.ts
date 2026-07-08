// Shared banked-hours drawdown helpers used by bookWithBankedHours (immediate,
// no-surcharge path) and finalizeBooking (post-payment VIP path) so the debit
// math is identical in both places.
import { serviceClient } from './clients.ts';

type DB = ReturnType<typeof serviceClient>;
export type HourKind = 'peak' | 'off_peak';
export interface DebitLine { kind: HourKind; hours: number; }

// Build the list of per-bucket debits to cover `duration` hours, spending the
// covering buckets in preference order (e.g. off_peak before peak for an
// off-peak slot). Returns null if the combined balance is insufficient.
export function buildDebitPlan(
  balance: Record<HourKind, number>,
  kinds: HourKind[],
  duration: number
): DebitLine[] | null {
  let remaining = Math.round(duration * 100) / 100;
  const plan: DebitLine[] = [];
  for (const kind of kinds) {
    if (remaining <= 1e-9) break;
    const avail = Math.max(0, Number(balance[kind] || 0));
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    plan.push({ kind, hours: Math.round(take * 100) / 100 });
    remaining = Math.round((remaining - take) * 100) / 100;
  }
  if (remaining > 1e-9) return null; // not enough hours across the covering buckets
  return plan;
}

// Write the debit rows (negative hours) to the ledger for a booking.
export async function applyDebitPlan(
  db: DB,
  args: {
    email: string;
    userId?: string | null;
    location: string;
    plan: DebitLine[];
    bookingId: string;
    stripePaymentId?: string | null;
    note?: string;
  }
): Promise<void> {
  const rows = args.plan.map((line) => ({
    user_email: args.email,
    user_id: args.userId ?? null,
    kind: line.kind,
    hours: -Math.abs(line.hours),
    reason: 'booking',
    location: args.location,
    booking_id: args.bookingId,
    stripe_payment_id: args.stripePaymentId ?? null,
    created_by: 'system',
    note: args.note ?? null
  }));
  if (rows.length === 0) return;
  const { error } = await db.from('hour_transactions').insert(rows);
  if (error) throw error;
}
