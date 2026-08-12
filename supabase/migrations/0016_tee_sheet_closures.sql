-- Full tee-sheet closures. When a location has an active closure, online
-- booking is shut off and customers see a friendly message with the reason.
-- One active closure per location at a time (admin toggles it on/off).

create table if not exists public.tee_sheet_closures (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  reason text,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tee_sheet_closures_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tee_sheet_closures_touch_trg on public.tee_sheet_closures;
create trigger tee_sheet_closures_touch_trg
  before update on public.tee_sheet_closures
  for each row execute function public.tee_sheet_closures_touch();

-- Fast "is this location currently closed?" lookups.
create index if not exists tee_sheet_closures_active_idx
  on public.tee_sheet_closures (location)
  where is_active;

alter table public.tee_sheet_closures enable row level security;

-- Customers must be able to READ the active closure so the booking page can show
-- the friendly closed message. Writing (open/close) is admin-only.
drop policy if exists tee_sheet_closures_read on public.tee_sheet_closures;
create policy tee_sheet_closures_read on public.tee_sheet_closures
  for select using (true);

drop policy if exists tee_sheet_closures_admin_write on public.tee_sheet_closures;
create policy tee_sheet_closures_admin_write on public.tee_sheet_closures
  for all
  using (public.is_admin())
  with check (public.is_admin());
