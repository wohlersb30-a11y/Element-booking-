import Stripe from 'npm:stripe@14.11.0';
import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation, stripeAccountKey } from '../_shared/stripe.ts';
import { computeTax } from '../_shared/tax.ts';

// Split the booking JSON into <=480-char metadata values to respect Stripe's
// 500-char-per-value limit. Reassembled by finalizeBooking via bd_count.
function chunkBookingData(bookingData: unknown): Record<string, string> {
  const json = JSON.stringify(bookingData);
  const size = 480;
  const out: Record<string, string> = {};
  let count = 0;
  for (let i = 0; i < json.length; i += size) {
    out[`bd_${count}`] = json.slice(i, i + size);
    count++;
  }
  out.bd_count = String(count);
  return out;
}

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
      // Stripe caps each metadata value at 500 chars, so chunk the booking JSON
      // (bd_count + bd_0..bd_n) — reassembled in finalizeBooking. Avoids checkout
      // failures on big group bookings or long notes.
      metadata: {
        ...chunkBookingData(bookingData),
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
