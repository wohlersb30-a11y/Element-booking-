import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { retrieveSessionAnyAccount } from '../_shared/stripe.ts';

const toMinutes = (t: string) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId, location } = await req.json();
    if (!sessionId) return json({ success: false, error: 'No session ID provided' });

    // The session lives in exactly one of the location Stripe accounts. Find it
    // (preferring the hinted location) and use that account's client throughout.
    const { session, client: stripe } = await retrieveSessionAnyAccount(sessionId, location);

    if (session.status !== 'complete') {
      return json({ success: false, error: 'Checkout session not completed' });
    }
    if (!session.payment_intent) {
      return json({ success: false, error: 'No payment intent found' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      session.payment_intent as string
    );
    if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
      return json({
        success: false,
        error: `Payment not authorized. Status: ${paymentIntent.status}`
      });
    }

    const bookingData = JSON.parse(session.metadata!.bookingData);
    const customerId = session.metadata!.customerId || user.id;
    const db = serviceClient();

    // Idempotency: if bookings already exist for this payment intent (success
    // page refresh), return them instead of creating duplicates.
    const { data: existing } = await db
      .from('bookings')
      .select('*')
      .eq('stripe_payment_id', session.payment_intent);

    if (existing && existing.length > 0) {
      return json({
        success: true,
        bookings: existing,
        paymentStatus: paymentIntent.status,
        alreadyProcessed: true
      });
    }

    // Server-side availability re-check to prevent concurrent double-booking.
    const newStart = toMinutes(bookingData.time);
    const newEnd = toMinutes(bookingData.endTime);

    const { data: sameDay } = await db
      .from('bookings')
      .select('*')
      .eq('booking_date', bookingData.date);

    const conflicts: string[] = [];
    for (const bayInfo of bookingData.selectedBays) {
      const overlap = (sameDay || []).some((b) => {
        if (b.simulator_id !== bayInfo.bayId) return false;
        if (b.status === 'cancelled') return false;
        return newStart < toMinutes(b.end_time) && newEnd > toMinutes(b.start_time);
      });
      if (overlap) conflicts.push(bayInfo.bayName);
    }

    if (conflicts.length > 0) {
      try {
        await stripe.paymentIntents.cancel(session.payment_intent as string);
      } catch (cancelErr) {
        console.error('Failed to cancel intent after conflict:', cancelErr.message);
      }
      return json({
        success: false,
        conflict: true,
        error: `Sorry, ${conflicts.join(', ')} was just booked by someone else. Your card hold has been released — please choose another time.`
      });
    }

    const rows = bookingData.selectedBays.map((bayInfo) => ({
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
      stripe_payment_id: session.payment_intent
    }));

    const { data: created, error } = await db.from('bookings').insert(rows).select();
    if (error) throw error;

    return json({
      success: true,
      bookings: created,
      paymentStatus: paymentIntent.status
    });
  } catch (error) {
    console.error('verifyStripePayment error:', error.message);
    return json(
      { success: false, error: error.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
});
