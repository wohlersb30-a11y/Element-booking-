import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import { getPlan, timeToMinutes } from '../_shared/membershipPlans.ts';
import {
  memberEmailAllowed,
  poolUsage,
  hasConflict,
  evaluateCoverage
} from '../_shared/memberCore.ts';

// Authoritative member-booking creation. The server — not the browser —
// decides included vs prime so hour/guest-pass limits can't be bypassed.
// Members are billed MONTHLY, so there is NO card authorization: included
// sessions are free, and prime / over-allotment sessions are booked at the
// member rate with the amount recorded as due on the monthly statement (once
// the client confirms via acceptPrime).
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
    // Members may book at EITHER location (club policy). The booking's location
    // follows the chosen BAY, not the membership's home location.

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

    // Guest handling (shared pool). A member can always bring a guest: if they
    // still have a pass it's consumed, otherwise the booking goes through and we
    // flag it so staff collect the guest fee on-site (no pass is consumed).
    const hasGuestPass = !!wantsGuest && usage.passesRemaining > 0;
    const guestChargeDue = !!wantsGuest && usage.passesRemaining <= 0;

    // Prime slots (outside the covered window, or over the included-hours
    // allotment) aren't free. Members are billed monthly, so there's NO card
    // authorization: the first call reports the member-rate amount so the client
    // can confirm, and once confirmed (acceptPrime) we book it and record the
    // amount as due on the monthly statement.
    if (!cov.included && !acceptPrime) {
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

    const isPrime = !cov.included;

    const { data: created, error: insErr } = await db
      .from('member_bookings')
      .insert({
        membership_id: membership.id,
        member_email: user.email,
        member_name: membership.user_name || user.email,
        simulator_id: bay.id,
        simulator_name: bay.name,
        location: bay.location,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        duration_hours: Number(durationHours),
        total_cost: isPrime ? cov.totalCost : 0,
        status: 'confirmed',
        check_in_status: 'not_arrived',
        included: !isPrime,
        is_prime: isPrime,
        guest_pass_used: hasGuestPass,
        guest_charge_due: guestChargeDue,
        // Prime sim time is added to the member's monthly bill (no card hold).
        payment_status: isPrime ? 'due' : 'included',
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
      included: !isPrime,
      isPrime,
      totalCost: isPrime ? cov.totalCost : 0,
      guestChargeDue,
      hoursRemaining: Math.max(0, usage.hoursRemaining - Number(durationHours)),
      passesRemaining: Math.max(0, usage.passesRemaining - (hasGuestPass ? 1 : 0))
    });
  } catch (error) {
    console.error('createMemberBooking error:', (error as any).message);
    return json({ success: false, error: (error as any).message || 'Booking failed.' }, { status: 500 });
  }
});
