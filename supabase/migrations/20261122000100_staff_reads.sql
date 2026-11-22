-- Staff scope, reads: a tagger or coordinator reads players, squads and quality-check data only through the matches
-- assigned to him. Admins keep everything. With this, no policy trusts a staff role on its own, so app.is_staff() goes.

create function app.assigned_matches() returns setof uuid language sql stable security definer set search_path = public as $$
  select match_id from match_assignments where user_id = auth.uid() $$;
create function app.assigned_teams() returns setof uuid language sql stable security definer set search_path = public as $$
  select unnest(array[home_team_id, away_team_id]) from matches where id in (select app.assigned_matches()) $$;
-- The squads of his matches, under any task. A withdrawn player leaves at once (BUILD_PROMPT section 4 rule 6).
create function app.assigned_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.player_id from squad_members s join players p on p.id = s.player_id
  where s.team_id in (select app.assigned_teams()) and p.status <> 'withdrawn' and app.role() in ('tagger', 'coordinator') $$;
grant execute on function app.assigned_matches(), app.assigned_teams(), app.assigned_players() to authenticated;

create or replace function app.sees_player(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() or app.owns_player(pid) or pid in (select app.federation_players())
      or pid in (select app.assigned_players())
      or exists (select 1 from players p where p.id = pid and p.visible_to_scouts and app.scouting()) $$;
create or replace function app.visible_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from players p where app.is_admin() or (p.visible_to_scouts and app.scouting())
  union select app.my_players()
  union select app.federation_players()
  union select app.assigned_players() $$;
drop function app.coordinator_players();

drop policy staff on squad_members;
create policy covered on squad_members for select to authenticated
  using ((select app.scouting()) or team_id in (select app.assigned_teams()));

drop policy staff on review_events;
create policy assigned_read on review_events for select to authenticated
  using ((select app.is_admin()) or match_id in (select app.assigned_matches()));

-- An analyst keeps his own accuracy record across matches; other analysts' runs only on matches he works.
drop policy staff on qc_runs;
create policy assigned_read on qc_runs for select to authenticated
  using ((select app.is_admin()) or analyst_id = auth.uid() or match_id in (select app.assigned_matches()));

-- The QC screen shows the reviewer the state of his export; every other job is the admin's.
drop policy admin_read on jobs;
create policy admin_read on jobs for select to authenticated using ((select app.is_admin()));
create policy reviewer_exports on jobs for select to authenticated
  using (kind = 'export_match' and payload->>'match_id' in (
    select match_id::text from match_assignments where user_id = auth.uid() and task = 'reviewer'));

drop function app.is_staff();
