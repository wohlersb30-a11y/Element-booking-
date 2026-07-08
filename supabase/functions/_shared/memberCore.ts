// Shared member-booking enforcement used by createMemberBooking (free/included)
// and createMemberCheckout (prime/paid). Keeps the coverage, hour-pool and
// conflict logic identical across both entry points.
import { serviceClient } from './clients.ts';
import {
  Plan,
  enforcementActive,
  isWithinCoveredWindow,
  periodBounds,
  timeToMinutes,
  baseBayRate,
  memberDiscountedRate
} from './membershipPlans.ts';

type DB = ReturnType<typeof serviceClient>;

// Owner or an authorized corporate account holder may use the membership.
export function memberEmailAllowed(membership: any, email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  if ((membership.user_email || '').toLowerCase() === e) return true;
  const authorized: string[] = Array.isArray(membership.authorized_emails)
    ? membership.authorized_emails
    : [];
  return authorized.map((a) => (a || '').toLowerCase()).includes(e);
}

// Usage totals for the shared pool (grouped by membership_id, so corporate
// account holders draw from one bucket). Hours use the plan's hour period,
// passes the pass period.
export async function poolUsage(db: DB, membership: any, plan: Plan, date: Date) {
  const hb = periodBounds(plan.hoursPeriod, date);
  const gb = periodBounds(plan.guestPassPeriod, date);
  const rangeStart = hb.start < gb.start ? hb.start : gb.start;
  const rangeEnd = hb.end > gb.end ? hb.end : gb.end;

  const { data: usage } = await db
    .from('member_bookings')
    .select('duration_hours,included,guest_pass_used,booking_date,status')
    .eq('membership_id', membership.id)
    .gte('booking_date', rangeStart)
    .lte('booking_date', rangeEnd)
    .neq('status', 'cancelled');

  const hoursUsed = (usage || [])
    .filter((b) => b.included && b.booking_date >= hb.start && b.booking_date <= hb.end)
    .reduce((s, b) => s + Number(b.duration_hours || 0), 0);
  const passesUsed = (usage || []).filter(
    (b) => b.guest_pass_used && b.booking_date >= gb.start && b.booking_date <= gb.end
  ).length;

  return {
    hoursUsed,
    passesUsed,
    hoursRemaining: plan.hours - hoursUsed,
    passesRemaining: plan.guestPasses - passesUsed
  };
}

// True if the bay already has an overlapping regular OR member booking.
export async function hasConflict(
  db: DB,
  simulatorId: string,
  bookingDate: string,
  startMin: number,
  endMin: number
): Promise<boolean> {
  const [{ data: reg }, { data: mem }] = await Promise.all([
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
    (arr || []).some(
      (b) => startMin < timeToMinutes(b.end_time) && endMin > timeToMinutes(b.start_time)
    );
  return overlaps(reg) || overlaps(mem);
}

// Decide included vs prime and the member-discounted price.
export function evaluateCoverage(
  plan: Plan,
  date: Date,
  startTime: string,
  endTime: string,
  durationHours: number,
  hoursRemaining: number,
  bay: any
) {
  const enforce = enforcementActive(date);
  const withinWindow = enforce ? isWithinCoveredWindow(plan, date, startTime, endTime) : true;
  const hasHours = !enforce ? true : durationHours <= hoursRemaining + 1e-9;
  const included = withinWindow && hasHours;

  const baseRate = included ? 0 : baseBayRate(bay, date, startTime);
  const perHour = included ? 0 : memberDiscountedRate(baseRate, plan);
  const totalCost = included ? 0 : Math.round(perHour * durationHours * 100) / 100;

  return { included, withinWindow, hasHours, perHour, totalCost };
}
