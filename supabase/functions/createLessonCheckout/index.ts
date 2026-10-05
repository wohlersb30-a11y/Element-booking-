import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation } from '../_shared/stripe.ts';
import { getLessonPackage, isLessonTimeOpen } from '../_shared/lessons.ts';
import { computeTax } from '../_shared/tax.ts';

// Sells a lessons package (single / 3-pack / 7-pack). Like banked-hours, this is
// an IMMEDIATE charge — the customer is prepaying for lessons, not holding a bay.
// At checkout they also choose the slot for their FIRST lesson; the rest of the
// package becomes a location-scoped "bank" they can spend later.
//
// On successful payment, finalizeBooking (booking_kind = 'lesson') grants the
// credits and schedules the first lesson into the chosen slot. Payment routes to
// the chosen location's Stripe account, and credits are scoped to that location.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const {
      packageId,
      location,
      lessonDate,
      startTime,
      customerName,
      customerPhone,
      successUrl,
      cancelUrl
    } = body || {};

    if (!packageId || !location || !successUrl || !cancelUrl) {
      return json({ error: 'Missing purchase details.' }, { status: 400 });
    }
    if (location !== 'vadnais_heights' && location !== 'burnsville') {
      return json({ error: 'Unknown location.' }, { status: 400 });
    }

    const pkg = getLessonPackage(packageId);
    if (!pkg) return json({ error: 'Unknown lesson package.' }, { status: 400 });

    const { rate, tax } = computeTax(pkg.price, location);

    // If a first-lesson time was chosen, validate it's still an open 60-minute
    // start at this location before sending the customer to pay. (The overlap
    // exclusion constraint is the final authority in finalizeBooking.)
    let validatedDate: string | null = null;
    let validatedStart: string | null = null;
    if (lessonDate && startTime) {
      const db = serviceClient();
      const open = await isLessonTimeOpen(db, location, lessonDate, startTime);
      if (!open) {
        return json({ error: 'That lesson time is no longer available. Please pick another.' }, { status: 409 });
      }
      validatedDate = lessonDate;
      validatedStart = startTime;
    }

    const desc =
      pkg.credits > 1
        ? `${pkg.credits} lessons with Brandon Sigette · schedule your first now, bank the rest`
        : `One lesson with Brandon Sigette`;

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
              description: desc
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
        description: `Lessons purchase — ${pkg.label} — ${user.email}`,
        metadata: { booking_kind: 'lesson', package_id: pkg.id, location }
      },
      metadata: {
        booking_kind: 'lesson',
        package_id: pkg.id,
        package_type: pkg.packageType,
        price: String(pkg.price),
        location,
        lesson_date: validatedDate ?? '',
        start_time: validatedStart ?? '',
        customerEmail: user.email,
        customerId: user.id,
        customer_name: (customerName || '').slice(0, 200),
        customer_phone: (customerPhone || '').slice(0, 50)
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('createLessonCheckout error:', (error as any).message);
    return json({ error: (error as any).message || 'Purchase failed.' }, { status: 500 });
  }
});
