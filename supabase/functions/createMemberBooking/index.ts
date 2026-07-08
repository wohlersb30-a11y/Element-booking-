import { getUser, serviceClient } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/cors.ts';
import {
  getPlan,
  enforcementActive,
  isWithinCoveredWindow,
  periodBounds,
  parseDateStr,
  timeToMinutes,
  memberDiscountedRate
} from '../_shared/membershipPlans.ts';

// Authoritative member-booking creation. The server — not the browser — decides
// whether a slot is "included" (drawn from the monthly/weekly allotment) or
// "prime" (outside the covered window or over the allotment → discounted paid
// booking). This prevents a client from tampering with the included flag or
// bypassing hour/guest-pass limits.
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
      bookingDate, // 'yyyy-mm-dd'
      startTime, // 'HH:MM'
      endTime, // 'HH:MM'
      durationHours,
      wantsGuest = false,
      acceptPrime = false
    } = body || {};

    if (!membershipId || !simulatorId || !bookingDate || !startTime || !endTime || !durationHours) {
      return json({ success: false, error: 'Missing booking details.' });
    }

    const db = serviceClient();

    // 1) Membership must belong to this user and be active.
    const { data: membership } = await db
      .from('memberships')
      .select('*')
      .eq('id', membershipId)
      .single();
    if (!membership) return json({ success: false, error: 'Membership not found.' });
    if (membership.user_email?.toLowerCase() !== user.email?.toLowerCase()) {
      return json({ success: false, error: 'This membership is not yours.' }, { status: 403 });
    }
    if (membership.status !== 'active') {
      return json({ success: false, error: 'Your membership is not active.' });
    }

    const plan = getPlan(membership.membership_level);
    if (!plan) return json({ success: false, error: 'Unknown membership tier.' });

    // 2) Simulator must exist and belong to the member's home location.
    const { data: bay } = await db
      .from('simulators')
      .select('*')
      .eq('id', simulatorId)
      .single();
    if (!bay) return json({ success: false, error: 'Bay not found.' });
    if (bay.location !== membership.location) {
      return json({ success: false, error: 'You can only book bays at your home location.' });
    }

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (endMin <= startMin) return json({ success: false, error: 'Invalid time range.' });

    // 3) Conflict check across BOTH regular and member bookings (shared bays).
    const [{ data: regBookings }, { data: memBookings }] = await Promise.all([
      db.from('bookings')
        .select('start_time,end_time,status')
        .eq('simulator_id', simulatorId)
        .eq('booking_date', bookingDate)
        .neq('status', 'cancelled'),
      db.from('member_bookings')
        .select('start_time,end_time,status')
        .eq('simulator_id', simulatorId)
        .eq('booking_date', bookingDate)
        .neq('status', 'cancelled')
    ]);
    const overlaps = (arr: any[]) =>
      (arr || []).some((b) => {
        const bs = timeToMinutes(b.start_time);
        const be = timeToMinutes(b.end_time);
        return startMin < be && endMin > bs;
      });
    if (overlaps(regBookings) || overlaps(memBookings)) {
      return json({ success: false, error: 'That bay is already booked for this time.' });
    }

    // 4) Coverage decision.
    const date = parseDateStr(bookingDate);
    const enforce = enforcementActive(date);
    const withinWindow = enforce ? isWithinCoveredWindow(plan, date, startTime, endTime) : true;

    // Usage so far in the relevant period(s).
    const hb = periodBounds(plan.hoursPeriod, date);
    const gb = periodBounds(plan.guestPassPeriod, date);
    const rangeStart = hb.start < gb.start ? hb.start : gb.start;
    const rangeEnd = hb.end > gb.end ? hb.end : gb.end;

    const { data: usage } = await db
      .from('member_bookings')
      .select('duration_hours,included,guest_pass_used,booking_date,status')
      .eq('member_email', user.email)
      .gte('booking_date', rangeStart)
      .lte('booking_date', rangeEnd)
      .neq('status', 'cancelled');

    const hoursUsed = (usage || [])
      .filter((b) => b.included && b.booking_date >= hb.start && b.booking_date <= hb.end)
      .reduce((s, b) => s + Number(b.duration_hours || 0), 0);
    const passesUsed = (usage || [])
      .filter((b) => b.guest_pass_used && b.booking_date >= gb.start && b.booking_date <= gb.end)
      .length;

    const hoursRemaining = plan.hours - hoursUsed;
    const hasHours = !enforce ? true : Number(durationHours) <= hoursRemaining + 1e-9;
    const included = withinWindow && hasHours;

    // 5) Guest pass availability (if requested).
    const passesRemaining = plan.guestPasses - passesUsed;
    if (wantsGuest && passesRemaining <= 0) {
      return json({
        success: false,
        error: 'No guest passes remaining this month.',
        passesRemaining: 0
      });
    }

    // 6) Price for prime/paid bookings (member-discounted). Included = $0.
    let baseRate = 0;
    if (!included) baseRate = computeBaseRate(bay, date, startTime);
    const discounted = included ? 0 : memberDiscountedRate(baseRate, plan);
    const totalCost = included ? 0 : Math.round(discounted * Number(durationHours) * 100) / 100;

    // Prime slots require explicit opt-in from the member.
    if (!included && !acceptPrime) {
      return json({
        success: false,
        needsPrimeConfirmation: true,
        reason: !withinWindow ? 'outside_window' : 'over_hours',
        pricePerHour: discounted,
        totalCost,
        hoursRemaining: Math.max(0, hoursRemaining),
        error: !withinWindow
          ? 'This time is outside your membership hours. It can be booked as prime time at your member rate.'
          : "You've used your included hours for this period. This can be booked as additional sim time at your member rate."
      });
    }

    // 7) Insert.
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
        total_cost: totalCost,
        status: 'confirmed',
        check_in_status: 'not_arrived',
        included,
        is_prime: !included,
        guest_pass_used: !!wantsGuest,
        payment_status: included ? 'included' : 'pay_at_desk',
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
      included,
      totalCost,
      hoursRemaining: Math.max(0, hoursRemaining - (included ? Number(durationHours) : 0)),
      passesRemaining: Math.max(0, passesRemaining - (wantsGuest ? 1 : 0))
    });
  } catch (error) {
    console.error('createMemberBooking error:', (error as any).message);
    return json({ success: false, error: (error as any).message || 'Booking failed.' }, { status: 500 });
  }
});

// Normal (non-member) bay rate for a given date/time — mirrors the front-end
// calculateRate, minus the member-exclusive logic.
function computeBaseRate(bay: any, date: Date, startTime: string): number {
  const day = date.getDay();
  const hour = parseInt(startTime.split(':')[0], 10);
  const isFridayAfter3pm = day === 5 && hour >= 15;
  const isWeekend = day === 0 || day === 6;
  const isPeak = isFridayAfter3pm || isWeekend;

  if (Array.isArray(bay.pricing_rules) && bay.pricing_rules.length > 0) {
    for (const rule of bay.pricing_rules) {
      const rs = new Date(rule.start_date);
      const re = new Date(rule.end_date);
      if (date >= rs && date <= re) {
        return isPeak ? Number(rule.peak_rate) : Number(rule.off_peak_rate);
      }
    }
  }
  if (bay.pricing_off_peak != null && bay.pricing_peak != null) {
    return isPeak ? Number(bay.pricing_peak) : Number(bay.pricing_off_peak);
  }
  const vip = (bay.bay_type || 'standard') === 'vip';
  if (vip) return isPeak ? 85 : 65;
  return isPeak ? 60 : 50;
}
