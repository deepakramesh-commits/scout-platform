-- Staff scope: taggers and coordinators read and change match data only for the matches they are assigned to, and
-- only for their task there (coordinator: the sheet and the video; analyst: events and imports; reviewer: the QC
-- sample and runs). Admins keep everything; app.assigned() is true for them.

-- Reads: staff no longer cover every competition. A tagger or coordinator sees what his org covers plus his assigned matches.
drop function app.covers_match(uuid);
drop function app.covers(uuid);
create or replace function app.covered_competitions() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from competitions where app.is_admin() or id in (select competition_id from org_coverage where org_id = app.org()) $$;
create or replace function app.covered_matches() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from matches where competition_id in (select app.covered_competitions())
  union select match_id from match_assignments where user_id = auth.uid() $$;
drop policy covered on matches;
create policy covered on matches for select to authenticated using (id in (select app.covered_matches()));

-- matches: admins create and delete; the analyst and coordinator edit their match. Status moves only through
-- app.advance_match and app.publish_match, so no one updates it directly.
drop policy staff_write on matches;
create policy admin_write on matches for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy assigned_edit on matches for update to authenticated
  using (app.assigned(id, 'analyst') or app.assigned(id, 'coordinator'))
  with check (app.assigned(id, 'analyst') or app.assigned(id, 'coordinator'));
revoke update on matches from authenticated;
grant update (periods, sheet_submitted_at, video_provider, video_path, video_size, mux_upload_id, mux_playback_id, video_status)
  on matches to authenticated;

drop policy staff_write on lineups;
create policy coordinator on lineups for all to authenticated
  using (app.assigned(match_id, 'coordinator')) with check (app.assigned(match_id, 'coordinator'));

create function app.coordinated_teams() returns setof uuid language sql stable security definer set search_path = public as $$
  select unnest(array[m.home_team_id, m.away_team_id]) from match_assignments a join matches m on m.id = a.match_id
  where a.user_id = auth.uid() and a.task = 'coordinator' $$;
grant execute on function app.coordinated_teams() to authenticated;
drop policy staff_write on squad_members;
create policy coordinator on squad_members for all to authenticated
  using ((select app.is_admin()) or team_id in (select app.coordinated_teams()))
  with check ((select app.is_admin()) or team_id in (select app.coordinated_teams()));

-- The analyst sees the sample window on his QC screen; only the reviewer sets it.
drop policy staff on qc_samples;
create policy assigned_read on qc_samples for select to authenticated
  using (app.assigned(match_id, 'analyst') or app.assigned(match_id, 'reviewer'));
create policy reviewer on qc_samples for all to authenticated
  using (app.assigned(match_id, 'reviewer')) with check (app.assigned(match_id, 'reviewer'));

drop policy staff_write on qc_runs;
create policy reviewer on qc_runs for insert to authenticated with check (app.assigned(match_id, 'reviewer'));

drop policy staff on imports;
create policy analyst on imports for all to authenticated
  using (app.assigned(match_id, 'analyst')) with check (app.assigned(match_id, 'analyst') and created_by = auth.uid());

-- The QC screen's export button. A second click while one export waits queues nothing more.
create function app.request_export(mid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.assigned(mid, 'reviewer') then raise exception 'only the match''s reviewer or an admin exports it' using errcode = '42501'; end if;
  insert into jobs (kind, payload)
  select 'export_match', jsonb_build_object('match_id', mid)
  where not exists (select 1 from jobs where kind = 'export_match' and status in ('queued', 'running') and payload->>'match_id' = mid::text);
end $$;
grant execute on function app.request_export(uuid) to authenticated;
