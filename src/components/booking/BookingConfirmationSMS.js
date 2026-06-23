import { base44 } from "@/api/base44Client";

// Customer-facing business details. Keep in sync with
// supabase/functions/_shared/locations.ts and BookingConfirmationEmail.jsx.
const BRAND = {
  name: "Element Indoor Golf",
  phone: "651-330-1699"
};

const LOCATIONS = {
  vadnais_heights: { label: "Vadnais Heights" },
  burnsville: { label: "Burnsville" }
};

const locationLabel = (location) =>
  (location && LOCATIONS[location]?.label) || BRAND.name;

const getBayDisplayName = (originalName) => {
  const nameMap = {
    "East 1": "Bay 1",
    "East 2": "Bay 2",
    "West 1": "Bay 3",
    "West 2": "Bay 4",
    "West 3": "Bay 5",
    "South 1": "Bay 6",
    "South 2": "Bay 7",
    "North 1": "Bay 8",
    "North 2": "Bay 9",
    "VIP 1": "VIP 1",
    "VIP 2": "VIP 2"
  };
  return nameMap[originalName] || originalName;
};

const formatTime = (time24) => {
  const [hours, minutes] = String(time24).split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
};

const formatDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

// Best-effort confirmation text. No-ops silently if the booking has no phone
// number. The customer is told to CALL to make changes (this line can't reply).
export async function sendBookingConfirmationSMS(bookingData) {
  const {
    customer_phone,
    simulator_name,
    booking_date,
    start_time,
    location
  } = bookingData;

  if (!customer_phone) return { success: false, skipped: true };

  const bay = getBayDisplayName(simulator_name);
  const body =
    `\u26F3 ${BRAND.name}: You're booked! ${bay} at ${locationLabel(location)} on ` +
    `${formatDate(booking_date)} at ${formatTime(start_time)}. ` +
    `Arrive 10 min early & bring your A-game. Need to change? Call ${BRAND.phone}. See you soon!`;

  try {
    const result = await base44.functions.invoke("send-sms", {
      to: customer_phone,
      body
    });
    return { success: true, data: result?.data };
  } catch (error) {
    console.error("Error sending confirmation SMS:", error);
    return { success: false, error };
  }
}
