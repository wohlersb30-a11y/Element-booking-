// ---------------------------------------------------------------------------
// Membership plan config — Deno/edge copy. Mirror of
// src/config/membershipPlans.js. Keep the two in sync.
// ---------------------------------------------------------------------------

export const ENFORCE_SEASON_ONLY = false;

export interface CoveredWindow {
  days: number[];
  allDay?: boolean;
  start?: string;
  end?: string;
}
export interface Plan {
  id: string;
  name: string;
  hours: number;
  hoursPeriod: "week" | "month";
  guestPasses: number;
  guestPassPeriod: "week" | "month";
  discount: number;
  coveredWindows: CoveredWindow[] | "anytime";
}

export const MEMBERSHIP_PLANS: Record<string, Plan> = {
  junior: {
    id: "junior",
    name: "Junior",
    hours: 4,
    hoursPeriod: "week",
    guestPasses: 1,
    guestPassPeriod: "month",
    discount: 0,
    coveredWindows: [
      { days: [1, 2, 3, 4], start: "14:00", end: "17:30" },
      { days: [0], start: "19:00", end: "21:00" }
    ]
  },
  silver: {
    id: "silver",
    name: "Silver",
    hours: 3,
    hoursPeriod: "month",
    guestPasses: 0,
    guestPassPeriod: "month",
    discount: 0.25,
    coveredWindows: [
      { days: [1, 2, 3, 4], allDay: true },
      { days: [5], start: "00:00", end: "12:00" }
    ]
  },
  platinum: {
    id: "platinum",
    name: "Platinum",
    hours: 10,
    hoursPeriod: "month",
    guestPasses: 3,
    guestPassPeriod: "month",
    discount: 0.25,
    coveredWindows: [
      { days: [1, 2, 3, 4], allDay: true },
      { days: [5], start: "00:00", end: "15:00" },
      { days: [6], start: "09:00", end: "12:00" }
    ]
  },
  diamond: {
    id: "diamond",
    name: "Diamond",
    hours: 15,
    hoursPeriod: "month",
    guestPasses: 5,
    guestPassPeriod: "month",
    discount: 0.35,
    coveredWindows: "anytime"
  },
  corporate: {
    id: "corporate",
    name: "Corporate",
    hours: 25,
    hoursPeriod: "month",
    guestPasses: 0,
    guestPassPeriod: "month",
    discount: 0.25,
    coveredWindows: "anytime"
  }
};

export function getPlan(tier?: string | null): Plan | null {
  if (!tier) return null;
  return MEMBERSHIP_PLANS[String(tier).toLowerCase()] || null;
}

export function timeToMinutes(t: string): number {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isRestrictedSeason(date: Date): boolean {
  const m = date.getMonth();
  return m >= 9 || m <= 3;
}

export function enforcementActive(date: Date): boolean {
  return ENFORCE_SEASON_ONLY ? isRestrictedSeason(date) : true;
}

export function isWithinCoveredWindow(
  plan: Plan,
  date: Date,
  startTime: string,
  endTime: string
): boolean {
  if (!plan) return false;
  if (plan.coveredWindows === "anytime") return true;
  const day = date.getDay();
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return plan.coveredWindows.some((w) => {
    if (!w.days.includes(day)) return false;
    if (w.allDay) return true;
    return s >= timeToMinutes(w.start!) && e <= timeToMinutes(w.end!);
  });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parse a 'yyyy-mm-dd' string into a local Date (no timezone drift).
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function periodBounds(
  periodType: "week" | "month",
  ref: Date
): { start: string; end: string } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (periodType === "week") {
    const day = d.getDay();
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

export function memberDiscountedRate(baseRate: number, plan: Plan): number {
  const d = plan?.discount || 0;
  return Math.round(baseRate * (1 - d) * 100) / 100;
}
