#!/usr/bin/env bash
# Booking failure-rate monitor.
#
# Tracks the "charged then couldn't book" problem after the 2026-11-17 fixes
# (bay_busy_times availability RPC + regular↔member overlap guard).
#
# Run on this Mac (needs the Supabase CLI token from the login keychain):
#   bash scripts/check_booking_failures.sh
#
# Two signals:
#  (1) Daily checkout attempts vs. resulting bookings. "no_booking" includes
#      harmless abandons/declines at Stripe, so watch the TREND, not the raw
#      number. Fix deployed 2026-11-17 — compare days from 11-18 onward to the
#      11-12..11-16 baseline.
#  (2) The real bug signature: stranded checkouts whose bay/time overlaps a
#      booking owned by a DIFFERENT customer. The fix should drive NEW ones
#      (created 2026-11-17 onward) toward zero. Pre-fix days are shown for
#      contrast.
set -euo pipefail

TOKEN="$(security find-generic-password -l "Supabase CLI" -w)"
REF="vffdlrtqavrviyiamfun"
API="https://api.supabase.com/v1/projects/$REF/database/query"

run_sql() {
  python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" \
    | curl -s -X POST "$API" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        --data @-
  echo
}

echo "=================================================================="
echo " BOOKING FAILURE MONITOR  —  $(date '+%Y-%m-%d %H:%M %Z')"
echo "=================================================================="
echo
echo "(1) Daily checkout attempts vs bookings (last 10 days, CST day)"
echo "    became_booking = a matching confirmed booking exists"
echo "    no_booking     = abandon/decline at Stripe OR a failed booking"
echo "------------------------------------------------------------------"
run_sql <<'SQL'
with pc as (
  select (created_at at time zone 'America/Chicago')::date as day,
         lower(data->>'customerEmail') as email,
         (data->>'date')::date as bdate,
         data->>'time' as btime
  from public.pending_checkouts
  where created_at > now() - interval '10 days'
)
select day,
       count(*) as attempts,
       count(*) filter (where exists (
         select 1 from public.bookings b
         where lower(b.customer_email)=pc.email and b.booking_date=pc.bdate and b.start_time=pc.btime
       )) as became_booking,
       count(*) filter (where not exists (
         select 1 from public.bookings b
         where lower(b.customer_email)=pc.email and b.booking_date=pc.bdate and b.start_time=pc.btime
       )) as no_booking
from pc group by day order by day desc;
SQL

echo "(2) Bug signature — stranded checkouts overlapping ANOTHER customer's"
echo "    booking, by the day the checkout was created (CST)."
echo "    Should trend to ~0 for 2026-11-17 onward (fix deployed that day)."
echo "------------------------------------------------------------------"
run_sql <<'SQL'
with strand as (
  select (pc.created_at at time zone 'America/Chicago')::date as created_day,
         lower(pc.data->>'customerEmail') as email,
         (pc.data->>'date')::date as bdate,
         pc.data->>'time' as btime,
         (b->>'bayId')::uuid as bay_id,
         split_part(pc.data->>'time',':',1)::int*60 + split_part(pc.data->>'time',':',2)::int as smin,
         split_part(pc.data->>'endTime',':',1)::int*60 + split_part(pc.data->>'endTime',':',2)::int as emin
  from public.pending_checkouts pc,
       lateral jsonb_array_elements(coalesce(pc.data->'selectedBays','[]'::jsonb)) b
  where pc.created_at > now() - interval '7 days'
    and not exists (
      select 1 from public.bookings bk
      where lower(bk.customer_email)=lower(pc.data->>'customerEmail')
        and bk.booking_date=(pc.data->>'date')::date
        and bk.start_time=pc.data->>'time'
    )
)
select created_day,
       count(*) filter (where exists (
         select 1 from public.bookings bk
         where bk.simulator_id = s.bay_id and bk.booking_date = s.bdate
           and bk.status <> 'cancelled'
           and lower(bk.customer_email) <> s.email
           and (split_part(bk.start_time,':',1)::int*60 + split_part(bk.start_time,':',2)::int) < s.emin
           and (split_part(bk.end_time,':',1)::int*60 + split_part(bk.end_time,':',2)::int) > s.smin
       )) as overlapped_other_customer
from strand s
group by created_day order by created_day desc;
SQL

echo "Done. In (2), days 2026-11-17+ should show far fewer than 11-15/11-16."
