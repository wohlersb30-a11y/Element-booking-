import { SendEmail } from "@/integrations/Core";

// Customer-facing business details. Keep in sync with the edge-function copy in
// supabase/functions/_shared/locations.ts.
const BRAND = {
  name: "Element Indoor Golf",
  phone: "651-330-1699",
  website: "www.elementindoorgolf.com"
};

const LOCATIONS = {
  vadnais_heights: {
    label: "Vadnais Heights",
    address: "4255 White Bear Parkway, Suite 2100, Vadnais Heights, MN 55110"
  },
  burnsville: {
    label: "Burnsville",
    address: "14314 Burnhaven Drive, Burnsville, MN 55306"
  }
};

const locationInfo = (location) =>
  (location && LOCATIONS[location]) || { label: BRAND.name, address: "" };

const formatTime = (time24) => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

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

export async function sendBookingConfirmation(bookingData) {
  const {
    customer_name,
    customer_email,
    simulator_name,
    booking_date,
    start_time,
    end_time,
    duration_hours,
    total_cost,
    number_of_players,
    payment_method,
    notes,
    location
  } = bookingData;

  const loc = locationInfo(location);
  const bayDisplayName = getBayDisplayName(simulator_name);
  const formattedDate = new Date(booking_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const startTime12 = formatTime(start_time);
  const endTime12 = formatTime(end_time);
  
  const durationText = duration_hours === 1 ? "1 hour" : 
    duration_hours % 1 === 0 ? `${duration_hours} hours` : 
    `${duration_hours} hours`;

  const paymentMethodText = payment_method === "pay_at_venue" ? "Pay at Venue" :
    payment_method === "card_on_file" ? "Card on File" :
    payment_method === "credit_card" ? "Credit Card (Paid)" :
    "Other Arrangement";

  const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #334155;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 30px 0;
      background: linear-gradient(135deg, #2d5567 0%, #1e3a47 100%);
      color: white;
      border-radius: 10px 10px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .content {
      background: white;
      padding: 30px;
      border: 1px solid #e2e8f0;
      border-top: none;
    }
    .booking-details {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #475569;
    }
    .detail-value {
      color: #1e293b;
      text-align: right;
    }
    .total {
      background: #2d5567;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      margin: 20px 0;
      text-align: center;
      font-size: 24px;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #64748b;
      font-size: 14px;
      border-top: 1px solid #e2e8f0;
      margin-top: 20px;
    }
    .important-note {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⛳ You're Booked!</h1>
    <p style="margin: 10px 0 0 0;">${BRAND.name}</p>
  </div>

  <div class="content">
    <p>Hi ${customer_name},</p>

    <p>Game on! Your bay is officially reserved and the simulators are already getting excited. Here's everything you need to know before you tee off:</p>

    <div class="booking-details">
      <h2 style="margin-top: 0; color: #2d5567;">Reservation Details</h2>
      
      <div class="detail-row">
        <span class="detail-label">Bay:</span>
        <span class="detail-value">${bayDisplayName}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${formattedDate}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Time:</span>
        <span class="detail-value">${startTime12} - ${endTime12}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Duration:</span>
        <span class="detail-value">${durationText}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Players:</span>
        <span class="detail-value">${number_of_players || 1}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Payment:</span>
        <span class="detail-value">${paymentMethodText}</span>
      </div>
      
      ${notes ? `
      <div class="detail-row">
        <span class="detail-label">Notes:</span>
        <span class="detail-value">${notes}</span>
      </div>
      ` : ''}
    </div>
    
    <div class="total">
      Authorization Hold: $${total_cost.toFixed(2)}
      <div style="font-size:13px;font-weight:normal;opacity:0.9;margin-top:6px;">not charged — see below</div>
    </div>

    <div style="background:#ecfdf5;border:2px solid #10b981;border-radius:8px;padding:18px;margin:20px 0;text-align:center;">
      <p style="margin:0;font-size:18px;font-weight:bold;color:#065f46;">💳 You haven't been charged.</p>
      <p style="margin:8px 0 0;color:#065f46;font-size:14px;line-height:1.5;">
        We've only placed a temporary <strong>hold</strong> on your card to reserve your bay.
        Pay in person when you arrive — and feel free to split the bill with your group however you like!
        The hold is released after your reservation, and is only charged if you no-show or cancel within 24 hours.
      </p>
    </div>

    <div class="important-note">
      <strong>📍 Where to find us:</strong><br>
      ${BRAND.name} — ${loc.label}<br>
      ${loc.address || ''}<br><br>

      <strong>⏰ Do future-you a favor and arrive 10 minutes early</strong> to check in, settle in, and maybe grab a snack before your first swing.
    </div>

    <p><strong>Need to change or cancel?</strong> Give us a ring at <strong>${BRAND.phone}</strong> and we'll take care of you. (This inbox doesn't accept replies.)</p>

    <p>Now go practice your victory dance — you're going to need it. See you on the tee! 🏌️</p>

    <p style="margin-top: 30px;">
      Game on,<br>
      <strong>The ${BRAND.name} Team</strong>
    </p>
  </div>

  <div class="footer">
    <p>${BRAND.name} | ${BRAND.phone} | ${BRAND.website}</p>
    <p style="font-size: 12px; color: #94a3b8;">
      To cancel or modify your reservation, please call us at ${BRAND.phone}.
    </p>
  </div>
</body>
</html>
  `;

  try {
    await SendEmail({
      from_name: "Element Indoor Golf",
      to: customer_email,
      subject: `You're booked! ⛳ ${bayDisplayName} on ${formattedDate}`,
      body: emailBody
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error sending confirmation email:", error);
    return { success: false, error };
  }
}