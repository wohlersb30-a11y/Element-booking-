-- Explicit reservation category for a booking, chosen by staff on manual
-- bookings so the admin schedule can color it correctly (public / member /
-- special / banked hours). Online bookings leave it null and are inferred from
-- special_id / payment_method by the client classifier.
alter table public.bookings
  add column if not exists reservation_type text;
