-- Per-account Stripe Customer IDs.
-- A Stripe Customer created in the Vadnais Heights account does NOT exist in the
-- Burnsville account (they are fully separate Stripe accounts). Storing a single
-- stripe_customer_id breaks the moment a customer books at the other location.
-- This map keys the customer id by account: {"vadnais_heights": "cus_..", "burnsville": "cus_.."}

alter table public.profiles
  add column if not exists stripe_customer_map jsonb not null default '{}'::jsonb;

-- Backfill: treat any existing single customer id as the Vadnais Heights account.
update public.profiles
set stripe_customer_map = jsonb_build_object('vadnais_heights', stripe_customer_id)
where stripe_customer_id is not null
  and (stripe_customer_map = '{}'::jsonb or stripe_customer_map is null);
