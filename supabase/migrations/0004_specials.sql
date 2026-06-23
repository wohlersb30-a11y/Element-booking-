-- Specials / promotions. An admin defines a special (location, timeframe,
-- price, what's included); customers claim it and the claim creates a normal
-- booking on the first open simulator at the chosen time.

create table if not exists public.specials (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  includes       text,                       -- what's included (free text)
  location       text not null,              -- 'vadnais_heights' | 'burnsville' | 'both'
  price          numeric not null default 0, -- flat price for the special
  duration_hours numeric not null default 1, -- how long the reservation runs
  days_of_week   jsonb,                       -- e.g. [1,2,3] (0=Sun..6=Sat); null = any day
  window_start   text default '09:00',        -- earliest start time (HH:MM)
  window_end     text default '22:00',        -- latest start time (HH:MM)
  valid_from     date,                        -- promo active from (null = always)
  valid_to       date,                        -- promo active through (null = always)
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists specials_location_idx on public.specials (location);
create index if not exists specials_active_idx   on public.specials (is_active);

alter table public.specials enable row level security;

-- Readable by any authenticated user; only admins create/edit/delete.
drop policy if exists "specials_read" on public.specials;
create policy "specials_read" on public.specials
  for select using (auth.role() = 'authenticated');

drop policy if exists "specials_admin_write" on public.specials;
create policy "specials_admin_write" on public.specials
  for all using (public.is_admin()) with check (public.is_admin());

-- Tie a booking back to the special it was claimed from (optional, for reporting).
alter table public.bookings
  add column if not exists special_id uuid references public.specials (id) on delete set null;
