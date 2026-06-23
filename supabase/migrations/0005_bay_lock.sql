-- Adds a per-booking "lock" flag. When true, the customer chose "I prefer this
-- bay" at checkout (or an admin pinned it), so the smart schedule optimizer must
-- NOT move the reservation to a different bay. When false/null the booking is
-- movable, letting admins consolidate the schedule to open up more availability.
alter table public.bookings
  add column if not exists bay_locked boolean not null default false;
