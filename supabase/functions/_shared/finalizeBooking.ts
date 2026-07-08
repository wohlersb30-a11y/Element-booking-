import type Stripe from 'npm:stripe@14.11.0';
import { serviceClient } from './clients.ts';

const toMinutes = (t: string) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

// Reassemble bookingData from Checkout Session metadata. We store it as chunks
// (bd_count + bd_0..bd_n) to stay under Stripe's 500-char-per-value limit, with
// a fallback to the legacy single `bookingData` key.
export function readBookingData(metadata: Record<string, string> | null): any {
  if (!metadata) throw new Error('No metadata on session');
  if (metadata.bd_count) {
    const n = parseInt(metadata.bd_count, 10);
    let s = '';
    for (let i = 0; i < n; i++) s += metadata[`bd_${i}`] ?? '';
    return JSON.parse(s);
  }
  if (metadata.bookingData) return JSON.parse(metadata.bookingData);
  throw new Error('No bookingData in session metadata');
}

type FinalizeResult =
  | { success: true; bookings: any[]; alreadyProcessed?: boolean; kind?: 'member' | 'regular' }
  | { success: false; conflict?: true; error: string };

// Single source of truth for turning a completed Checkout Session into booking
// rows. Idempotent (safe to call from both the success page and the webhook),
// re-checks availability, and treats the DB exclusion constraint as the final
// authority on double-booking. Releases the card hold on any conflict.
export async function finalizeBookingFromSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  opts: { db?: ReturnType<typeof serviceClient>; fallbackUserId?: string } = {}
): Promise<FinalizeResult> {
  const db = opts.db ?? serviceClient();

  if (session.status !== 'complete') {
    return { success: false, error: 'Checkout session not completed' };
  }
  const paymentIntentId = session.payment_intent as string;
  if (!paymentIntentId) return { success: false, error: 'No payment intent found' };

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
    return { success: false, error: `Payment not authorized. Status: ${paymentIntent.status}` };
  }

  // Prime member bookings are finalized into member_bookings, not bookings.
  if ((session.metadata as Record<string, string>)?.booking_kind === 'member') {
    return finalizeMemberBooking(stripe, session, db, paymentIntentId);
  }

  const bookingData = readBookingData(session.metadata as Record<string, string>);
  const customerId = (session.metadata?.customerId as string) || opts.fallbackUserId || null;

  // Idempotency: bookings already created for this payment intent? Return them.
  const { data: existing } = await db
    .from('bookings')
    .select('*')
    .eq('stripe_payment_id', paymentIntentId);
  if (existing && existing.length > 0) {
    return { success: true, bookings: existing, alreadyProcessed: true };
  }

  // Fast-path app-level availability re-check (cheap, friendly error).
  const newStart = toMinutes(bookingData.time);
  const newEnd = toMinutes(bookingData.endTime);
  const { data: sameDay } = await db
    .from('bookings')
    .select('*')
    .eq('booking_date', bookingData.date);

  const conflicts: string[] = [];
  for (const bayInfo of bookingData.selectedBays) {
    const overlap = (sameDay || []).some((b: any) => {
      if (b.simulator_id !== bayInfo.bayId) return false;
      if (b.status === 'cancelled') return false;
      return newStart < toMinutes(b.end_time) && newEnd > toMinutes(b.start_time);
    });
    if (overlap) conflicts.push(bayInfo.bayName);
  }
  if (conflicts.length > 0) {
    await releaseHold(stripe, paymentIntentId);
    return {
      success: false,
      conflict: true,
      error: `Sorry, ${conflicts.join(', ')} was just booked by someone else. Your card hold has been released — please choose another time.`
    };
  }

  const rows = bookingData.selectedBays.map((bayInfo: any) => ({
    simulator_id: bayInfo.bayId,
    simulator_name: bayInfo.bayName,
    location: bookingData.location,
    customer_id: customerId,
    customer_name: bookingData.customerName,
    customer_email: bookingData.customerEmail,
    customer_phone: bookingData.customerPhone,
    booking_date: bookingData.date,
    start_time: bookingData.time,
    end_time: bookingData.endTime,
    duration_hours: bookingData.duration,
    total_cost: bayInfo.cost,
    number_of_players: bookingData.playerCount,
    payment_method: 'credit_card',
    payment_status: 'authorized',
    status: 'confirmed',
    notes: bookingData.notes || '',
    check_in_status: 'not_arrived',
    special_id: bookingData.specialId || null,
    bay_locked: bookingData.bayPreference || false,
    stripe_payment_id: paymentIntentId
  }));

  const { data: created, error } = await db.from('bookings').insert(rows).select();

  if (error) {
    // 23P01 = exclusion_violation: the DB rejected an overlap that slipped past
    // the app-level check (true race). Release the hold and report a conflict.
    const isOverlap =
      (error as any).code === '23P01' ||
      /bookings_no_overlap|exclusion/i.test(error.message || '');
    if (isOverlap) {
      // Another request may have created the booking for this PI concurrently —
      // re-check so we return success instead of a false conflict.
      const { data: now } = await db
        .from('bookings')
        .select('*')
        .eq('stripe_payment_id', paymentIntentId);
      if (now && now.length > 0) {
        return { success: true, bookings: now, alreadyProcessed: true };
      }
      await releaseHold(stripe, paymentIntentId);
      return {
        success: false,
        conflict: true,
        error: 'Sorry, that bay and time was just booked by someone else. Your card hold has been released — please choose another time.'
      };
    }
    throw error;
  }

  return { success: true, bookings: created };
}

// Turn a completed prime-member checkout into a member_booking row. Idempotent
// (keyed on stripe_payment_id), re-checks conflicts across both booking tables,
// and releases the hold if the bay was taken in the meantime.
async function finalizeMemberBooking(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  db: ReturnType<typeof serviceClient>,
  paymentIntentId: string
): Promise<FinalizeResult> {
  const d = readBookingData(session.metadata as Record<string, string>);

  // Idempotency: already created for this payment intent?
  const { data: existing } = await db
    .from('member_bookings')
    .select('*')
    .eq('stripe_payment_id', paymentIntentId);
  if (existing && existing.length > 0) {
    return { success: true, bookings: existing, alreadyProcessed: true, kind: 'member' };
  }

  // Conflict re-check across regular + member bookings.
  const s = toMinutes(d.startTime);
  const e = toMinutes(d.endTime);
  const [{ data: reg }, { data: mem }] = await Promise.all([
    db.from('bookings').select('start_time,end_time,status,simulator_id')
      .eq('simulator_id', d.simulatorId).eq('booking_date', d.date).neq('status', 'cancelled'),
    db.from('member_bookings').select('start_time,end_time,status,simulator_id')
      .eq('simulator_id', d.simulatorId).eq('booking_date', d.date).neq('status', 'cancelled')
  ]);
  const clash = [...(reg || []), ...(mem || [])].some(
    (b: any) => s < toMinutes(b.end_time) && e > toMinutes(b.start_time)
  );
  if (clash) {
    await releaseHold(stripe, paymentIntentId);
    return {
      success: false,
      conflict: true,
      error: 'Sorry, that bay was just booked by someone else. Your card hold has been released — please choose another time.'
    };
  }

  const { data: created, error } = await db
    .from('member_bookings')
    .insert({
      membership_id: d.membershipId,
      member_email: d.memberEmail,
      member_name: d.memberName,
      simulator_id: d.simulatorId,
      simulator_name: d.simulatorName,
      location: d.location,
      booking_date: d.date,
      start_time: d.startTime,
      end_time: d.endTime,
      duration_hours: d.durationHours,
      total_cost: d.totalCost,
      status: 'confirmed',
      check_in_status: 'not_arrived',
      included: false,
      is_prime: true,
      guest_pass_used: !!d.wantsGuest,
      payment_status: 'authorized',
      stripe_payment_id: paymentIntentId,
      is_exclusive_hours: false
    })
    .select();
  if (error) {
    // Concurrent insert for the same PI?
    const { data: now } = await db
      .from('member_bookings')
      .select('*')
      .eq('stripe_payment_id', paymentIntentId);
    if (now && now.length > 0) {
      return { success: true, bookings: now, alreadyProcessed: true, kind: 'member' };
    }
    throw error;
  }

  return { success: true, bookings: created, kind: 'member' };
}

async function releaseHold(stripe: Stripe, paymentIntentId: string) {
  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    console.error('Failed to release hold:', (err as any).message);
  }
}
