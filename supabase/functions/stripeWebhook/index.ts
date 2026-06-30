import { serviceClient } from '../_shared/clients.ts';
import { allStripeAccounts } from '../_shared/stripe.ts';
import { finalizeBookingFromSession } from '../_shared/finalizeBooking.ts';

// Server-side safety net: if a customer pays but never lands on the success page
// (closed tab, lost signal), Stripe still calls this webhook and we create the
// booking anyway. Shares the same idempotent insert as verifyStripePayment, so
// whichever fires first wins and the other is a no-op.
//
// Deploy WITHOUT JWT verification (Stripe has no Supabase token); auth is the
// Stripe signature check below. There are two Stripe accounts, each with its own
// signing secret, so we try each until one verifies.

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400 });

  const body = await req.text();

  const secrets: Record<string, string | undefined> = {
    vadnais_heights: Deno.env.get('STRIPE_WEBHOOK_SECRET_VADNAIS') ??
      Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    burnsville: Deno.env.get('STRIPE_WEBHOOK_SECRET_BURNSVILLE')
  };

  let event: any = null;
  let client: any = null;
  for (const acct of allStripeAccounts()) {
    const secret = secrets[acct.account];
    if (!secret) continue;
    try {
      event = await acct.client.webhooks.constructEventAsync(body, sig, secret);
      client = acct.client;
      break;
    } catch (_err) {
      // signature didn't match this account; try the next
    }
  }

  if (!event) {
    console.error('stripeWebhook: signature verification failed for all accounts');
    return new Response('Signature verification failed', { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const db = serviceClient();
      const result = await finalizeBookingFromSession(client, session, {
        db,
        fallbackUserId: session.metadata?.customerId
      });
      if (!result.success && !('conflict' in result)) {
        console.error('stripeWebhook finalize error:', result.error);
      }
    }
  } catch (err) {
    console.error('stripeWebhook handler error:', (err as any).message);
    // 500 tells Stripe to retry later (transient DB/Stripe hiccups).
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'content-type': 'application/json' }
  });
});
