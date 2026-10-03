-- ============================================================================
-- LOCAL TESTING ONLY — never run this against the real Supabase project.
--
-- Supabase provides the auth schema, auth.uid() and the anon /
-- authenticated / service_role roles. A bare Postgres container does not, so
-- the migrations would fail on the first reference to them. This file supplies
-- just enough of that surface to execute 0001 -> 0002 -> 0003 locally and
-- exercise RLS.
--
-- The difference that matters: here auth.uid() reads a session variable, so a
-- test can impersonate anyone with
--     set local app.current_user_id = '<uuid>';
-- On Supabase it reads the JWT claim instead.
-- ============================================================================

-- ------------------------------------------------------------- roles ------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- New tables created later by the migrations should be reachable by the API
-- roles, exactly as Supabase's default privileges arrange it.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- -------------------------------------------------------------- auth ------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- The columns seed.sql writes, matching real Supabase Auth closely enough for it.
create table if not exists auth.users (
  instance_id   uuid,
  id            uuid primary key default gen_random_uuid(),
  aud           text,
  role          text,
  email         text,
  phone         text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  confirmation_token text,
  recovery_token text,
  email_change text,
  email_change_token_new text,
  email_change_token_current text,
  phone_change text,
  phone_change_token text,
  reauthentication_token text
);

create table if not exists auth.identities (
  id            uuid primary key default gen_random_uuid(),
  provider_id   text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider      text not null,
  last_sign_in_at timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz,
  unique (provider_id, provider)
);

/**
 * Stands in for Supabase's JWT-backed auth.uid().
 * Returns null when unset, which is how the migrations detect a server-side
 * caller (pg_cron, workers) as opposed to a signed-in user.
 */
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.current_role', true), ''), 'anon');
$$;

grant execute on function auth.uid()  to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
