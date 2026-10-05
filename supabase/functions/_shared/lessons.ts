// Lessons configuration (server / source of truth).
//
// MIRRORED by src/config/lessons.js — keep the two in sync. This copy is
// authoritative for pricing lesson purchases and for how many lesson credits
// a purchase grants.

export type LessonPackageType = "single" | "three" | "seven";

export interface LessonPackage {
  id: string;
  packageType: LessonPackageType;
  credits: number;
  price: number; // pre-tax dollars; MN sales tax added at checkout
  label: string;
}

// The three purchasable SKUs (pre-tax; MN sales tax added at checkout).
export const LESSON_PACKAGES: LessonPackage[] = [
  { id: "single", packageType: "single", credits: 1, price: 150, label: "Single Lesson" },
  { id: "three",  packageType: "three",  credits: 3, price: 350, label: "3-Lesson Package" },
  { id: "seven",  packageType: "seven",  credits: 7, price: 800, label: "7-Lesson Package" },
];

export function getLessonPackage(id: string): LessonPackage | null {
  return LESSON_PACKAGES.find((p) => p.id === id) || null;
}

export const DEFAULT_LESSON_MINUTES = 60;

// Add minutes to an 'HH:MM' time, returning 'HH:MM'. Used to derive a lesson's
// end time from its start (every lesson is DEFAULT_LESSON_MINUTES long).
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = String(time).split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

// True when `date` ('yyyy-MM-dd') + `startTime` ('HH:MM') is an available
// 60-minute lesson start at `location`, per the open_lesson_times RPC (which
// respects Brandon's weekly windows and removes overlapping/past times).
export async function isLessonTimeOpen(
  // deno-lint-ignore no-explicit-any
  db: any,
  location: string,
  date: string,
  startTime: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("open_lesson_times", {
    p_location: location,
    p_from: date,
    p_to: date,
  });
  if (error) {
    console.error("open_lesson_times (validation) failed:", error.message);
    return false;
  }
  // deno-lint-ignore no-explicit-any
  return (data || []).some((r: any) => r.lesson_date === date && r.start_time === startTime);
}
