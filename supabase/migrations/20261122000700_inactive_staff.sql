-- A deactivated tagger or coordinator loses his assigned matches at once, like every other role (app.role() is null for him).
create or replace function app.assigned(mid uuid, what text) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() or exists (select 1 from match_assignments a join app_users u on u.id = a.user_id and u.active
                                   where a.match_id = mid and a.user_id = auth.uid() and a.task = what) $$;
create or replace function app.assigned_matches() returns setof uuid language sql stable security definer set search_path = public as $$
  select a.match_id from match_assignments a join app_users u on u.id = a.user_id and u.active where a.user_id = auth.uid() $$;
create or replace function app.coordinated_teams() returns setof uuid language sql stable security definer set search_path = public as $$
  select unnest(array[m.home_team_id, m.away_team_id]) from match_assignments a join matches m on m.id = a.match_id
  join app_users u on u.id = a.user_id and u.active
  where a.user_id = auth.uid() and a.task = 'coordinator' $$;
create or replace function app.covered_matches() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from matches where competition_id in (select app.covered_competitions())
  union select app.assigned_matches() $$;

drop policy reviewer_exports on jobs;
create policy reviewer_exports on jobs for select to authenticated
  using (kind = 'export_match' and payload->>'match_id' in (
    select a.match_id::text from match_assignments a join app_users u on u.id = a.user_id and u.active
    where a.user_id = auth.uid() and a.task = 'reviewer'));
