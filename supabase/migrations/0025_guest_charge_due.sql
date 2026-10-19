-- Guest-pass overage: let a member bring a guest even with 0 passes left, but
-- flag the reservation so front-desk staff collect a guest fee on-site. When
-- this is true NO guest pass was consumed (there were none) — the fee is owed
-- instead. Additive/backfill-safe.
alter table public.member_bookings
  add column if not exists guest_charge_due boolean not null default false;
