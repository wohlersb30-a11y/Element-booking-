import Stripe from 'npm:stripe@14.11.0';
import { getUser } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (!Deno.env.get('STRIPE_SECRET_KEY')) {
      return json({ error: 'Stripe secret key not configured' }, { status: 500 });
    }

    const user = await getUser(req);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { amount, customerEmail, customerName, bookingData, successUrl, cancelUrl } = body;

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
      payment_intent_data: {
        capture_method: 'manual',
        description: `Booking hold for ${customerName}`,
        metadata: {
          customer_name: customerName,
          booking_date: bookingData.date,
          booking_time: bookingData.time
        }
      },
      customer_email: customerEmail,
      metadata: {
        bookingData: JSON.stringify(bookingData),
        customerName,
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
