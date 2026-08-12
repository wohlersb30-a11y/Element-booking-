import Stripe from 'npm:stripe@14.11.0';
import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation, stripeAccountKey } from '../_shared/stripe.ts';
import { computeTax } from '../_shared/tax.ts';

// Reuse the customer's Stripe Customer across bookings (creating one the first
// time) so their saved card is offered at checkout on return visits. Customer
// objects are per-account, so we namespace the id by the booking's Stripe
// account (stripe_customer_map) — a Vadnais customer id is invalid in Burnsville.
// Confirm a stored Customer id actually exists in THIS Stripe account/mode.
// A test-mode id is invalid in live mode (and vice-versa), and a customer can
// be deleted — in any of those cases Stripe throws "No such customer", which
// would otherwise fail the whole checkout. Returns true only for a live,
// non-deleted customer.
async function customerIsValid(stripe: Stripe, id: string): Promise<boolean> {
  try {
    const c = await stripe.customers.retrieve(id);
    return !(c as { deleted?: boolean }).deleted;
  } catch (_err) {
    return false;
  }
}

async function getOrCreateCustomer(
  stripe: Stripe,
  db: ReturnType<typeof serviceClient>,
  account: string,
  userId: string,
  email: string,
  name: string
): Promise<string | undefined> {
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer_id, stripe_customer_map')
    .eq('id', userId)
    .single();

  const map = (profile?.stripe_customer_map ?? {}) as Record<string, string>;

  // Candidate id from the per-account map, or (Vadnais only) the legacy single id.
  const candidate =
    map[account] ||
    (account === 'vadnais_heights' ? profile?.stripe_customer_id : undefined);

  // Reuse it only if it still resolves in this account/mode. Otherwise it's a
  // stale id (e.g. created in test mode before the live-key swap) and we mint a
  // fresh one, overwriting the bad slot so this self-heals after one booking.
  if (candidate && (await customerIsValid(stripe, candidate))) {
    if (!map[account]) {
      const merged = { ...map, [account]: candidate };
      await db.from('profiles').update({ stripe_customer_map: merged }).eq('id', userId);
    }
    return candidate;
  }

  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { supabase_user_id: userId, stripe_account: account }
    });
    const merged = { ...map, [account]: customer.id };
    await db.from('profiles').update({ stripe_customer_map: merged }).eq('id', userId);
    return customer.id;
  } catch (err) {
    // Don't let a Customer hiccup block checkout — fall back to a guest session
    // (Stripe will still collect the card via customer_email below).
    console.error('getOrCreateCustomer failed, continuing as guest:', err.message);
    return undefined;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { amount, customerEmail, customerName, bookingData, successUrl, cancelUrl } = body;

    // Route to the correct Stripe account/bank for this booking's location.
    const account = stripeAccountKey(bookingData?.location);
    const stripe = stripeForLocation(bookingData?.location);

    const db = serviceClient();

    // Guard: if an admin has fully closed this location's tee sheet, online
    // booking is off. Block here so a stale/cached page can't create a hold.
    if (bookingData?.location) {
      const { data: closures } = await db
        .from('tee_sheet_closures')
        .select('reason')
        .eq('location', bookingData.location)
        .eq('is_active', true)
        .limit(1);
      if (closures && closures.length > 0) {
        return json(
          {
            error:
              closures[0].reason ||
              'Online booking for this location is temporarily closed. Please check back soon.'
          },
          { status: 400 }
        );
      }
    }

    const customerId = await getOrCreateCustomer(
      stripe,
      db,
      account,
      user.id,
      customerEmail || user.email,
      customerName || ''
    );

    // Minnesota sales tax. `amount` is the pre-tax subtotal; the hold must cover
    // subtotal + tax, shown to the customer as a separate line item so the
    // breakdown is transparent. Tax is recomputed here (server = source of truth)
    // rather than trusting a client-supplied figure.
    const { rate, tax } = computeTax(amount, bookingData?.location);

    // Stage the full booking payload server-side and reference it by a short
    // token in Stripe metadata (avoids Stripe's metadata size limits). If this
    // write fails we abort before creating any hold.
    const bookingRef = crypto.randomUUID();
    const { error: refErr } = await db
      .from('pending_checkouts')
      .insert({ token: bookingRef, data: bookingData });
    if (refErr) {
      console.error('pending_checkouts insert failed:', refErr.message);
      return json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Golf Simulator Booking - Authorization Hold',
              description: `${bookingData.selectedBays.length} Bay(s) - ${bookingData.date} at ${bookingData.time}`
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        },
        ...(tax > 0
          ? [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Minnesota Sales Tax',
                  description: `${(rate * 100).toFixed(3)}% MN sales tax`
                },
                unit_amount: Math.round(tax * 100)
              },
              quantity: 1
            }]
          : [])
      ],
      mode: 'payment',
      // Attach to the saved Stripe Customer and remember the card for next time.
      // If we couldn't resolve/create a Customer, fall back to just the email so
      // checkout still works (Stripe will create a guest customer on its own).
      ...(customerId
        ? { customer: customerId }
        : { customer_email: customerEmail || user.email }),
      payment_intent_data: {
        capture_method: 'manual',
        setup_future_usage: 'off_session',
        description: `Booking hold for ${customerName}`,
        metadata: {
          customer_name: customerName,
          booking_date: bookingData.date,
          booking_time: bookingData.time
        }
      },
      // The full booking payload lives in pending_checkouts (see bookingRef
      // above); metadata carries only the short reference token so we never hit
      // Stripe's 50-key / 500-char metadata caps on large bookings or long notes.
      metadata: {
        bd_ref: bookingRef,
        customerName: String(customerName ?? '').slice(0, 480),
        // Tie the eventual booking to the authenticated user for RLS ownership.
        customerId: user.id
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('createStripeCheckout error:', error.message);
    return json(
      { error: error.message || 'Unknown error', type: error.type || 'unknown' },
      { status: 500 }
    );
  }
});
