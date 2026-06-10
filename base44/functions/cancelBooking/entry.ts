import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import Stripe from 'npm:stripe@14.11.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

const formatTime = (time24) => {
    const [hours, minutes] = String(time24).split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
};

const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

Deno.serve(async (req) => {
    console.log("=== CANCEL BOOKING STARTED ===");

    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { bookingId } = await req.json();
        if (!bookingId) {
            return Response.json({ success: false, error: 'No booking ID provided' });
        }

        const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
        if (!booking) {
            return Response.json({ success: false, error: 'Booking not found' });
        }

        // Only the booking owner or an admin may cancel.
        const isOwner = booking.customer_email === user.email;
        const isAdmin = user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (booking.status === "cancelled") {
            return Response.json({ success: true, alreadyCancelled: true, booking });
        }

        // Release the Stripe authorization hold, if one exists.
        let holdReleased = false;
        if (booking.stripe_payment_id) {
            try {
                await stripe.paymentIntents.cancel(booking.stripe_payment_id);
                holdReleased = true;
                console.log("Hold released for", booking.stripe_payment_id);
            } catch (err) {
                // Intent may already be captured or canceled; log and continue.
                console.error("Could not release hold:", err.message);
            }
        }

        const updated = await base44.asServiceRole.entities.Booking.update(bookingId, {
            status: "cancelled",
            payment_status: holdReleased ? "refunded" : booking.payment_status
        });

        // Notify the customer of the cancellation.
        try {
            await base44.integrations.Core.SendEmail({
                from_name: "Element Indoor Golf",
                to: booking.customer_email,
                subject: `Booking Cancelled - ${formatDate(booking.booking_date)}`,
                body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#2d5567,#1e3a47);color:#fff;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:24px;">Booking Cancelled</h1>
    <p style="margin:8px 0 0;">Element Indoor Golf</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;">
    <p>Hi ${booking.customer_name},</p>
    <p>Your reservation for <strong>${booking.simulator_name}</strong> on <strong>${formatDate(booking.booking_date)}</strong> at <strong>${formatTime(booking.start_time)}</strong> has been cancelled.</p>
    ${holdReleased ? "<p>The authorization hold on your card has been released.</p>" : ""}
    <p>We hope to see you again soon — you can book any time from our site.</p>
    <p style="margin-top:24px;">Best regards,<br/><strong>Element Indoor Golf Team</strong></p>
  </div>
</body></html>`
            });
        } catch (emailErr) {
            console.error("Cancellation email failed:", emailErr.message);
        }

        // Notify waitlist customers waiting for this location/date that a spot opened.
        let notifiedCount = 0;
        try {
            const waiting = await base44.asServiceRole.entities.Waitlist.filter({
                location: booking.location,
                preferred_date: booking.booking_date,
                status: "active"
            });

            for (const entry of (waiting || [])) {
                try {
                    await base44.integrations.Core.SendEmail({
                        from_name: "Element Indoor Golf",
                        to: entry.customer_email,
                        subject: `A spot just opened up - ${formatDate(booking.booking_date)}`,
                        body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#334155;max-width:600px;margin:0 auto;padding:20px;">
  <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#2d5567,#1e3a47);color:#fff;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;font-size:24px;">A Spot Opened Up!</h1>
    <p style="margin:8px 0 0;">Element Indoor Golf</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;">
    <p>Hi ${entry.customer_name},</p>
    <p>Good news — a bay just became available at <strong>${booking.location}</strong> on <strong>${formatDate(booking.booking_date)}</strong> around <strong>${formatTime(booking.start_time)}</strong>, which matches your waitlist request.</p>
    <p>Spots fill fast, so book now before someone else grabs it.</p>
    <p style="margin-top:24px;">See you soon,<br/><strong>Element Indoor Golf Team</strong></p>
  </div>
</body></html>`
                    });
                    await base44.asServiceRole.entities.Waitlist.update(entry.id, {
                        status: "notified",
                        notified_at: new Date().toISOString()
                    });
                    notifiedCount++;
                } catch (wErr) {
                    console.error("Waitlist notify failed for", entry.id, wErr.message);
                }
            }
        } catch (wlErr) {
            console.error("Waitlist lookup failed:", wlErr.message);
        }

        console.log("=== CANCEL BOOKING SUCCESS ===", { holdReleased, notifiedCount });
        return Response.json({
            success: true,
            booking: updated,
            holdReleased,
            waitlistNotified: notifiedCount
        });
    } catch (error) {
        console.error("=== CANCEL BOOKING ERROR ===", error.message);
        return Response.json({
            success: false,
            error: error.message || 'Failed to cancel booking'
        }, { status: 500 });
    }
});
