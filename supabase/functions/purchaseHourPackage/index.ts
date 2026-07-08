import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation } from '../_shared/stripe.ts';
import { getPackage } from '../_shared/hourPackages.ts';
import { computeTax } from '../_shared/tax.ts';

// Sells a banked-hours package. Unlike bookings (which place an authorization
// hold), this is an IMMEDIATE charge — the customer is buying prepaid hours, not
// reserving a bay. On successful payment, finalizeBooking credits the hours to
// their ledger (booking_kind = 'package'). Payment routes to the chosen
// location's Stripe account, and hours are scoped to that location.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const { packageId, location, successUrl, cancelUrl } = body || {};

    if (!packageId || !location || !successUrl || !cancelUrl) {
      return json({ error: 'Missing purchase details.' }, { status: 400 });
    }
    if (location !== 'vadnais_heights' && location !== 'burnsville') {
      return json({ error: 'Unknown location.' }, { status: 400 });
    }

    const pkg = getPackage(packageId);
    if (!pkg) return json({ error: 'Unknown package.' }, { status: 400 });

    const { rate, tax } = computeTax(pkg.price, location);

    const stripe = stripeForLocation(location);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pkg.label} — Element Indoor Golf`,
              description: `${pkg.size} banked hours ($${pkg.perHour}/hr) · ${pkg.kind === 'peak' ? 'usable anytime' : 'off-peak only'}`
            },
            unit_amount: Math.round(pkg.price * 100)
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
      payment_intent_data: {
        description: `Banked hours purchase — ${pkg.label} — ${user.email}`,
        metadata: { booking_kind: 'package', package_id: pkg.id, location }
      },
      metadata: {
        booking_kind: 'package',
        package_id: pkg.id,
        package_size: String(pkg.size),
        hour_kind: pkg.kind,
        price: String(pkg.price),
        location,
        customerEmail: user.email,
        customerId: user.id
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('purchaseHourPackage error:', (error as any).message);
    return json({ error: (error as any).message || 'Purchase failed.' }, { status: 500 });
  }
});
