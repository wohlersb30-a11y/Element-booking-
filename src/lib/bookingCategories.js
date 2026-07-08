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
    block: "bg-purple-500 text-white",
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
    dot: "bg-teal-500",
    block: "bg-teal-500 hover:bg-teal-600 text-white",
    border: "border-teal-700"
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
// precedence: member rows merged into the schedule, then an explicit staff-
// chosen reservation_type, then inference from the online booking fields.
// Anything unlabeled falls back to "public".
export function classifyBooking(b) {
  if (!b) return "public";
  if (b.booking_type === "member" || b.is_member) return "member";
  if (b.reservation_type && BY_KEY[b.reservation_type]) return b.reservation_type;
  if (b.special_id) return "special";
  if (b.payment_method === "banked_hours" || b.is_banked) return "banked";
  return "public";
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
