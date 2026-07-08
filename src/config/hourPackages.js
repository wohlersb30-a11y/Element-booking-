// Banked-hours "packages" configuration (frontend copy).
//
// MIRRORED by supabase/functions/_shared/hourPackages.ts — keep the two in sync.
// The server copy is the source of truth used to price purchases and validate
// drawdowns; this copy drives the Buy Hours UI and the booking-time preview.
//
// Two hour buckets:
//   off_peak - usable ONLY for off-peak slots
//   peak     - usable for ANY slot (peak or off-peak)
// Hours never expire.

// The four purchasable SKUs, taken from elementindoorgolf.com/golf. Prices are
// pre-tax; Minnesota sales tax is added at checkout.
export const HOUR_PACKAGES = [
  { id: "10-offpeak", size: 10, kind: "off_peak", price: 400, perHour: 40, label: "10 Hours — Off-Peak" },
  { id: "10-peak",    size: 10, kind: "peak",     price: 500, perHour: 50, label: "10 Hours — Peak (use anytime)" },
  { id: "20-offpeak", size: 20, kind: "off_peak", price: 700, perHour: 35, label: "20 Hours — Off-Peak" },
  { id: "20-peak",    size: 20, kind: "peak",     price: 900, perHour: 45, label: "20 Hours — Peak (use anytime)" }
];

export function getPackage(id) {
  return HOUR_PACKAGES.find((p) => p.id === id) || null;
}

// VIP suites cost more per hour. When banked hours are used for a VIP bay, the
// per-hour surcharge is charged to the card (hours still draw 1:1). Owner should
// confirm these figures — the site says "$15–$20 more per hour during peak."
export const VIP_SURCHARGE_PER_HOUR = { peak: 20, off_peak: 15 };

export function vipSurchargePerHour(slotIsPeak) {
  return slotIsPeak ? VIP_SURCHARGE_PER_HOUR.peak : VIP_SURCHARGE_PER_HOUR.off_peak;
}

// Parse a 'YYYY-MM-DD' string (or Date) into a local Date without the UTC-
// midnight timezone shift that new Date('YYYY-MM-DD') introduces.
function toLocalDate(date) {
  if (date instanceof Date) return date;
  const s = String(date);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return new Date(y, m - 1, d);
}

// Peak = weekends, or Friday at/after 3pm. Matches the app's existing pricing
// rule in BookSimulator (calculateRate). NOTE: the marketing page describes
// off-peak as "Fri before noon" — the Fri noon–3pm window is treated as
// off-peak here; confirm with owner if that should be peak.
export function isPeakSlot(date, startTime) {
  const d = toLocalDate(date);
  const dow = d.getDay(); // 0 = Sun, 6 = Sat
  const hour = parseInt(String(startTime).split(":")[0], 10);
  const isWeekend = dow === 0 || dow === 6;
  const isFridayAfter3pm = dow === 5 && hour >= 15;
  return isWeekend || isFridayAfter3pm;
}

// Buckets that can cover a slot, in preference (spend) order.
//   off-peak slot -> spend off_peak first, then peak
//   peak slot     -> peak only
export function coveringKinds(slotIsPeak) {
  return slotIsPeak ? ["peak"] : ["off_peak", "peak"];
}
