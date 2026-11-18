-- Lesson pro's master calendar.
--
-- Brandon (the restricted `lesson_pro` role) needs to see the lessons customers
-- have booked with him. `lesson_bookings` RLS (`lesson_bookings_owner_select`)
-- only exposes a row to that row's own customer or to a full admin, so a
-- lesson_pro reading the table directly sees nothing. This SECURITY DEFINER
-- function bypasses that owner-only RLS but is itself gated to the pro/admin
-- roles, so no one else can use it to read other customers' bookings.
--
-- It returns only what the instructor needs to run his day: when the lesson is,
-- who it's with (name + phone, since he's the one teaching and may need to
-- reach them), where, how it was booked, and its status.
create or replace function public.lesson_pro_calendar(
  p_from     date,
  p_to       date,
  p_location text default null
)
returns table (
  id             uuid,
  lesson_date    date,
  start_time     text,
  end_time       text,
  customer_name  text,
  customer_email text,
  customer_phone text,
  location       text,
  booking_source text,
  status         text
)
language sql
stable
security definer set search_path = public
as $$
  select b.id, b.lesson_date, b.start_time, b.end_time,
         b.customer_name, b.customer_email, b.customer_phone,
         b.location, b.booking_source, b.status
  from public.lesson_bookings b
  where b.lesson_date between p_from and p_to
    and b.status <> 'cancelled'
    and (p_location is null or b.location = p_location)
    -- Gate: only the teaching pro or a full admin may read this.
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'lesson_pro')
    )
  order by b.lesson_date, b.start_time;
$$;

grant execute on function public.lesson_pro_calendar(date, date, text) to authenticated;
