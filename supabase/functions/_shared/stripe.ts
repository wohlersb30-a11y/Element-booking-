import Stripe from 'npm:stripe@14.11.0';

// Each location runs on its own Stripe account + bank, so payments MUST use the
// matching secret. Vadnais Heights uses the primary key (STRIPE_SECRET_KEY, or
// STRIPE_SECRET_KEY_VADNAIS if set); Burnsville uses STRIPE_SECRET_KEY_BURNSVILLE.

export type StripeAccountKey = 'vadnais_heights' | 'burnsville';

// Normalize any incoming location string to a known account key. Defaults to
// Vadnais Heights for unknown/blank values so legacy data never breaks.
export function stripeAccountKey(location?: string): StripeAccountKey {
  return location === 'burnsville' ? 'burnsville' : 'vadnais_heights';
}

function secretForAccount(account: StripeAccountKey): string {
  if (account === 'burnsville') {
    const key = Deno.env.get('STRIPE_SECRET_KEY_BURNSVILLE') ?? '';
    if (!key) {
      // Fail loudly rather than silently routing Burnsville money to the
      // Vadnais Heights bank account.
      throw new Error(
        'Burnsville Stripe key not configured (STRIPE_SECRET_KEY_BURNSVILLE). ' +
        'Payment cannot be processed for this location yet.'
      );
    }
    return key;
  }
  const key =
    Deno.env.get('STRIPE_SECRET_KEY_VADNAIS') ??
    Deno.env.get('STRIPE_SECRET_KEY') ??
    '';
  if (!key) throw new Error('Vadnais Heights Stripe key not configured.');
  return key;
}

// Returns a Stripe client bound to the correct account for a booking location.
export function stripeForLocation(location?: string): Stripe {
  return new Stripe(secretForAccount(stripeAccountKey(location)));
}

// All configured accounts, used when we hold a sessionId/paymentIntent but do
// not yet know which account it belongs to (e.g. the success-page verify step).
// We try each until one recognizes the object.
export function allStripeAccounts(): { account: StripeAccountKey; client: Stripe }[] {
  const out: { account: StripeAccountKey; client: Stripe }[] = [];
  const vadnais =
    Deno.env.get('STRIPE_SECRET_KEY_VADNAIS') ?? Deno.env.get('STRIPE_SECRET_KEY');
  if (vadnais) out.push({ account: 'vadnais_heights', client: new Stripe(vadnais) });
  const burnsville = Deno.env.get('STRIPE_SECRET_KEY_BURNSVILLE');
  if (burnsville) out.push({ account: 'burnsville', client: new Stripe(burnsville) });
  return out;
}

// Retrieve a Checkout Session without knowing its account up front. Prefer the
// account implied by `locationHint`; fall back to trying every account.
export async function retrieveSessionAnyAccount(
  sessionId: string,
  locationHint?: string
): Promise<{ session: Stripe.Checkout.Session; client: Stripe; account: StripeAccountKey }> {
  const accounts = allStripeAccounts();
  if (accounts.length === 0) throw new Error('No Stripe accounts configured.');

  // Try the hinted account first to avoid an unnecessary cross-account call.
  const hinted = stripeAccountKey(locationHint);
  accounts.sort((a, b) => (a.account === hinted ? -1 : b.account === hinted ? 1 : 0));

  let lastErr: unknown = null;
  for (const { client, account } of accounts) {
    try {
      const session = await client.checkout.sessions.retrieve(sessionId);
      return { session, client, account };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Checkout session not found in any Stripe account.');
}
