-- ---------------------------------------------------------------------------
-- Lessons v2: recurring weekly availability windows + bay assignment.
--
-- What changes vs. 0022:
--   * Brandon's availability is now modeled as recurring WEEKLY WINDOWS
--     (`lesson_availability`): e.g. Mondays 09:00-16:00, Wednesdays 13:00-17:00.
--     The customer books a fixed 60-minute lesson that may start every 30
--     minutes inside a window. Once a lesson is booked, every overlapping start
--     time is removed from availability (Brandon can only teach one at a time).
--   * A booked lesson is NOT automatically tied to a bay. The admin assigns a
--     simulator afterward; assigning one writes a `schedule_blocks` row so the
--     public booking page blocks that bay/time. We remember that block on the
--     lesson (`block_id`) so reassigning/removing stays in sync.
--
-- The old `lesson_slots` table + `open_lesson_slots` RPC from 0022 are left in
-- place (harmless, unused). New bookings carry their own date/time and no
-- slot_id, so the 0022 one-per-slot index simply never applies to them.
-- ---------------------------------------------------------------------------

-- Recurring weekly availability. One row per weekday window per location. -----
create table if not exists public.lesson_availability (
  id          uuid primary key default gen_random_uuid(),
  location    text    not null,                 -- 'vadnais_heights' | 'burnsville'
  weekday     integer not null                  -- 0=Sunday … 6=Saturday (matches JS getDay / SQL dow)
              check (weekday between 0 and 6),
  start_time  text    not null,                 -- 'HH:MM' window opens
  end_time    text    not null,                 -- 'HH:MM' window closes (last lesson must END by this)
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists lesson_availability_loc_idx on public.lesson_availability (location, weekday);

alter table public.lesson_availability enable row level security;

drop policy if exists "lesson_availability_read" on public.lesson_availability;
create policy "lesson_availability_read" on public.lesson_availability
  for select using (auth.role() = 'authenticated');

drop policy if exists "lesson_availability_admin_write" on public.lesson_availability;
create policy "lesson_availability_admin_write" on public.lesson_availability
  for all using (public.is_admin()) with check (public.is_admin());

-- Bay assignment on a booked lesson + a tsrange used to prevent double-booking.
alter table public.lesson_bookings
  add column if not exists simulator_id uuid references public.simulators (id) on delete set null;
alter table public.lesson_bookings
  add column if not exists block_id uuid references public.schedule_blocks (id) on delete set null;

-- Half-open [start, end) time range for this lesson, derived from the stored
-- date + 'HH:MM' strings. Used by the overlap exclusion constraint below.
--
-- A generated column's expression must be IMMUTABLE. The text->time cast
-- (start_time::time) is only classified STABLE by Postgres, so we wrap the
-- conversion in an explicitly-immutable helper. Parsing 'HH:MM' into a time of
-- day does not depend on any session setting, so this is safe.
create or replace function public.lesson_busy_range(p_date date, p_start text, p_end text)
returns tsrange
language sql
immutable
as $$
  select tsrange(
    p_date + p_start::time without time zone,
    p_date + p_end::time without time zone,
    '[)'
  );
$$;

alter table public.lesson_bookings
  add column if not exists busy_range tsrange
  generated always as (public.lesson_busy_range(lesson_date, start_time, end_time)) stored;

-- btree_gist lets us mix text equality (location) with range overlap in one
-- GiST exclusion constraint.
create extension if not exists btree_gist;

-- Brandon can teach only one lesson at a time per location: no two live
-- (non-cancelled) bookings may overlap in time at the same location. This is
-- the DB backstop behind the availability math and the edge-function checks.
alter table public.lesson_bookings drop constraint if exists lesson_bookings_no_overlap;
alter table public.lesson_bookings
  add constraint lesson_bookings_no_overlap
  exclude using gist (location with =, busy_range with &&)
  where (status <> 'cancelled');

-- Available 60-minute lesson START times for a location across a date range.
-- Expands each recurring weekly window into 30-minute-spaced start times where
-- a full 60-minute lesson still fits, then drops any start that overlaps an
-- existing non-cancelled booking (and any time already past, for today).
-- Security-definer so customers get accurate availability WITHOUT being able to
-- read other customers' bookings. Returns no PII — just date + time strings.
create or replace function public.open_lesson_times(
  p_location text,
  p_from     date,
  p_to       date
)
returns table (lesson_date date, start_time text, end_time text)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  d           date;
  w           record;
  t           integer;         -- candidate start, minutes from midnight
  win_start   integer;
  win_end     integer;
  now_cst     timestamp := (now() at time zone 'America/Chicago');
  today_cst   date      := (now() at time zone 'America/Chicago')::date;
  now_minutes integer   := extract(hour from (now() at time zone 'America/Chicago'))::int * 60
                           + extract(minute from (now() at time zone 'America/Chicago'))::int;
begin
  if p_location is null then
    return;
  end if;

  d := greatest(p_from, today_cst);
  while d <= p_to loop
    for w in
      select a.start_time, a.end_time
      from public.lesson_availability a
      where a.is_active
        and a.location = p_location
        and a.weekday = extract(dow from d)::int
    loop
      win_start := split_part(w.start_time, ':', 1)::int * 60 + split_part(w.start_time, ':', 2)::int;
      win_end   := split_part(w.end_time,   ':', 1)::int * 60 + split_part(w.end_time,   ':', 2)::int;

      t := win_start;
      while t + 60 <= win_end loop
        -- Skip times that have already started today.
        if not (d = today_cst and t <= now_minutes) then
          if not exists (
            select 1
            from public.lesson_bookings b
            where b.location = p_location
              and b.lesson_date = d
              and b.status <> 'cancelled'
              and (split_part(b.start_time, ':', 1)::int * 60 + split_part(b.start_time, ':', 2)::int) < t + 60
              and (split_part(b.end_time,   ':', 1)::int * 60 + split_part(b.end_time,   ':', 2)::int) > t
          ) then
            lesson_date := d;
            start_time  := lpad((t / 60)::text, 2, '0') || ':' || lpad((t % 60)::text, 2, '0');
            end_time    := lpad(((t + 60) / 60)::text, 2, '0') || ':' || lpad(((t + 60) % 60)::text, 2, '0');
            return next;
          end if;
        end if;
        t := t + 30;
      end loop;
    end loop;
    d := d + 1;
  end loop;

  return;
end;
$$;

grant execute on function public.open_lesson_times(text, date, date) to authenticated;
