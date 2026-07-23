// Thin, safe wrappers around the Meta (Facebook) Pixel `fbq` global.
// The base pixel snippet lives in index.html. Every helper no-ops gracefully
// if the pixel failed to load (ad blockers) or hasn't initialized yet, so it
// can never break checkout.

function fbq(...args) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    window.fbq(...args);
  } catch (err) {
    // Never let analytics throw into the app.
    console.warn("Meta Pixel call failed:", err);
  }
}

// Fired when a customer is sent to Stripe Checkout. `value` is the total the
// customer will be charged/held (including MN sales tax), in dollars.
export function trackInitiateCheckout({ value, currency = "USD", contentType, numItems } = {}) {
  const payload = { currency };
  if (typeof value === "number" && !Number.isNaN(value)) payload.value = Number(value.toFixed(2));
  if (contentType) payload.content_type = contentType;
  if (typeof numItems === "number") payload.num_items = numItems;
  fbq("track", "InitiateCheckout", payload);
}

// Fired on the PaymentSuccess page once a checkout is confirmed.
// `eventId` MUST be stable per conversion (we use the Stripe session id) so the
// browser pixel event dedupes against any future server-side (CAPI) event and
// against page refreshes, which re-mount PaymentSuccess.
export function trackPurchase({ value, currency = "USD", contentType, eventId } = {}) {
  const payload = { currency };
  if (typeof value === "number" && !Number.isNaN(value)) payload.value = Number(value.toFixed(2));
  if (contentType) payload.content_type = contentType;
  const options = eventId ? { eventID: eventId } : undefined;
  fbq("track", "Purchase", payload, options);
}
