-- Test bays for local/staging testing. Adjust names + pricing to your real
-- setup, or replace via the admin dashboard / Base44 data migration later.
-- Safe to run once; re-running will create duplicates.

-- NOTE: `location` must be the location *id* used by the app
-- (LocationSelector), not the display name: 'vadnais_heights' / 'burnsville'.
insert into public.simulators (name, location, bay_type, is_active, pricing_peak, pricing_off_peak, description) values
  ('Bay 1',     'vadnais_heights', 'standard', true, 50, 40, 'Standard simulator bay'),
  ('Bay 2',     'vadnais_heights', 'standard', true, 50, 40, 'Standard simulator bay'),
  ('VIP Suite', 'vadnais_heights', 'vip',      true, 75, 60, 'Private VIP room'),
  ('Bay 1',     'burnsville',      'standard', true, 50, 40, 'Standard simulator bay'),
  ('Bay 2',     'burnsville',      'standard', true, 50, 40, 'Standard simulator bay'),
  ('VIP Suite', 'burnsville',      'vip',      true, 75, 60, 'Private VIP room');
