// Small, defensive formatting helpers. These never throw on bad/missing input
// (a common cause of render crashes), returning a safe placeholder instead so a
// single malformed record can't take a page down.

// "14:30" -> "2:30 PM". Returns "" for missing/invalid values.
export function formatTime(time24) {
  if (!time24 || typeof time24 !== "string" || !time24.includes(":")) return "";
  const [h, m] = time24.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

// Format a digits-only phone as (XXX) XXX-XXXX when it's a 10-digit US number.
export function formatPhone(p) {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(p);
}
