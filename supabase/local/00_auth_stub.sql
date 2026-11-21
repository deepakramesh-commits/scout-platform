-- LOCAL ONLY: Supabase provides the real auth schema, roles and auth.uid(). This stub mirrors the parts we use.
create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  encrypted_password text,
  created_at timestamptz not null default now()
);
-- Same definition as Supabase: the user id is the `sub` claim the request carries.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema auth to anon, authenticated;
create extension if not exists pgcrypto;
