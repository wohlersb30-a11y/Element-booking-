-- ---------------------------------------------------------------------------
-- Lessons: 2-hour booking lead time + "block time off" for the lesson pro.
--
-- Two changes to how open lesson times are produced:
--
--   1) LEAD TIME. A lesson may no longer be booked within 2 hours (120 min) of
--      the current Central time. Example: at 1:01 PM the earliest bookable start
--      becomes 3:30 PM (3:00 PM falls inside the 2-hour window; the next 30-min
--      start that clears it is 3:30 PM). At exactly 1:00 PM, 3:00 PM is allowed.
--
--   2) BLOCKS. Brandon (the lesson pro) can completely block specific days and
--      times — a one-off calendar date OR a recurring weekday, either the whole
--      day or a time range. Any lesson start that overlaps an active block is
--      removed from availability. This layers on top of his weekly windows: a
--      customer can only book a window time that is NOT blocked.
--
-- Because `open_lesson_times` is the single source of availability (the customer
-- picker AND the server-side `isLessonTimeOpen` check both call it), honoring
-- blocks here enforces them everywhere automatically — no edge-function change.
-- ---------------------------------------------------------------------------

-- Lesson time-off blocks. One row = one block the lesson pro took off. --------
create table if not exists public.lesson_blocks (
  id          uuid primary key default gen_random_uuid(),
  location    text    not null,                 -- 'vadnais_heights' | 'burnsville'
  block_date  date,                             -- set for a one-off specific date
  weekday     integer check (weekday between 0 and 6), -- set for a recurring weekday (0=Sun…6=Sat)
  all_day     boolean not null default false,   -- true = block the whole day
  start_time  text,                             -- 'HH:MM' (required unless all_day)
  end_time    text,                             -- 'HH:MM' (required unless all_day)
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  -- exactly one of a specific date OR a recurring weekday
  constraint lesson_blocks_when_ck check ((block_date is not null) <> (weekday is not null)),
  -- whole-day blocks carry no times; timed blocks carry both
  constraint lesson_blocks_times_ck check (
    (all_day and start_time is null and end_time is null)
    or (not all_day and start_time is not null and end_time is not null)
  )
);

create index if not exists lesson_blocks_loc_date_idx on public.lesson_blocks (location, block_date);
create index if not exists lesson_blocks_loc_wd_idx   on public.lesson_blocks (location, weekday);

alter table public.lesson_blocks enable row level security;

-- Any authenticated user may READ blocks (so the customer picker is accurate).
drop policy if exists "lesson_blocks_read" on public.lesson_blocks;
create policy "lesson_blocks_read" on public.lesson_blocks
  for select using (auth.role() = 'authenticated');

-- The lesson pro (and admins) manage blocks — same writers as availability.
drop policy if exists "lesson_blocks_write" on public.lesson_blocks;
create policy "lesson_blocks_write" on public.lesson_blocks
  for all using (public.is_lesson_scheduler()) with check (public.is_lesson_scheduler());

-- Rebuild open_lesson_times with the 2-hour lead time and block exclusion. -----
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
        -- Lead time: today's starts must be at least 2 hours (120 min) out.
        if not (d = today_cst and t < now_minutes + 120) then
          -- No overlap with an existing non-cancelled booking…
          if not exists (
            select 1
            from public.lesson_bookings b
            where b.location = p_location
              and b.lesson_date = d
              and b.status <> 'cancelled'
              and (split_part(b.start_time, ':', 1)::int * 60 + split_part(b.start_time, ':', 2)::int) < t + 60
              and (split_part(b.end_time,   ':', 1)::int * 60 + split_part(b.end_time,   ':', 2)::int) > t
          )
          -- …and not inside an active block (whole-day or a time range), either a
          -- one-off date or a recurring weekday.
          and not exists (
            select 1
            from public.lesson_blocks bl
            where bl.is_active
              and bl.location = p_location
              and (bl.block_date = d or bl.weekday = extract(dow from d)::int)
              and (
                bl.all_day
                or (
                  (split_part(bl.start_time, ':', 1)::int * 60 + split_part(bl.start_time, ':', 2)::int) < t + 60
                  and (split_part(bl.end_time,   ':', 1)::int * 60 + split_part(bl.end_time,   ':', 2)::int) > t
                )
              )
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
