// Banked-hours "packages" configuration (server / source of truth).
//
// MIRRORED by src/config/hourPackages.js — keep the two in sync. This copy is
// authoritative for pricing purchases and validating drawdowns.
//
// Two hour buckets:
//   off_peak - usable ONLY for off-peak slots
//   peak     - usable for ANY slot (peak or off-peak)
// Hours never expire.

export type HourKind = "peak" | "off_peak";

export interface HourPackage {
  id: string;
  size: number;
  kind: HourKind;
  price: number;
  perHour: number;
  label: string;
}

// The four purchasable SKUs (pre-tax; MN sales tax added at checkout).
export const HOUR_PACKAGES: HourPackage[] = [
  { id: "10-offpeak", size: 10, kind: "off_peak", price: 400, perHour: 40, label: "10 Hours — Off-Peak" },
  { id: "10-peak",    size: 10, kind: "peak",     price: 500, perHour: 50, label: "10 Hours — Peak (use anytime)" },
  { id: "20-offpeak", size: 20, kind: "off_peak", price: 700, perHour: 35, label: "20 Hours — Off-Peak" },
  { id: "20-peak",    size: 20, kind: "peak",     price: 900, perHour: 45, label: "20 Hours — Peak (use anytime)" },
];

export function getPackage(id: string): HourPackage | null {
  return HOUR_PACKAGES.find((p) => p.id === id) || null;
}

// Per-hour VIP surcharge (charged to card; hours still draw 1:1). Owner should
// confirm these figures.
export const VIP_SURCHARGE_PER_HOUR: Record<HourKind, number> = { peak: 20, off_peak: 15 };

export function vipSurchargePerHour(slotIsPeak: boolean): number {
  return slotIsPeak ? VIP_SURCHARGE_PER_HOUR.peak : VIP_SURCHARGE_PER_HOUR.off_peak;
}

function toLocalDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  const s = String(date);
  return new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
}

// Peak = weekends, or Friday at/after 3pm. Mirrors the app's pricing rule.
export function isPeakSlot(date: string | Date, startTime: string): boolean {
  const d = toLocalDate(date);
  const dow = d.getDay();
  const hour = parseInt(String(startTime).split(":")[0], 10);
  const isWeekend = dow === 0 || dow === 6;
  const isFridayAfter3pm = dow === 5 && hour >= 15;
  return isWeekend || isFridayAfter3pm;
}

// Buckets that can cover a slot, in preference (spend) order.
export function coveringKinds(slotIsPeak: boolean): HourKind[] {
  return slotIsPeak ? ["peak"] : ["off_peak", "peak"];
}
