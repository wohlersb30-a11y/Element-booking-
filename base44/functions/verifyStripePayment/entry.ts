import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import Stripe from 'npm:stripe@14.11.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
    console.log("=== VERIFY PAYMENT STARTED ===");
    
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        console.log("User:", user ? user.email : "no user");
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { sessionId } = body;
        console.log("Session ID:", sessionId);

        if (!sessionId) {
            return Response.json({ 
                success: false, 
                error: 'No session ID provided' 
            });
        }

        // Retrieve the checkout session from Stripe
        console.log("Retrieving Stripe session...");
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log("Session payment_status:", session.payment_status);
        console.log("Session status:", session.status);
        console.log("Payment intent ID:", session.payment_intent);

        // Check if session is complete
        if (session.status !== 'complete') {
            console.log("ERROR: Session not complete, status is:", session.status);
            return Response.json({ 
                success: false, 
                error: 'Checkout session not completed' 
            });
        }

        // For authorization holds, payment_status will be 'paid' even though it's just authorized
        // We need to check the payment intent to confirm it was authorized
        if (!session.payment_intent) {
            console.log("ERROR: No payment intent found");
            return Response.json({ 
                success: false, 
                error: 'No payment intent found' 
            });
        }

        // Get the payment intent to check its status
        console.log("Retrieving payment intent...");
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
        console.log("Payment Intent status:", paymentIntent.status);
        console.log("Payment Intent capture_method:", paymentIntent.capture_method);

        // Check if payment was authorized (for manual capture, status should be 'requires_capture')
        if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
            console.log("ERROR: Payment not authorized. Status:", paymentIntent.status);
            return Response.json({ 
                success: false, 
                error: `Payment not authorized. Status: ${paymentIntent.status}` 
            });
        }

        // Parse booking data from session metadata
        console.log("Parsing booking data...");
        const bookingData = JSON.parse(session.metadata.bookingData);
        console.log("Booking data:", bookingData);

        // Idempotency guard: if bookings already exist for this payment intent
        // (e.g. the customer refreshed the success page), return them instead
        // of creating duplicates.
        console.log("Checking for existing bookings for this payment...");
        const existingBookings = await base44.asServiceRole.entities.Booking.filter({
            stripe_payment_id: session.payment_intent
        });

        if (existingBookings && existingBookings.length > 0) {
            console.log("Found existing bookings, skipping creation:", existingBookings.length);
            return Response.json({
                success: true,
                bookings: existingBookings,
                paymentStatus: paymentIntent.status,
                alreadyProcessed: true
            });
        }

        // Server-side availability re-check to prevent concurrent double-booking.
        // Availability is validated client-side at search time, but two customers
        // can authorize payment for the same bay/slot simultaneously. Re-validate
        // here against confirmed bookings before creating anything.
        const toMinutes = (t) => {
            const [h, m] = String(t).split(":").map(Number);
            return h * 60 + m;
        };
        const newStart = toMinutes(bookingData.time);
        const newEnd = toMinutes(bookingData.endTime);

        const sameDayBookings = await base44.asServiceRole.entities.Booking.filter({
            booking_date: bookingData.date
        });

        const conflicts = [];
        for (const bayInfo of bookingData.selectedBays) {
            const overlap = (sameDayBookings || []).some((b) => {
                if (b.simulator_id !== bayInfo.bayId) return false;
                if (b.status === "cancelled") return false;
                return newStart < toMinutes(b.end_time) && newEnd > toMinutes(b.start_time);
            });
            if (overlap) conflicts.push(bayInfo.bayName);
        }

        if (conflicts.length > 0) {
            console.log("Conflict detected, releasing hold. Bays:", conflicts);
            // Release the authorization hold since we can't honor the booking.
            try {
                await stripe.paymentIntents.cancel(session.payment_intent);
            } catch (cancelErr) {
                console.error("Failed to cancel payment intent after conflict:", cancelErr.message);
            }
            return Response.json({
                success: false,
                error: `Sorry, ${conflicts.join(", ")} was just booked by someone else. Your card hold has been released — please choose another time.`,
                conflict: true
            });
        }

        // Create bookings in database using service role
        console.log("Creating bookings...");
        const createdBookings = [];

        for (const bayInfo of bookingData.selectedBays) {
            console.log("Creating booking for bay:", bayInfo.bayName);

            const booking = await base44.asServiceRole.entities.Booking.create({
                simulator_id: bayInfo.bayId,
                simulator_name: bayInfo.bayName,
                location: bookingData.location,
                customer_name: bookingData.customerName,
                customer_email: bookingData.customerEmail,
                customer_phone: bookingData.customerPhone,
                booking_date: bookingData.date,
                start_time: bookingData.time,
                end_time: bookingData.endTime,
                duration_hours: bookingData.duration,
                total_cost: bayInfo.cost,
                number_of_players: bookingData.playerCount,
                payment_method: "credit_card",
                payment_status: "authorized",
                status: "confirmed",
                notes: bookingData.notes || "",
                check_in_status: "not_arrived",
                stripe_payment_id: session.payment_intent
            });
            
            console.log("Booking created:", booking.id);
            createdBookings.push(booking);
        }

        console.log("=== VERIFY PAYMENT SUCCESS ===");
        console.log("Created", createdBookings.length, "bookings");

        return Response.json({ 
            success: true,
            bookings: createdBookings,
            paymentStatus: paymentIntent.status
        });
    } catch (error) {
        console.error("=== VERIFY PAYMENT ERROR ===");
        console.error("Error type:", error.constructor.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to verify payment' 
        }, { status: 500 });
    }
});