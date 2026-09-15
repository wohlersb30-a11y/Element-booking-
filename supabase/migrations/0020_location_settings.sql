-- Per-location miscellaneous settings that admins can configure without a code
-- change. First use: the "League Sign Up" destination URL surfaced as a button
-- on the customer location-selection page. One row per location; absence of a
-- row (or an empty url) means no League Sign Up button is shown for it.

create table if not exists public.location_settings (
  location text primary key,
  league_signup_url text,
  updated_at timestamptz not null default now()
);

alter table public.location_settings enable row level security;

-- Public read: the customer booking page (anon/auth) needs the URL to render the
-- League Sign Up button.
drop policy if exists location_settings_read on public.location_settings;
create policy location_settings_read
  on public.location_settings for select
  using (true);

-- Only admins may change the settings.
drop policy if exists location_settings_admin_write on public.location_settings;
create policy location_settings_admin_write
  on public.location_settings for all
  using (public.is_admin())
  with check (public.is_admin());
