-- Customer contact database (imported from the legacy booking portal + contacts
-- export). This is a CRM-style directory of everyone who has ever booked, kept
-- separate from `profiles` (which only holds app-authenticated accounts).
-- Sensitive PII -> admin-only via RLS.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text,
  phone text,          -- digits only, normalized on import
  source text,         -- which import file / origin
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lowercase email on write for consistent lookups/dedupe.
create or replace function public.customers_normalize()
returns trigger language plpgsql as $$
begin
  if new.email is not null then
    new.email = lower(trim(new.email));
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_normalize_trg on public.customers;
create trigger customers_normalize_trg
  before insert or update on public.customers
  for each row execute function public.customers_normalize();

create index if not exists customers_email_idx on public.customers (email);
create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_name_idx  on public.customers (lower(full_name));

alter table public.customers enable row level security;

-- Admin-only. No customer/anon access to the directory.
drop policy if exists customers_admin_all on public.customers;
create policy customers_admin_all on public.customers
  for all
  using (public.is_admin())
  with check (public.is_admin());
