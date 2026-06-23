-- Memberships feature (MemberSignup / MemberBookings pages).

create table if not exists public.memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete set null,
  user_email       text,
  user_name        text,
  membership_level text,
  location         text,
  status           text not null default 'active', -- active | expired | cancelled
  start_date       date,
  end_date         date,
  payment_status   text default 'paid',
  created_at       timestamptz not null default now()
);

create table if not exists public.member_bookings (
  id                 uuid primary key default gen_random_uuid(),
  membership_id      uuid references public.memberships (id) on delete cascade,
  member_email       text,
  member_name        text,
  simulator_id       uuid references public.simulators (id) on delete set null,
  simulator_name     text,
  location           text,
  booking_date       date not null,
  start_time         text not null,
  end_time           text not null,
  duration_hours     numeric default 1,
  total_cost         numeric default 0,
  status             text not null default 'confirmed',
  check_in_status    text default 'not_arrived',
  is_exclusive_hours boolean default false,
  created_at         timestamptz not null default now()
);

create index if not exists member_bookings_date_idx  on public.member_bookings (booking_date);
create index if not exists member_bookings_email_idx on public.member_bookings (member_email);
create index if not exists memberships_email_idx     on public.memberships (user_email);

alter table public.memberships     enable row level security;
alter table public.member_bookings enable row level security;

-- Owner = matching email on the JWT; admins see all.
drop policy if exists "memberships_owner_select" on public.memberships;
create policy "memberships_owner_select" on public.memberships
  for select using (user_email = (auth.jwt() ->> 'email') or public.is_admin());

drop policy if exists "memberships_insert" on public.memberships;
create policy "memberships_insert" on public.memberships
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "memberships_admin_write" on public.memberships;
create policy "memberships_admin_write" on public.memberships
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "member_bookings_owner_select" on public.member_bookings;
create policy "member_bookings_owner_select" on public.member_bookings
  for select using (member_email = (auth.jwt() ->> 'email') or public.is_admin());

drop policy if exists "member_bookings_insert" on public.member_bookings;
create policy "member_bookings_insert" on public.member_bookings
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "member_bookings_admin_write" on public.member_bookings;
create policy "member_bookings_admin_write" on public.member_bookings
  for all using (public.is_admin()) with check (public.is_admin());
