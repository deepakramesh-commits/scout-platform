-- LOCAL ONLY: Supabase provides the real auth schema.
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
