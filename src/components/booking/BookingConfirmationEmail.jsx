import { SendEmail } from "@/integrations/Core";

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
    notes
  } = bookingData;

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
    <h1>🎯 Booking Confirmed!</h1>
    <p style="margin: 10px 0 0 0;">Element Indoor Golf</p>
  </div>
  
  <div class="content">
    <p>Hi ${customer_name},</p>
    
    <p>Thank you for booking with Element Indoor Golf! Your reservation has been confirmed.</p>
    
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
      Total: $${total_cost.toFixed(2)}
    </div>
    
    <div class="important-note">
      <strong>📍 Location:</strong><br>
      Element Indoor Golf<br>
      [Your Address Here]<br><br>
      
      <strong>⏰ Please arrive 10 minutes early</strong> to check in and get settled.
    </div>
    
    <p><strong>Questions?</strong> Feel free to call us or reply to this email.</p>
    
    <p>We look forward to seeing you!</p>
    
    <p style="margin-top: 30px;">
      Best regards,<br>
      <strong>Element Indoor Golf Team</strong>
    </p>
  </div>
  
  <div class="footer">
    <p>Element Indoor Golf | [Your Phone Number] | [Your Website]</p>
    <p style="font-size: 12px; color: #94a3b8;">
      To cancel or modify your reservation, please contact us directly.
    </p>
  </div>
</body>
</html>
  `;

  try {
    await SendEmail({
      from_name: "Element Indoor Golf",
      to: customer_email,
      subject: `Booking Confirmed - ${bayDisplayName} on ${formattedDate}`,
      body: emailBody
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error sending confirmation email:", error);
    return { success: false, error };
  }
}