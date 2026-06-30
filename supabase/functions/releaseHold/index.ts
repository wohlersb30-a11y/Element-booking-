import { getUserWithRole, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation } from '../_shared/stripe.ts';

// Release a manual-capture authorization hold WITHOUT cancelling the booking.
// Use case: a customer showed up and played (or paid in person), so we free the
// pending hold on their card right away instead of waiting up to 7 days for
// Stripe to auto-expire the uncaptured authorization. The booking stays active;
// only payment_status changes to 'released'. (Cancelling a booking is a separate
// flow — see cancelBooking, which also voids the hold but ends the reservation.)
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUserWithRole(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    // Releasing a hold is a staff action.
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, { status: 403 });

    const { bookingId } = await req.json();
    if (!bookingId) return json({ success: false, error: 'No booking ID provided' });

    const db = serviceClient();
    const { data: booking } = await db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    if (!booking) return json({ success: false, error: 'Booking not found' });

    if (!booking.stripe_payment_id) {
      return json({ success: false, error: 'No payment hold on this booking' });
    }
    // A captured (paid) hold is real money — refunding is a different action.
    if (booking.payment_status === 'paid') {
      return json({
        success: false,
        error: 'This hold was already captured (charged). Refund it in Stripe instead.'
      });
    }
    // Already released/refunded — nothing to do, report success idempotently.
    if (booking.payment_status === 'released' || booking.payment_status === 'refunded') {
      return json({ success: true, alreadyReleased: true, booking });
    }

    // Operate on the Stripe account that belongs to this booking's location.
    const stripe = stripeForLocation(booking.location);
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_id);

    // If Stripe already released/expired it, just sync our record.
    if (intent.status === 'canceled') {
      const { data: synced } = await db
        .from('bookings')
        .update({ payment_status: 'released' })
        .eq('id', bookingId)
        .select()
        .single();
      return json({ success: true, alreadyReleased: true, booking: synced });
    }

    if (intent.status !== 'requires_capture') {
      return json({
        success: false,
        error: `Hold cannot be released (status: ${intent.status}).`
      });
    }

    // Cancelling an uncaptured PaymentIntent releases the authorization hold;
    // no money moves.
    await stripe.paymentIntents.cancel(booking.stripe_payment_id);

    const { data: updated } = await db
      .from('bookings')
      .update({ payment_status: 'released' })
      .eq('id', bookingId)
      .select()
      .single();

    return json({ success: true, booking: updated });
  } catch (error) {
    console.error('releaseHold error:', error.message);
    return json(
      { success: false, error: error.message || 'Failed to release hold' },
      { status: 500 }
    );
  }
});
