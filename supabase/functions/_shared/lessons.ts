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
