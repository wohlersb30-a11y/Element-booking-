-- Server-side staging for in-flight Stripe checkouts. Instead of stuffing the
-- full booking payload into Stripe Checkout Session metadata (which is capped at
-- 50 keys x 500 chars and can fail on large group bookings or long notes), we
-- store the payload here and reference it by a short token (bd_ref) in metadata.
-- finalizeBooking reads it back after payment. Only the service role (edge
-- functions) touches this table; RLS is enabled with no policies so anon/auth
-- clients have no access.

create table if not exists public.pending_checkouts (
  token text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.pending_checkouts enable row level security;

-- Optional housekeeping helper: prune rows older than a day (call from a cron if
-- desired). Kept as a plain index for now; rows are tiny and harmless if left.
create index if not exists pending_checkouts_created_at_idx
  on public.pending_checkouts (created_at);
