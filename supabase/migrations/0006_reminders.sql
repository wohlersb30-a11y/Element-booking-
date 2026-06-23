-- Tracks which automated reminders have already gone out for a booking so the
-- scheduled send-reminders function never double-sends. 24h = the day-before
-- reminder, 2h = the same-day "almost tee time" nudge.
alter table public.bookings
  add column if not exists reminder_24h_sent boolean not null default false;

alter table public.bookings
  add column if not exists reminder_2h_sent boolean not null default false;
