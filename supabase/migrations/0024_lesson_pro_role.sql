-- ---------------------------------------------------------------------------
-- Restricted "lesson pro" role for Brandon.
--
-- Goal: let Brandon (lessons@sigettegolf.com) sign in and manage ONLY his
-- weekly lesson availability — nothing else in the system. He is deliberately
-- NOT a full admin: is_admin() stays 'admin'-only, so every other admin-gated
-- table (pricing, bookings, blocks, customers, hours, …) remains closed to him.
--
-- Prereq: 0023_lesson_windows.sql must already be applied (it creates
-- lesson_availability and its policies, which this migration re-points).
-- ---------------------------------------------------------------------------

-- 1) Allow a third role value on profiles. ----------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'admin', 'lesson_pro'));

-- 2) Helper: true for admins AND lesson pros. Used only where a lesson pro is
--    meant to have write access. Everything else keeps using is_admin().
create or replace function public.is_lesson_scheduler()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'lesson_pro')
  );
$$;

-- 3) Let the lesson scheduler (admin OR lesson_pro) write availability windows.
--    Read stays authenticated-read (from 0023). All OTHER lesson tables keep
--    their is_admin()-only write policies, so Brandon can't touch bookings,
--    credits, bays, or anything else.
drop policy if exists "lesson_availability_admin_write" on public.lesson_availability;
create policy "lesson_availability_admin_write" on public.lesson_availability
  for all using (public.is_lesson_scheduler()) with check (public.is_lesson_scheduler());

-- 4) If Brandon's account already exists, flip it to the restricted role.
--    Idempotent and safe: updates 0 rows until he has signed up, and never
--    downgrades an existing admin. RE-RUN THIS STATEMENT after he signs up at
--    /Signup with lessons@sigettegolf.com if it affected 0 rows here.
update public.profiles p
set role = 'lesson_pro'
from auth.users u
where u.id = p.id
  and lower(u.email) = 'lessons@sigettegolf.com'
  and p.role <> 'admin';
