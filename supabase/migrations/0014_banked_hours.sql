-- ---------------------------------------------------------------------------
-- Banked hours ("packages"): customers pre-purchase simulator hours in bulk and
-- draw them down when they book. Hours are split into two buckets:
--   off_peak  - usable only for off-peak slots (weekdays + Fri before noon)
--   peak      - usable for ANY slot (peak or off-peak)
-- Hours never expire. Everything is stored as an append-only LEDGER so the
-- balance is always auditable (purchases/imports credit, bookings debit,
-- refunds/adjustments as needed). The current balance for a customer+bucket is
-- simply the SUM(hours) of their rows in that bucket.
--
-- Writes only ever happen through the service role (edge functions) or an admin,
-- so a customer can never grant themselves hours. Customers may READ their own.
-- ---------------------------------------------------------------------------
create table if not exists public.hour_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_email        text not null,
  user_id           uuid references auth.users (id) on delete set null,
  -- Which bucket this row credits/debits.
  kind              text not null check (kind in ('peak', 'off_peak')),
  -- Positive = credit (purchase/import/refund), negative = debit (booking use).
  hours             numeric not null,
  reason            text not null check (reason in ('purchase', 'import', 'booking', 'refund', 'adjustment')),
  -- Purchase context (null for non-purchase rows).
  package_size      integer,          -- 10 or 20
  amount_paid       numeric,          -- pre-tax dollars paid for a purchase
  location          text,
  -- Links for traceability.
  booking_id        uuid references public.bookings (id) on delete set null,
  stripe_payment_id text,
  note              text,             -- e.g. admin adjustment reason / import batch
  created_by        text,            -- 'system' | 'import' | admin email
  created_at        timestamptz not null default now()
);

-- Emails are always stored/compared lower-case so lookups are consistent with
-- auth.users and the legacy_customers table.
create or replace function public.hour_transactions_lower_email()
returns trigger language plpgsql as $$
begin
  new.user_email := lower(trim(new.user_email));
  return new;
end;
$$;

drop trigger if exists hour_transactions_lower_email on public.hour_transactions;
create trigger hour_transactions_lower_email
  before insert or update on public.hour_transactions
  for each row execute function public.hour_transactions_lower_email();

create index if not exists hour_transactions_email_idx on public.hour_transactions (user_email);
create index if not exists hour_transactions_stripe_idx on public.hour_transactions (stripe_payment_id);
create index if not exists hour_transactions_booking_idx on public.hour_transactions (booking_id);

-- Idempotency guard: a completed purchase / VIP-surcharge payment must credit or
-- link exactly once even if the success page and webhook both fire. One Stripe
-- payment intent maps to at most one ledger row per reason.
create unique index if not exists hour_transactions_stripe_reason_uniq
  on public.hour_transactions (stripe_payment_id, reason)
  where stripe_payment_id is not null;

alter table public.hour_transactions enable row level security;

-- Owner may read their own ledger (balance is summed client-side); admins see all.
drop policy if exists "hour_tx_owner_select" on public.hour_transactions;
create policy "hour_tx_owner_select" on public.hour_transactions
  for select using (user_email = lower(auth.jwt() ->> 'email') or public.is_admin());

-- Only admins can write from the client. All customer-facing credits/debits go
-- through edge functions using the service role, which bypasses RLS. There is
-- deliberately NO insert/update policy for regular authenticated users.
drop policy if exists "hour_tx_admin_write" on public.hour_transactions;
create policy "hour_tx_admin_write" on public.hour_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- Convenience: current balance for the calling user, grouped by location+bucket.
-- Hours are location-scoped (each location has its own Stripe account), so a
-- customer spends hours only at the location where they bought them.
-- Security-definer so it can read across the RLS boundary for just the caller.
create or replace function public.my_hour_balance()
returns table (location text, kind text, hours numeric)
language sql
stable
security definer set search_path = public
as $$
  select t.location, t.kind, coalesce(sum(t.hours), 0) as hours
  from public.hour_transactions t
  where t.user_email = lower(auth.jwt() ->> 'email')
  group by t.location, t.kind;
$$;

grant execute on function public.my_hour_balance() to authenticated;
