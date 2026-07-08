// ---------------------------------------------------------------------------
// Element Indoor Golf — membership plan configuration (single source of truth)
// Mirrored for the Deno edge function in
// supabase/functions/_shared/membershipPlans.ts — keep the two in sync.
//
// Numbers/windows come from the public pricing page
// (elementindoorgolf.com/memberships) using the Oct–April "restricted season"
// allotments and covered windows as the standing rules.
// ---------------------------------------------------------------------------

// When false, allotments + covered windows are enforced EVERY month (year-round
// — the owner's choice). Flip to true to only enforce Oct–April and treat
// May–September as unlimited/open, matching the marketing copy.
export const ENFORCE_SEASON_ONLY = false;

// Days: 0 = Sunday … 6 = Saturday (matches JS Date.getDay()).
export const MEMBERSHIP_PLANS = {
  junior: {
    id: "junior",
    name: "Junior",
    price: 100,
    priceUnit: "mo",
    hours: 4,
    hoursPeriod: "week", // Junior hours reset weekly (Mon–Sun)
    guestPasses: 1,
    guestPassPeriod: "month",
    discount: 0,
    coveredWindows: [
      { days: [1, 2, 3, 4], start: "14:00", end: "17:30" }, // Mon–Thu 2–5:30pm
      { days: [0], start: "19:00", end: "21:00" } // Sun 7–9pm
    ],
    perks: [
      "May–Sep unlimited sim time",
      "1 guest pass / month",
      "12‑month commitment"
    ]
  },
  silver: {
    id: "silver",
    name: "Silver",
    price: 75,
    priceUnit: "mo",
    hours: 3,
    hoursPeriod: "month",
    guestPasses: 0,
    guestPassPeriod: "month",
    discount: 0.25,
    coveredWindows: [
      { days: [1, 2, 3, 4], allDay: true }, // Mon–Thu anytime
      { days: [5], start: "00:00", end: "12:00" } // Fri before noon
    ],
    perks: [
      "May–Sep 5 hrs / month",
      "25% off additional sim time",
      "Add spouse for $50 / mo"
    ]
  },
  platinum: {
    id: "platinum",
    name: "Platinum",
    price: 179,
    priceUnit: "mo",
    recommended: true,
    hours: 10,
    hoursPeriod: "month",
    guestPasses: 3,
    guestPassPeriod: "month",
    discount: 0.25,
    coveredWindows: [
      { days: [1, 2, 3, 4], allDay: true }, // Mon–Thu anytime
      { days: [5], start: "00:00", end: "15:00" }, // Fri before 3pm
      { days: [6], start: "09:00", end: "12:00" } // Sat 9am–12pm
    ],
    perks: [
      "May–Sep unlimited sim time",
      "Club storage included",
      "Kids 13 & under golf free with parent",
      "25% off additional sim time",
      "3 guest passes / month"
    ]
  },
  diamond: {
    id: "diamond",
    name: "Diamond",
    price: 299,
    priceUnit: "mo",
    hours: 15,
    hoursPeriod: "month",
    guestPasses: 5,
    guestPassPeriod: "month",
    discount: 0.35,
    coveredWindows: "anytime",
    perks: [
      "May–Sep unlimited sim time",
      "Club storage included",
      "Kids 13 & under golf free with parent",
      "35% off additional sim time",
      "5 guest passes / month (extra passes $25 each)"
    ]
  },
  corporate: {
    id: "corporate",
    name: "Corporate",
    price: 5250,
    priceUnit: "yr",
    hours: 25,
    hoursPeriod: "month",
    guestPasses: 0,
    guestPassPeriod: "month",
    discount: 0.25,
    coveredWindows: "anytime",
    accountHolders: 5,
    perks: [
      "May–Sep unlimited sim time",
      "Up to 5 designated account holders",
      "Bay sponsorship with business promotion",
      "Club storage for up to 5 sets",
      "25% off all additional sim time"
    ]
  }
};

export const PLAN_ORDER = ["junior", "silver", "platinum", "diamond", "corporate"];

export function getPlan(tier) {
  if (!tier) return null;
  return MEMBERSHIP_PLANS[String(tier).toLowerCase()] || null;
}

// "HH:MM" -> minutes since midnight
export function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

// Restricted season = October through April (per the pricing page).
export function isRestrictedSeason(date) {
  const m = date.getMonth(); // 0-11
  return m >= 9 || m <= 3; // Oct(9)–Dec(11), Jan(0)–Apr(3)
}

// Should allotments / covered windows be enforced for this date?
export function enforcementActive(date) {
  return ENFORCE_SEASON_ONLY ? isRestrictedSeason(date) : true;
}

// Is a booking [startTime, endTime) on `date` inside the plan's covered windows?
export function isWithinCoveredWindow(plan, date, startTime, endTime) {
  if (!plan) return false;
  if (plan.coveredWindows === "anytime") return true;
  const day = date.getDay();
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return plan.coveredWindows.some((w) => {
    if (!w.days.includes(day)) return false;
    if (w.allDay) return true;
    return s >= timeToMinutes(w.start) && e <= timeToMinutes(w.end);
  });
}

function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Inclusive [start, end] date strings for the allotment period containing `ref`.
// periodType: 'month' -> 1st..last of month; 'week' -> Mon..Sun.
export function periodBounds(periodType, ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (periodType === "week") {
    const day = d.getDay(); // 0 Sun..6 Sat
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: toDateStr(mon), end: toDateStr(sun) };
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toDateStr(first), end: toDateStr(last) };
}

// Sum included hours already used in the plan's hour-period around `ref`.
export function hoursUsedInPeriod(plan, memberBookings, ref = new Date()) {
  const { start, end } = periodBounds(plan.hoursPeriod, ref);
  return memberBookings
    .filter(
      (b) =>
        b.status !== "cancelled" &&
        b.included &&
        b.booking_date >= start &&
        b.booking_date <= end
    )
    .reduce((sum, b) => sum + Number(b.duration_hours || 0), 0);
}

// Guest passes already used in the plan's pass-period around `ref`.
export function guestPassesUsedInPeriod(plan, memberBookings, ref = new Date()) {
  const { start, end } = periodBounds(plan.guestPassPeriod, ref);
  return memberBookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.guest_pass_used &&
      b.booking_date >= start &&
      b.booking_date <= end
  ).length;
}

// Normal rate minus the member's discount, rounded to cents.
export function memberDiscountedRate(baseRate, plan) {
  const d = plan?.discount || 0;
  return Math.round(baseRate * (1 - d) * 100) / 100;
}
