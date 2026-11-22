-- A change can pass its status check while a publish is in flight, then wait on the match row and land after it commits.
-- The stamp runs after that wait, so it reads the committed status and refuses. The worker (no signed-in user) still loads published matches.
create or replace function app.stamp_match_inputs() returns trigger language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if tg_op = 'DELETE' then mid := old.match_id; else mid := new.match_id; end if;
  -- once per transaction, so a bulk load writes the match row once; later rows already hold its lock
  update matches set inputs_changed_at = now() where id = mid and inputs_changed_at is distinct from now();
  if found and auth.uid() is not null and (select status from matches where id = mid) = 'published' then
    raise exception 'this match is published; its data can no longer change' using errcode = 'P0001';
  end if;
  return null;
end $$;

create or replace function app.stamp_periods() returns trigger language plpgsql as $$
begin
  if new.status = 'published' and auth.uid() is not null then
    raise exception 'this match is published; its periods can no longer change' using errcode = 'P0001';
  end if;
  new.inputs_changed_at := now();
  return new;
end $$;
