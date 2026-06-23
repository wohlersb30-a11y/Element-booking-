-- Store each customer's Stripe Customer id so their saved card is reused on
-- future bookings (card data lives in Stripe, never in our database).
alter table public.profiles
  add column if not exists stripe_customer_id text;
