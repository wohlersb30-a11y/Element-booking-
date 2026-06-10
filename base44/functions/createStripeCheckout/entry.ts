import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import Stripe from 'npm:stripe@14.11.0';

Deno.serve(async (req) => {
    console.log("=== Function invoked ===");
    
    try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        
        if (!stripeKey) {
            console.error("ERROR: STRIPE_SECRET_KEY not found in environment");
            return Response.json({ 
                error: 'Stripe secret key not configured',
                message: 'Please set STRIPE_SECRET_KEY in dashboard settings'
            }, { status: 500 });
        }
        
        console.log("Stripe key found, length:", stripeKey.length);
        const stripe = new Stripe(stripeKey);
        console.log("Stripe client initialized");
        
        const base44 = createClientFromRequest(req);
        console.log("Base44 client created");
        
        const user = await base44.auth.me();
        console.log("User check:", user ? user.email : "no user");
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        console.log("Body parsed, keys:", Object.keys(body));
        
        const { amount, customerEmail, customerName, bookingData, successUrl, cancelUrl } = body;
        
        console.log("Amount:", amount);
        console.log("Email:", customerEmail);
        console.log("Name:", customerName);
        console.log("Bays:", bookingData?.selectedBays?.length);

        const sessionParams = {
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Golf Simulator Booking - Authorization Hold',
                        description: `${bookingData.selectedBays.length} Bay(s) - ${bookingData.date} at ${bookingData.time}`,
                    },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            payment_intent_data: {
                capture_method: 'manual',
                description: `Booking hold for ${customerName}`,
                metadata: {
                    customer_name: customerName,
                    booking_date: bookingData.date,
                    booking_time: bookingData.time,
                }
            },
            customer_email: customerEmail,
            metadata: {
                bookingData: JSON.stringify(bookingData),
                customerName: customerName
            },
            success_url: successUrl,
            cancel_url: cancelUrl,
        };

        console.log("Creating Stripe session...");
        const session = await stripe.checkout.sessions.create(sessionParams);
        
        console.log("SUCCESS! Session ID:", session.id);
        console.log("Checkout URL:", session.url);

        return Response.json({
            sessionId: session.id,
            url: session.url
        });
        
    } catch (error) {
        console.error("=== ERROR CAUGHT ===");
        console.error("Type:", error.constructor.name);
        console.error("Message:", error.message);
        console.error("Stack:", error.stack);
        
        if (error.type) {
            console.error("Stripe Error Type:", error.type);
        }
        if (error.raw) {
            console.error("Stripe Raw:", JSON.stringify(error.raw));
        }
        
        return Response.json({ 
            error: error.message || 'Unknown error',
            type: error.type || 'unknown',
            details: error.stack
        }, { status: 500 });
    }
});