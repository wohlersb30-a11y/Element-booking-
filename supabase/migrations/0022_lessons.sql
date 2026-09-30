-- ---------------------------------------------------------------------------
-- Golf lessons with teaching pro Brandon Sigette.
--
-- Model:
--   * Admin defines availability as `lesson_slots` (per location, per date, with
--     a start/end time and a length in minutes). Payment for a booked slot routes
--     to that location's Stripe account, so a slot is always tied to one location.
--   * Customers buy a Single Lesson, a 3-Lesson Package, or a 7-Lesson Package
--     through Stripe (immediate charge). At checkout they schedule the FIRST
--     lesson into an open slot. Any remaining lessons in the package become a
--     "bank" (credit balance) they can spend later to book more slots.
--   * The bank is an append-only LEDGER (`lesson_credit_transactions`) exactly
--     like hour_transactions: positive delta = credit (purchase / refund),
--     negative delta = debit (booking a slot from the bank). Current balance is
--     SUM(delta) for the customer. Credits are location-scoped (payment routed to
--     that location's Stripe account), so a lesson credit is spent only at the
--     location where it was purchased.
--
-- Writes to the bank + bookings happen only through the service role (edge
-- functions) or an admin, so a customer can never grant themselves credits.
-- Customers may READ their own slots/bookings/ledger.
-- ---------------------------------------------------------------------------

-- Availability slots Brandon offers, set by the admin per location. ----------
create table if not exists public.lesson_slots (
  id               uuid primary key default gen_random_uuid(),
  location         text    not null,               -- 'vadnais_heights' | 'burnsville'
  lesson_date      date    not null,
  start_time       text    not null,               -- 'HH:MM'
  end_time         text    not null,               -- 'HH:MM'
  duration_minutes integer not null default 60,
  is_active        boolean not null default true,
  note             text,                            -- optional admin note (e.g. "juniors only")
  created_at       timestamptz not null default now()
);

create index if not exists lesson_slots_location_idx on public.lesson_slots (location);
create index if not exists lesson_slots_date_idx     on public.lesson_slots (lesson_date);

alter table public.lesson_slots enable row level security;

-- Any authenticated user may see the open schedule; only admins manage it.
drop policy if exists "lesson_slots_read" on public.lesson_slots;
create policy "lesson_slots_read" on public.lesson_slots
  for select using (auth.role() = 'authenticated');

drop policy if exists "lesson_slots_admin_write" on public.lesson_slots;
create policy "lesson_slots_admin_write" on public.lesson_slots
  for all using (public.is_admin()) with check (public.is_admin());

-- A customer's booked lesson (from checkout OR spent from their bank). --------
create table if not exists public.lesson_bookings (
  id                uuid primary key default gen_random_uuid(),
  slot_id           uuid references public.lesson_slots (id) on delete set null,
  customer_id       uuid references auth.users (id) on delete set null,
  customer_name     text,
  customer_email    text,
  customer_phone    text,
  location          text not null,
  lesson_date       date not null,
  start_time        text not null,                 -- 'HH:MM'
  end_time          text not null,                 -- 'HH:MM'
  duration_minutes  integer not null default 60,
  -- How this booking came to be:
  --   'single'  - a single lesson purchased and scheduled at checkout
  --   'package' - the first lesson of a package, scheduled at checkout
  --   'bank'    - scheduled later by spending a banked lesson credit
  booking_source    text not null default 'single'
                    check (booking_source in ('single', 'package', 'bank')),
  package_type      text,                          -- 'single' | 'three' | 'seven' (context)
  amount_paid       numeric,                        -- dollars charged for this booking (0 for bank)
  stripe_payment_id text,
  status            text not null default 'confirmed'
                    check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists lesson_bookings_customer_idx on public.lesson_bookings (customer_id);
create index if not exists lesson_bookings_email_idx    on public.lesson_bookings (customer_email);
create index if not exists lesson_bookings_slot_idx     on public.lesson_bookings (slot_id);
create index if not exists lesson_bookings_date_idx     on public.lesson_bookings (lesson_date);
create index if not exists lesson_bookings_stripe_idx   on public.lesson_bookings (stripe_payment_id);

-- One live booking per slot: a slot can be held by at most one non-cancelled
-- booking. This is the backstop against double-booking Brandon's time.
create unique index if not exists lesson_bookings_one_per_slot
  on public.lesson_bookings (slot_id)
  where slot_id is not null and status <> 'cancelled';

alter table public.lesson_bookings enable row level security;

-- Customers read their own bookings (by uid or email); admins read all.
drop policy if exists "lesson_bookings_owner_select" on public.lesson_bookings;
create policy "lesson_bookings_owner_select" on public.lesson_bookings
  for select using (
    customer_id = auth.uid()
    or customer_email = lower(auth.jwt() ->> 'email')
    or public.is_admin()
  );

-- Only admins write from the client; customer-facing writes go through edge
-- functions using the service role (which bypasses RLS).
drop policy if exists "lesson_bookings_admin_write" on public.lesson_bookings;
create policy "lesson_bookings_admin_write" on public.lesson_bookings
  for all using (public.is_admin()) with check (public.is_admin());

-- The lesson "bank": append-only credit ledger, one bucket per location. ------
create table if not exists public.lesson_credit_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_email        text not null,
  user_id           uuid references auth.users (id) on delete set null,
  location          text not null,
  -- Positive = credit (purchase/refund/adjustment), negative = debit (booking use).
  delta             integer not null,
  reason            text not null
                    check (reason in ('purchase', 'booking', 'refund', 'adjustment')),
  package_type      text,                          -- 'single' | 'three' | 'seven'
  amount_paid       numeric,                        -- pre-tax dollars paid for a purchase
  lesson_booking_id uuid references public.lesson_bookings (id) on delete set null,
  stripe_payment_id text,
  created_by        text,                           -- 'system' | admin email
  note              text,
  created_at        timestamptz not null default now()
);

-- Normalize emails lower-case, consistent with auth.users / hour_transactions.
create or replace function public.lesson_credit_lower_email()
returns trigger language plpgsql as $$
begin
  new.user_email := lower(trim(new.user_email));
  return new;
end;
$$;

drop trigger if exists lesson_credit_lower_email on public.lesson_credit_transactions;
create trigger lesson_credit_lower_email
  before insert or update on public.lesson_credit_transactions
  for each row execute function public.lesson_credit_lower_email();

create index if not exists lesson_credit_email_idx   on public.lesson_credit_transactions (user_email);
create index if not exists lesson_credit_stripe_idx  on public.lesson_credit_transactions (stripe_payment_id);
create index if not exists lesson_credit_booking_idx on public.lesson_credit_transactions (lesson_booking_id);

-- Idempotency guard: a completed purchase must credit exactly once even if the
-- success page and the webhook both fire. One Stripe payment -> one purchase row.
create unique index if not exists lesson_credit_stripe_reason_uniq
  on public.lesson_credit_transactions (stripe_payment_id, reason)
  where stripe_payment_id is not null;

alter table public.lesson_credit_transactions enable row level security;

-- Owner may read their own ledger (balance summed client-side); admins see all.
drop policy if exists "lesson_credit_owner_select" on public.lesson_credit_transactions;
create policy "lesson_credit_owner_select" on public.lesson_credit_transactions
  for select using (user_email = lower(auth.jwt() ->> 'email') or public.is_admin());

-- Only admins write from the client; all customer credits/debits go through
-- edge functions using the service role. No insert/update policy for users.
drop policy if exists "lesson_credit_admin_write" on public.lesson_credit_transactions;
create policy "lesson_credit_admin_write" on public.lesson_credit_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- Convenience: current lesson-credit balance for the calling user, per location.
-- Security-definer so it reads across the RLS boundary for just the caller.
create or replace function public.my_lesson_balance()
returns table (location text, credits integer)
language sql
stable
security definer set search_path = public
as $$
  select t.location, coalesce(sum(t.delta), 0)::integer as credits
  from public.lesson_credit_transactions t
  where t.user_email = lower(auth.jwt() ->> 'email')
  group by t.location;
$$;

grant execute on function public.my_lesson_balance() to authenticated;

-- Open (bookable) lesson slots for a location: active, today-or-later, and not
-- already held by a non-cancelled booking. Security-definer so customers get
-- accurate availability WITHOUT being able to read other customers' bookings
-- (lesson_bookings RLS only exposes their own rows). Returns no PII — just the
-- slot rows the customer may book.
create or replace function public.open_lesson_slots(p_location text)
returns setof public.lesson_slots
language sql
stable
security definer set search_path = public
as $$
  select s.*
  from public.lesson_slots s
  where s.is_active
    and (p_location is null or s.location = p_location)
    and s.lesson_date >= (now() at time zone 'America/Chicago')::date
    and not exists (
      select 1 from public.lesson_bookings b
      where b.slot_id = s.id and b.status <> 'cancelled'
    )
  order by s.lesson_date, s.start_time;
$$;

grant execute on function public.open_lesson_slots(text) to authenticated;
