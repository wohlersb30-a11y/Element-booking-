import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { stripeForLocation } from '../_shared/stripe.ts';
import { computeTax } from '../_shared/tax.ts';
import { getPlan, timeToMinutes } from '../_shared/membershipPlans.ts';
import {
  memberEmailAllowed,
  poolUsage,
  hasConflict,
  evaluateCoverage
} from '../_shared/memberCore.ts';

// Split member-booking JSON into <=480-char metadata chunks (Stripe caps values
// at 500). Reassembled by finalizeBooking via readBookingData (bd_count).
function chunk(obj: unknown): Record<string, string> {
  const s = JSON.stringify(obj);
  const out: Record<string, string> = {};
  let n = 0;
  for (let i = 0; i < s.length; i += 480) out[`bd_${n++}`] = s.slice(i, i + 480);
  out.bd_count = String(n);
  return out;
}

// Creates a Stripe authorization-hold checkout for a PRIME (uncovered / over-
// allotment) member booking at the tier's discounted rate. On completion,
// finalizeBooking inserts the member_booking (booking_kind = 'member').
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const {
      membershipId,
      simulatorId,
      bookingDate,
      startTime,
      endTime,
      durationHours,
      wantsGuest = false,
      successUrl,
      cancelUrl
    } = body || {};

    if (!membershipId || !simulatorId || !bookingDate || !startTime || !endTime || !durationHours || !successUrl || !cancelUrl) {
      return json({ error: 'Missing booking details.' }, { status: 400 });
    }

    const db = serviceClient();

    const { data: membership } = await db.from('memberships').select('*').eq('id', membershipId).single();
    if (!membership) return json({ error: 'Membership not found.' }, { status: 404 });
    if (!memberEmailAllowed(membership, user.email)) {
      return json({ error: 'This membership is not yours.' }, { status: 403 });
    }
    if (membership.status !== 'active') return json({ error: 'Your membership is not active.' }, { status: 400 });

    const plan = getPlan(membership.membership_level);
    if (!plan) return json({ error: 'Unknown membership tier.' }, { status: 400 });

    const { data: bay } = await db.from('simulators').select('*').eq('id', simulatorId).single();
    if (!bay) return json({ error: 'Bay not found.' }, { status: 404 });
    if (bay.location !== membership.location) {
      return json({ error: 'You can only book bays at your home location.' }, { status: 400 });
    }

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (endMin <= startMin) return json({ error: 'Invalid time range.' }, { status: 400 });

    if (await hasConflict(db, simulatorId, bookingDate, startMin, endMin)) {
      return json({ error: 'That bay is already booked for this time.' }, { status: 409 });
    }

    const date = new Date(
      Number(bookingDate.slice(0, 4)),
      Number(bookingDate.slice(5, 7)) - 1,
      Number(bookingDate.slice(8, 10))
    );

    const usage = await poolUsage(db, membership, plan, date);
    const cov = evaluateCoverage(plan, date, startTime, endTime, Number(durationHours), usage.hoursRemaining, bay);

    // Included slots are free — no checkout needed; tell the client to use the
    // free flow instead.
    if (cov.included) {
      return json({ included: true, error: 'This slot is included — no payment needed.' });
    }
    if (cov.totalCost <= 0) {
      return json({ error: 'Could not price this booking.' }, { status: 400 });
    }
    if (wantsGuest && usage.passesRemaining <= 0) {
      return json({ error: 'No guest passes remaining this month.' }, { status: 400 });
    }

    // Data finalizeBooking needs to insert the member_booking after payment.
    const memberData = {
      booking_kind: 'member',
      membershipId: membership.id,
      memberEmail: user.email,
      memberName: membership.user_name || user.email,
      simulatorId: bay.id,
      simulatorName: bay.name,
      location: membership.location,
      date: bookingDate,
      startTime,
      endTime,
      durationHours: Number(durationHours),
      totalCost: cov.totalCost,
      wantsGuest: !!wantsGuest
    };

    // Minnesota sales tax on the discounted prime rate, shown as a separate
    // line item so the member sees the breakdown before authorizing the hold.
    const { rate, tax } = computeTax(cov.totalCost, membership.location);

    const stripe = stripeForLocation(membership.location);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${plan.name} Member — Prime Sim Time (Authorization Hold)`,
              description: `${bay.name} · ${bookingDate} ${startTime} · ${durationHours}h @ ${Math.round(plan.discount * 100)}% member rate`
            },
            unit_amount: Math.round(cov.totalCost * 100)
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
      customer_email: user.email,
      payment_intent_data: {
        capture_method: 'manual',
        description: `Member prime hold — ${membership.user_name || user.email}`,
        metadata: { booking_kind: 'member', membership_id: membership.id, booking_date: bookingDate }
      },
      metadata: {
        ...chunk(memberData),
        booking_kind: 'member',
        customerId: user.id
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('createMemberCheckout error:', (error as any).message);
    return json({ error: (error as any).message || 'Checkout failed.' }, { status: 500 });
  }
});
