-- A shared report shows the competition its author was reading: a player ranks within each competition separately.
alter table report_links add column competition_id uuid references competitions on delete set null;

drop function app.shared_report(text);
create function app.shared_report(tok text) returns table (player_id uuid, profile_id uuid, created_by uuid, competition_id uuid)
language sql stable security definer set search_path = public as $$
  select l.player_id, l.profile_id, l.created_by, l.competition_id from report_links l join players p on p.id = l.player_id
  join app_users u on u.id = l.created_by and u.active and u.org_id = l.org_id
  where l.token = tok and l.expires_at > now() and p.visible_to_scouts $$;
grant execute on function app.shared_report(text) to anon, authenticated;
