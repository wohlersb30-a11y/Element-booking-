// Central definition of the reservation categories shown on the admin daily
// schedule, plus their colors. Used both to color booking blocks in
// DailyScheduleView and to render the always-visible legend/key so the two can
// never drift apart.
//
// Each category carries:
//   key    - stable identifier returned by classifyBooking()
//   label  - human label shown in the legend
//   dot    - Tailwind bg class for the small legend swatch
//   block  - Tailwind classes for the booking block (bg + hover + text color)
//   border - Tailwind left-accent border class for the booking block
export const BOOKING_CATEGORIES = [
  {
    key: "public",
    label: "Public booking",
    dot: "bg-blue-500",
    block: "bg-blue-500 hover:bg-blue-600 text-white",
    border: "border-blue-700"
  },
  {
    key: "member",
    label: "Member",
    dot: "bg-purple-500",
    block: "bg-purple-500 hover:bg-purple-600 text-white",
    border: "border-purple-700"
  },
  {
    key: "special",
    label: "Special purchased",
    dot: "bg-orange-500",
    block: "bg-orange-500 hover:bg-orange-600 text-white",
    border: "border-orange-700"
  },
  {
    key: "banked",
    label: "Banked hours",
    dot: "bg-green-500",
    block: "bg-green-500 hover:bg-green-600 text-white",
    border: "border-green-700"
  }
];

const BY_KEY = Object.fromEntries(BOOKING_CATEGORIES.map((c) => [c.key, c]));

// The types staff can pick from when entering a manual booking. Kept in sync
// with BOOKING_CATEGORIES so the dropdown and the legend never drift.
export const RESERVATION_TYPE_OPTIONS = BOOKING_CATEGORIES.map((c) => ({
  value: c.key,
  label: c.label
}));

// Classify a booking row into one of the category keys above. Order of
// precedence:
//   1. A reservation that lives in the member_bookings table (merged in).
//   2. An explicit, non-default staff choice (special / banked / member).
//   3. A regular booking whose customer is on the membership roster (matched
//      by email) — so a member shows as a member even when booked through the
//      public flow and left on the default "public" type.
//   4. Whatever reservation_type is set (incl. the "public" default), else public.
export function classifyBooking(b) {
  if (!b) return "public";
  if (b.booking_type === "member" || b.is_member) return "member";
  if (b.reservation_type === "special" || b.special_id) return "special";
  if (b.reservation_type === "banked" || b.payment_method === "banked_hours" || b.is_banked) return "banked";
  if (b.reservation_type === "member") return "member";
  if (b.is_member_customer) return "member";
  if (b.reservation_type && BY_KEY[b.reservation_type]) return b.reservation_type;
  return "public";
}

// Build a lookup of every email tied to an ACTIVE membership (the primary
// user_email plus any authorized/family emails), lowercased, → the membership
// row. Lets the tee sheet recognize a member's reservation even when it was
// booked through the public flow and never tagged "member".
export function buildMemberEmailMap(memberships = []) {
  const map = new Map();
  for (const m of memberships || []) {
    if (!m) continue;
    if (m.status && m.status !== "active") continue;
    const emails = [m.user_email, ...(Array.isArray(m.authorized_emails) ? m.authorized_emails : [])];
    for (const e of emails) {
      const key = String(e || "").trim().toLowerCase();
      if (key.includes("@")) map.set(key, m);
    }
  }
  return map;
}

// Tag regular bookings whose customer email is on the membership roster so
// classifyBooking() colors them as members. member_bookings rows (already
// tagged) and non-members are returned untouched. Returns a new array.
export function markMemberCustomers(bookings = [], memberEmailMap) {
  if (!memberEmailMap || memberEmailMap.size === 0) return bookings;
  return (bookings || []).map((b) => {
    if (!b || b.booking_type === "member" || b.is_member) return b;
    const key = String(b.customer_email || "").trim().toLowerCase();
    const m = key ? memberEmailMap.get(key) : null;
    if (!m) return b;
    return { ...b, is_member_customer: true, member_level: m.membership_level || null };
  });
}

export function categoryStyle(b) {
  return BY_KEY[classifyBooking(b)] || BY_KEY.public;
}

// Normalize a member_bookings row into the shape DailyScheduleView expects for a
// regular booking, tagged so classifyBooking() colors it as a member. Member
// rows use member_name/member_email instead of customer_* fields.
export function normalizeMemberBooking(m) {
  return {
    ...m,
    booking_type: "member",
    is_member: true,
    customer_name: m.member_name || m.member_email || "Member",
    customer_phone: m.member_email || "",
    number_of_players: m.number_of_players || 1
  };
}
