-- Per-location tee-sheet operating hours. Lets an admin open the tee sheet
-- earlier than 9 AM or close later than 11 PM without a code change. One row per
-- location; absence of a row means the app-wide defaults (09:00–23:00, Sundays
-- 09:00–21:00) apply. Times are "HH:MM"; a close of "24:00" means midnight.

create table if not exists public.location_hours (
  location text primary key,
  open_time text not null default '09:00',
  close_time text not null default '23:00',
  sunday_close_time text not null default '21:00',
  updated_at timestamptz not null default now()
);

alter table public.location_hours enable row level security;

-- Public read: the customer tee sheet (anon/auth) needs the hours to build its
-- bookable time slots.
drop policy if exists location_hours_read on public.location_hours;
create policy location_hours_read
  on public.location_hours for select
  using (true);

-- Only admins may change the hours.
drop policy if exists location_hours_admin_write on public.location_hours;
create policy location_hours_admin_write
  on public.location_hours for all
  using (public.is_admin())
  with check (public.is_admin());
