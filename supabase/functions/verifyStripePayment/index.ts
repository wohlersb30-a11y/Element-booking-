import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { retrieveSessionAnyAccount } from '../_shared/stripe.ts';
import { finalizeBookingFromSession } from '../_shared/finalizeBooking.ts';

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

    const db = serviceClient();
    const result = await finalizeBookingFromSession(stripe, session, {
      db,
      fallbackUserId: user.id
    });

    if (!result.success) {
      return json(result);
    }
    return json({
      success: true,
      bookings: result.bookings,
      alreadyProcessed: result.alreadyProcessed ?? false,
      kind: result.kind ?? 'regular',
      hourPackage: result.hourPackage ?? null,
      // Authoritative conversion value for the Meta Pixel Purchase event.
      // amount_total is in the smallest currency unit (cents); convert to dollars.
      amountTotal:
        typeof session.amount_total === 'number' ? session.amount_total / 100 : null,
      currency: (session.currency || 'usd').toUpperCase()
    });
  } catch (error) {
    console.error('verifyStripePayment error:', error.message);
    return json(
      { success: false, error: error.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
});
