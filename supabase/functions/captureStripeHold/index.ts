import { getUserWithRole, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUserWithRole(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    // Capturing a hold charges the customer — admin only.
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
    if (booking.payment_status === 'paid') {
      return json({ success: true, alreadyCaptured: true, booking });
    }

    // Capture on the Stripe account that belongs to this booking's location.
    const stripe = stripeForLocation(booking.location);
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_id);
    if (intent.status !== 'requires_capture') {
      return json({
        success: false,
        error: `Hold cannot be captured (status: ${intent.status}).`
      });
    }

    const captured = await stripe.paymentIntents.capture(booking.stripe_payment_id);

    const { data: updated } = await db
      .from('bookings')
      .update({ payment_status: 'paid' })
      .eq('id', bookingId)
      .select()
      .single();

    return json({
      success: true,
      booking: updated,
      amountCaptured: captured.amount_received / 100
    });
  } catch (error) {
    console.error('captureStripeHold error:', error.message);
    return json(
      { success: false, error: error.message || 'Failed to capture hold' },
      { status: 500 }
    );
  }
});
