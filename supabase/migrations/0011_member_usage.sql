-- Member portal: track allotment usage, prime (uncovered/paid) bookings, and
-- guest-pass consumption on member_bookings. All additive/backfill-safe.

alter table public.member_bookings
  add column if not exists included        boolean not null default true,   -- drew from monthly/weekly hours
  add column if not exists is_prime        boolean not null default false,  -- booked outside covered window / over allotment
  add column if not exists guest_pass_used boolean not null default false,  -- consumed one guest pass
  add column if not exists payment_status  text    not null default 'included', -- included | pay_at_desk | paid
  add column if not exists stripe_payment_id text;

-- Existing rows: treat prior "exclusive hours" bookings as included, others too
-- (they predate the allotment model). Nothing to charge retroactively.
update public.member_bookings
   set included = true
 where included is null;

create index if not exists member_bookings_included_idx
  on public.member_bookings (member_email, booking_date)
  where included;

create index if not exists member_bookings_guestpass_idx
  on public.member_bookings (member_email, booking_date)
  where guest_pass_used;
