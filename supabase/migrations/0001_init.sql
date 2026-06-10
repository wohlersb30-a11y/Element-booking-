-- Fairway Bookings — initial schema (migration off Base44 to Supabase/Postgres)
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (mirrors auth.users; holds role + contact info)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Simulators (bays)
-- ---------------------------------------------------------------------------
create table if not exists public.simulators (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  location         text not null,
  bay_type         text default 'standard',
  is_active        boolean not null default true,
  pricing_peak     numeric,
  pricing_off_peak numeric,
  description      text,
  created_at       timestamptz not null default now()
);

-- Date-range pricing overrides (was simulator.pricing_rules array in Base44).
create table if not exists public.pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  simulator_id  uuid references public.simulators (id) on delete cascade,
  name          text,
  start_date    date,
  end_date      date,
  peak_rate     numeric,
  off_peak_rate numeric,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  simulator_id      uuid references public.simulators (id) on delete set null,
  simulator_name    text,
  location          text,
  customer_id       uuid references auth.users (id) on delete set null,
  customer_name     text,
  customer_email    text,
  customer_phone    text,
  booking_date      date not null,
  start_time        text not null,            -- 'HH:MM' (matches existing app logic)
  end_time          text not null,            -- 'HH:MM'
  duration_hours    numeric not null default 1,
  total_cost        numeric not null default 0,
  number_of_players integer not null default 1,
  payment_method    text,                     -- credit_card | pay_at_venue | card_on_file | other
  payment_status    text default 'pending',   -- pending | authorized | paid | refunded
  status            text not null default 'confirmed', -- confirmed | cancelled | no_show
  check_in_status   text default 'not_arrived',        -- not_arrived | checked_in | no_show
  checked_in_at     timestamptz,
  card_last_four    text,
  add_ons           jsonb,
  notes             text,
  stripe_payment_id text,
  created_at        timestamptz not null default now()
);

create index if not exists bookings_date_idx       on public.bookings (booking_date);
create index if not exists bookings_simulator_idx  on public.bookings (simulator_id);
create index if not exists bookings_customer_idx   on public.bookings (customer_id);
create index if not exists bookings_email_idx      on public.bookings (customer_email);
create unique index if not exists bookings_stripe_idx
  on public.bookings (stripe_payment_id, simulator_id)
  where stripe_payment_id is not null;

-- ---------------------------------------------------------------------------
-- Waitlist
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist (
  id                uuid primary key default gen_random_uuid(),
  customer_name     text,
  customer_email    text,
  customer_phone    text,
  location          text,
  preferred_date    date,
  preferred_time    text,
  duration_hours    numeric default 1,
  number_of_players integer default 1,
  status            text not null default 'active', -- active | notified | fulfilled | expired
  notified_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Schedule blocks (admin-blocked time)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_blocks (
  id            uuid primary key default gen_random_uuid(),
  simulator_id  uuid references public.simulators (id) on delete cascade,
  location      text,
  block_date    date not null,
  start_time    text,
  end_time      text,
  reason        text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.simulators     enable row level security;
alter table public.pricing_rules  enable row level security;
alter table public.bookings       enable row level security;
alter table public.waitlist       enable row level security;
alter table public.schedule_blocks enable row level security;

-- Profiles: a user sees/edits their own row; admins see all.
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());

-- Simulators: readable by any authenticated user; only admins modify.
create policy "simulators_read" on public.simulators
  for select using (auth.role() = 'authenticated');
create policy "simulators_admin_write" on public.simulators
  for all using (public.is_admin()) with check (public.is_admin());

-- Pricing rules: same as simulators.
create policy "pricing_read" on public.pricing_rules
  for select using (auth.role() = 'authenticated');
create policy "pricing_admin_write" on public.pricing_rules
  for all using (public.is_admin()) with check (public.is_admin());

-- Bookings: customers see/insert their own; admins see/modify all.
-- (The Stripe edge functions use the service-role key and bypass RLS.)
create policy "bookings_owner_select" on public.bookings
  for select using (customer_id = auth.uid() or public.is_admin());
create policy "bookings_owner_insert" on public.bookings
  for insert with check (customer_id = auth.uid() or public.is_admin());
create policy "bookings_admin_update" on public.bookings
  for update using (public.is_admin());

-- Waitlist: any authenticated user may join; admins read/manage.
create policy "waitlist_insert" on public.waitlist
  for insert with check (auth.role() = 'authenticated');
create policy "waitlist_admin_read" on public.waitlist
  for select using (public.is_admin());
create policy "waitlist_admin_write" on public.waitlist
  for all using (public.is_admin()) with check (public.is_admin());

-- Schedule blocks: readable by authenticated users; admins modify.
create policy "blocks_read" on public.schedule_blocks
  for select using (auth.role() = 'authenticated');
create policy "blocks_admin_write" on public.schedule_blocks
  for all using (public.is_admin()) with check (public.is_admin());
