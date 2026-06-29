-- ---------------------------------------------------------------------------
-- Legacy customers (imported from the old system's CSV export).
-- Lets returning customers "complete a one-time registration" on first use of
-- the new app: the booking/login screen looks up their email and, if it matches
-- an unclaimed legacy record, walks them through setting a password. Their saved
-- name/phone are merged into their new profile automatically on signup.
-- ---------------------------------------------------------------------------
create table if not exists public.legacy_customers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  full_name   text,
  phone       text,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Emails are always stored/compared in lower-case.
create or replace function public.legacy_customers_lower_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists legacy_customers_lower_email on public.legacy_customers;
create trigger legacy_customers_lower_email
  before insert or update on public.legacy_customers
  for each row execute function public.legacy_customers_lower_email();

-- RLS: never expose this table to the client directly. Only the
-- security-definer functions below (and the service role) touch it.
alter table public.legacy_customers enable row level security;
-- (no policies = no anon/authenticated access; service role bypasses RLS)

-- ---------------------------------------------------------------------------
-- email_status(): tells the login/booking screen which path to show, WITHOUT
-- leaking any personal data. Returns one of: 'account' | 'legacy' | 'new'.
--   account = an auth account already exists -> log in
--   legacy  = unclaimed legacy customer      -> complete one-time registration
--   new     = unknown email                  -> create a new account
-- ---------------------------------------------------------------------------
create or replace function public.email_status(p_email text)
returns text
language plpgsql
stable
security definer set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then
    return 'new';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    return 'account';
  end if;
  if exists (select 1 from public.legacy_customers where email = v_email and claimed_at is null) then
    return 'legacy';
  end if;
  return 'new';
end;
$$;

grant execute on function public.email_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Extend the new-user trigger to merge legacy contact info into the profile
-- and mark the legacy record claimed. Signup may also pass full_name/phone via
-- user metadata (those win over the legacy values when present).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_legacy public.legacy_customers;
begin
  select * into v_legacy
  from public.legacy_customers
  where email = lower(new.email)
  limit 1;

  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), v_legacy.full_name, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), v_legacy.phone)
  )
  on conflict (id) do nothing;

  if v_legacy.id is not null then
    update public.legacy_customers
       set claimed_at = now()
     where id = v_legacy.id;
  end if;

  return new;
end;
$$;
