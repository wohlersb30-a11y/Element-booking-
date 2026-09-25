-- Per-hour specials. A special can now price either as a flat amount (existing
-- behavior, pricing_mode='flat' using `price` + fixed `duration_hours`) or per
-- hour (pricing_mode='hourly' using `price_per_hour`), in which case the
-- customer chooses how many hours (bounded by min_hours..max_hours, default 1-4)
-- and the total is price_per_hour * chosen hours.
--
-- Existing rows default to 'flat', so nothing changes for current specials.

alter table public.specials
  add column if not exists pricing_mode   text    not null default 'flat',
  add column if not exists price_per_hour numeric,
  add column if not exists min_hours      numeric not null default 1,
  add column if not exists max_hours      numeric not null default 4;

-- Guard the enum-like column to the two supported modes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'specials_pricing_mode_chk'
  ) then
    alter table public.specials
      add constraint specials_pricing_mode_chk
      check (pricing_mode in ('flat', 'hourly'));
  end if;
end $$;
