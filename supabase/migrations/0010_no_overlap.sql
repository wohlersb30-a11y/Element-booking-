-- Make overlapping bookings for the same bay physically impossible at the
-- database level. The application-level check in verifyStripePayment has a
-- read-then-write race window; this constraint is the authoritative backstop:
-- two concurrent inserts for the same bay/time can never both succeed.

create extension if not exists btree_gist;

-- Start/end are stored as 'HH:MM' text. Derive an integer-minute range so we can
-- use a gist '&&' (overlap) exclusion. NULL when times are malformed or
-- non-positive duration, so such rows are simply not enforced (never block).
alter table public.bookings
  add column if not exists time_range int4range
  generated always as (
    case
      when start_time ~ '^[0-9]{1,2}:[0-9]{2}$'
       and end_time   ~ '^[0-9]{1,2}:[0-9]{2}$'
       and (split_part(end_time,   ':', 1)::int * 60 + split_part(end_time,   ':', 2)::int)
         > (split_part(start_time, ':', 1)::int * 60 + split_part(start_time, ':', 2)::int)
      then int4range(
        split_part(start_time, ':', 1)::int * 60 + split_part(start_time, ':', 2)::int,
        split_part(end_time,   ':', 1)::int * 60 + split_part(end_time,   ':', 2)::int
      )
      else null
    end
  ) stored;

-- Same bay + same date + overlapping time range => rejected, unless cancelled.
-- NULL simulator_id or time_range rows are not enforced (gist skips nulls).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_no_overlap'
  ) then
    alter table public.bookings
      add constraint bookings_no_overlap
      exclude using gist (
        simulator_id with =,
        booking_date with =,
        time_range   with &&
      )
      where (status <> 'cancelled');
  end if;
end $$;
