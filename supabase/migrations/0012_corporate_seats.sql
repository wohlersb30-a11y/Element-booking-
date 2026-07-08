-- Corporate memberships: up to 5 shared "account holders" drawing from one
-- monthly hour/guest-pass pool. authorized_emails lists the additional holders
-- (the owner is still memberships.user_email).

alter table public.memberships
  add column if not exists authorized_emails text[] not null default '{}';

-- Let an authorized account holder (not just the owner) see the membership row.
drop policy if exists "memberships_owner_select" on public.memberships;
create policy "memberships_owner_select" on public.memberships
  for select using (
    user_email = (auth.jwt() ->> 'email')
    or (auth.jwt() ->> 'email') = any (authorized_emails)
    or public.is_admin()
  );

-- Pool visibility: an account holder can see every booking under a membership
-- they belong to (owner or authorized), so the portal can total shared usage.
drop policy if exists "member_bookings_owner_select" on public.member_bookings;
create policy "member_bookings_owner_select" on public.member_bookings
  for select using (
    member_email = (auth.jwt() ->> 'email')
    or public.is_admin()
    or exists (
      select 1 from public.memberships m
      where m.id = member_bookings.membership_id
        and (
          m.user_email = (auth.jwt() ->> 'email')
          or (auth.jwt() ->> 'email') = any (m.authorized_emails)
        )
    )
  );
