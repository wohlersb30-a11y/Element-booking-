import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import Stripe from 'npm:stripe@14.11.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
    console.log("=== CAPTURE HOLD STARTED ===");

    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capturing a hold charges the customer — admin only.
        if (user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { bookingId } = await req.json();
        if (!bookingId) {
            return Response.json({ success: false, error: 'No booking ID provided' });
        }

        const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
        if (!booking) {
            return Response.json({ success: false, error: 'Booking not found' });
        }

        if (!booking.stripe_payment_id) {
            return Response.json({ success: false, error: 'No payment hold on this booking' });
        }

        if (booking.payment_status === "paid") {
            return Response.json({ success: true, alreadyCaptured: true, booking });
        }

        // Confirm the intent is still in a capturable state before charging.
        const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_id);
        if (intent.status !== "requires_capture") {
            return Response.json({
                success: false,
                error: `Hold cannot be captured (status: ${intent.status}).`
            });
        }

        const captured = await stripe.paymentIntents.capture(booking.stripe_payment_id);
        console.log("Captured intent:", captured.id, captured.status);

        const updated = await base44.asServiceRole.entities.Booking.update(bookingId, {
            payment_status: "paid"
        });

        console.log("=== CAPTURE HOLD SUCCESS ===");
        return Response.json({
            success: true,
            booking: updated,
            amountCaptured: captured.amount_received / 100
        });
    } catch (error) {
        console.error("=== CAPTURE HOLD ERROR ===", error.message);
        return Response.json({
            success: false,
            error: error.message || 'Failed to capture hold'
        }, { status: 500 });
    }
});
