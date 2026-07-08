import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { getPlan, timeToMinutes } from '../_shared/membershipPlans.ts';
import {
  memberEmailAllowed,
  poolUsage,
  hasConflict,
  evaluateCoverage
} from '../_shared/memberCore.ts';

// Authoritative member-booking creation for INCLUDED (free) sessions. Prime /
// paid sessions are routed to createMemberCheckout (Stripe hold) instead. The
// server — not the browser — decides included vs prime so hour/guest-pass limits
// can't be bypassed.
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const user = await getUser(req);
    if (!user) return json({ success: false, error: 'Please sign in.' }, { status: 401 });

    const body = await req.json();
    const {
      membershipId,
      simulatorId,
      bookingDate,
      startTime,
      endTime,
      durationHours,
      wantsGuest = false,
      acceptPrime = false
    } = body || {};

    if (!membershipId || !simulatorId || !bookingDate || !startTime || !endTime || !durationHours) {
      return json({ success: false, error: 'Missing booking details.' });
    }

    const db = serviceClient();

    const { data: membership } = await db
      .from('memberships')
      .select('*')
      .eq('id', membershipId)
      .single();
    if (!membership) return json({ success: false, error: 'Membership not found.' });
    if (!memberEmailAllowed(membership, user.email)) {
      return json({ success: false, error: 'This membership is not yours.' }, { status: 403 });
    }
    if (membership.status !== 'active') {
      return json({ success: false, error: 'Your membership is not active.' });
    }

    const plan = getPlan(membership.membership_level);
    if (!plan) return json({ success: false, error: 'Unknown membership tier.' });

    const { data: bay } = await db.from('simulators').select('*').eq('id', simulatorId).single();
    if (!bay) return json({ success: false, error: 'Bay not found.' });
    if (bay.location !== membership.location) {
      return json({ success: false, error: 'You can only book bays at your home location.' });
    }

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (endMin <= startMin) return json({ success: false, error: 'Invalid time range.' });

    if (await hasConflict(db, simulatorId, bookingDate, startMin, endMin)) {
      return json({ success: false, error: 'That bay is already booked for this time.' });
    }

    const date = new Date(
      Number(bookingDate.slice(0, 4)),
      Number(bookingDate.slice(5, 7)) - 1,
      Number(bookingDate.slice(8, 10))
    );

    const usage = await poolUsage(db, membership, plan, date);
    const cov = evaluateCoverage(plan, date, startTime, endTime, Number(durationHours), usage.hoursRemaining, bay);

    // Guest pass availability (shared pool).
    if (wantsGuest && usage.passesRemaining <= 0) {
      return json({ success: false, error: 'No guest passes remaining this month.', passesRemaining: 0 });
    }

    // Prime slots aren't free — send the client to the paid checkout flow.
    if (!cov.included) {
      return json({
        success: false,
        needsPrimeConfirmation: true,
        reason: !cov.withinWindow ? 'outside_window' : 'over_hours',
        pricePerHour: cov.perHour,
        totalCost: cov.totalCost,
        hoursRemaining: Math.max(0, usage.hoursRemaining),
        error: !cov.withinWindow
          ? 'This time is outside your membership hours. It can be booked as prime time at your member rate.'
          : "You've used your included hours for this period. This can be booked as additional sim time at your member rate."
      });
    }

    // Included, free booking.
    const { data: created, error: insErr } = await db
      .from('member_bookings')
      .insert({
        membership_id: membership.id,
        member_email: user.email,
        member_name: membership.user_name || user.email,
        simulator_id: bay.id,
        simulator_name: bay.name,
        location: membership.location,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        duration_hours: Number(durationHours),
        total_cost: 0,
        status: 'confirmed',
        check_in_status: 'not_arrived',
        included: true,
        is_prime: false,
        guest_pass_used: !!wantsGuest,
        payment_status: 'included',
        is_exclusive_hours: false
      })
      .select()
      .single();
    if (insErr) {
      console.error('member insert error:', insErr.message);
      return json({ success: false, error: 'Could not save the booking. Please try again.' });
    }

    return json({
      success: true,
      booking: created,
      included: true,
      totalCost: 0,
      hoursRemaining: Math.max(0, usage.hoursRemaining - Number(durationHours)),
      passesRemaining: Math.max(0, usage.passesRemaining - (wantsGuest ? 1 : 0))
    });
  } catch (error) {
    console.error('createMemberBooking error:', (error as any).message);
    return json({ success: false, error: (error as any).message || 'Booking failed.' }, { status: 500 });
  }
});
