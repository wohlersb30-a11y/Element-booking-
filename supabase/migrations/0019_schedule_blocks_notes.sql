-- Give schedule blocks an optional free-text note. The Block Schedule form has
-- always collected a "Notes" value and the admin daily schedule grid renders it
-- (DailyScheduleView shows block.notes), but the column was never added — so
-- inserting a block with notes failed. This adds the missing column.

alter table public.schedule_blocks
  add column if not exists notes text;
