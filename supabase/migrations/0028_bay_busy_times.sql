-- Fix "charged then booted": customers were being sent to Stripe for bays that
-- were ALREADY booked by someone else, then finalizeBooking (service role)
-- rejected the overlap and released the hold — after the card was charged.
--
-- Root cause: the customer-facing availability check reads the bookings tables
-- directly, but RLS on both `bookings` (bookings_owner_select) and
-- `member_bookings` (member_bookings_owner_select) only lets a signed-in
-- customer see THEIR OWN reservations. Another customer's booking is invisible,
-- so a taken bay shows as free. The booking succeeds for non-contended slots and
-- fails (charge-then-boot) exactly when the conflict belongs to someone else.
--
-- This function exposes ONLY the busy time ranges needed to compute availability
-- (bay id, date, start/end, status) — never names, emails, phones or cost. It is
-- SECURITY DEFINER so it sees every non-cancelled reservation across both tables,
-- giving the customer UI the same view the server has when it finalizes. The
-- client calls this instead of selecting from the bookings tables directly.

create or replace function public.bay_busy_times(
  p_from date,
  p_to date,
  p_location text default null
)
returns table (
  simulator_id uuid,
  booking_date date,
  start_time text,
  end_time text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Regular (paid / banked) bookings.
  select b.simulator_id, b.booking_date, b.start_time, b.end_time, b.status
  from public.bookings b
  where b.booking_date between p_from and p_to
    and b.status <> 'cancelled'
    and b.simulator_id is not null
    and (p_location is null or b.location = p_location)
  union all
  -- Member bookings live in a separate table and also hold a bay.
  select m.simulator_id, m.booking_date, m.start_time, m.end_time, m.status
  from public.member_bookings m
  where m.booking_date between p_from and p_to
    and m.status <> 'cancelled'
    and m.simulator_id is not null
    and (p_location is null or m.location = p_location);
$$;

-- Customers book while signed in (authenticated); anon kept for safety/parity.
grant execute on function public.bay_busy_times(date, date, text) to authenticated, anon;
