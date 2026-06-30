import Stripe from 'npm:stripe@14.11.0';
import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation, stripeAccountKey } from '../_shared/stripe.ts';

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
async function getOrCreateCustomer(
  stripe: Stripe,
  db: ReturnType<typeof serviceClient>,
  account: string,
  userId: string,
  email: string,
  name: string
): Promise<string> {
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer_id, stripe_customer_map')
    .eq('id', userId)
    .single();

  const map = (profile?.stripe_customer_map ?? {}) as Record<string, string>;
  if (map[account]) return map[account];

  // Legacy fallback: an old single id maps to the Vadnais Heights account.
  if (account === 'vadnais_heights' && profile?.stripe_customer_id) {
    const merged = { ...map, vadnais_heights: profile.stripe_customer_id };
    await db.from('profiles').update({ stripe_customer_map: merged }).eq('id', userId);
    return profile.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { supabase_user_id: userId, stripe_account: account }
  });
  const merged = { ...map, [account]: customer.id };
  await db.from('profiles').update({ stripe_customer_map: merged }).eq('id', userId);
  return customer.id;
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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Golf Simulator Booking - Authorization Hold',
            description: `${bookingData.selectedBays.length} Bay(s) - ${bookingData.date} at ${bookingData.time}`
          },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      // Attach to the saved Stripe Customer and remember the card for next time.
      customer: customerId,
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
