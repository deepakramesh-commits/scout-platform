-- A quality check covers the match as it was when it ran. Any later change to its events, lineups, sheet or periods
-- stamps matches.inputs_changed_at; each run stores the stamp it read, and publish refuses when the two differ.
alter table matches add column inputs_changed_at timestamptz;
alter table qc_runs add column inputs_seen timestamptz;

create function app.stamp_match_inputs() returns trigger language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if tg_op = 'DELETE' then mid := old.match_id; else mid := new.match_id; end if;
  -- once per transaction, so a bulk load writes the match row once
  update matches set inputs_changed_at = now() where id = mid and inputs_changed_at is distinct from now();
  return null;
end $$;
create trigger inputs_changed after insert or update or delete on events for each row execute function app.stamp_match_inputs();
create trigger inputs_changed after insert or update or delete on lineups for each row execute function app.stamp_match_inputs();
create trigger inputs_changed after insert or update or delete on match_sheet_events for each row execute function app.stamp_match_inputs();

create function app.stamp_periods() returns trigger language plpgsql as $$
begin new.inputs_changed_at := now(); return new; end $$;
create trigger periods_changed before update of periods on matches for each row
  when (old.periods is distinct from new.periods) execute function app.stamp_periods();

create or replace function app.publish_match(mid uuid) returns void language plpgsql security definer set search_path = public as $$
declare cur text; changed timestamptz; ok boolean; n int; seen timestamptz;
begin
  if not app.assigned(mid, 'reviewer') then raise exception 'only a reviewer or admin publishes' using errcode = '42501'; end if;
  select status, inputs_changed_at into cur, changed from matches where id = mid for update;
  if cur is distinct from 'review' then raise exception 'only a match in review can publish (this one is %)', coalesce(cur, 'missing') using errcode = 'P0001'; end if;
  select passed, flags, inputs_seen into ok, n, seen from qc_runs where match_id = mid order by run_at desc limit 1;
  if not coalesce(ok, false) then raise exception 'the latest quality check has not passed' using errcode = 'P0001'; end if;
  if n > 0 then raise exception 'the latest quality check found % rule flags: fix them and run the check again', n using errcode = 'P0001'; end if;
  if seen is distinct from changed then
    raise exception 'the events, lineups, sheet or periods changed after the latest quality check: run it again' using errcode = 'P0001'; end if;
  update matches set status = 'published' where id = mid;
  insert into jobs (kind, payload) values ('compute_match_metrics',
    jsonb_build_object('match_id', mid, 'competition_id', (select competition_id from matches where id = mid)));
end $$;

-- Locks the row, so a move racing a publish waits for it and then sees the match published.
create or replace function app.advance_match(mid uuid, next text) returns void language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  select status into cur from matches where id = mid for update;
  if not (app.assigned(mid, 'analyst') or app.assigned(mid, 'reviewer')) then
    raise exception 'not assigned to this match' using errcode = '42501'; end if;
  if (cur, next) not in (('uploaded', 'tagging'), ('tagging', 'review'), ('review', 'tagging')) then
    raise exception 'cannot move a match from % to %', cur, next using errcode = 'P0001'; end if;
  update matches set status = next where id = mid;
end $$;

-- Who works on matches before they publish; everyone else reads only published match data.
create function app.match_staff() returns boolean language sql stable as $$
  select coalesce(app.role() in ('tagger', 'coordinator', 'admin'), false) $$;
grant execute on function app.match_staff() to authenticated;

drop policy covered on events;
create policy covered on events for select to authenticated
  using (match_id in (select app.covered_matches()) and (player_id is null or player_id in (select app.visible_players()))
         and ((select app.match_staff()) or match_id in (select id from matches where status = 'published')));

-- A published match's sheet feeds per-90 numbers, so it no longer changes.
drop policy coordinator on lineups;
create policy coordinator on lineups for all to authenticated
  using (app.assigned(match_id, 'coordinator') and (select status from matches where id = match_id) <> 'published')
  with check (app.assigned(match_id, 'coordinator') and (select status from matches where id = match_id) <> 'published');
drop policy coordinator on match_sheet_events;
create policy coordinator on match_sheet_events for all to authenticated
  using (app.assigned(match_id, 'coordinator') and (select status from matches where id = match_id) <> 'published')
  with check (app.assigned(match_id, 'coordinator') and submitted_by = auth.uid()
              and (select status from matches where id = match_id) <> 'published');

-- A second "Write summary" click while one waits queues nothing more (each run can be a paid Claude call).
create or replace function app.request_summary(pid uuid, cid uuid) returns void language sql security definer set search_path = public as $$
  insert into jobs (kind, payload)
  select 'write_report', jsonb_build_object('player_id', pid, 'competition_id', cid)
  where pid in (select app.visible_players()) and cid in (select app.covered_competitions())
    and not exists (select 1 from jobs where kind = 'write_report' and status in ('queued', 'running')
                    and payload = jsonb_build_object('player_id', pid, 'competition_id', cid)) $$;
