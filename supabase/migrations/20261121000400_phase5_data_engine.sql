-- Phase 5: the data engine, stage 1 (people enter everything).

-- Room for later stages: who or what produced an event and how sure it is. Nothing is built on these yet.
alter table events add column source text not null default 'statsbomb_open' check (source in ('statsbomb_open', 'import', 'manual', 'ai')),
                   add column confidence numeric check (confidence between 0 and 1),
                   add column created_at timestamptz not null default now();

create table settings (key text primary key, value jsonb not null, description text not null);
insert into settings values
  ('qc_count_agreement', '0.9', 'Share of events the second analyst must agree with before a match can publish'),
  ('qc_location_tolerance', '10', 'Pitch units within which two analysts'' events count as the same event'),
  ('qc_time_window', '3', 'Seconds within which two analysts'' events of the same type and player are paired'),
  ('qc_sample_minutes', '15', 'Minutes of each match the second analyst logs again');

-- Clubs own teams, so a coordinator fills the sheet for his own club.
alter table teams add column org_id uuid references orgs;
create table squad_members (
  team_id uuid references teams on delete cascade,
  player_id uuid references players on delete cascade,
  shirt_number int check (shirt_number between 1 and 99),
  primary key (team_id, player_id)
);
insert into squad_members (team_id, player_id, shirt_number)
select distinct on (team_id, player_id) team_id, player_id, shirt_number from lineups order by team_id, player_id
on conflict do nothing;

create table match_assignments (
  match_id uuid references matches on delete cascade,
  user_id uuid references app_users on delete cascade,
  task text not null check (task in ('coordinator', 'analyst', 'reviewer')),
  primary key (match_id, user_id, task)
);

-- Match sheet: line-ups go into `lineups`; substitutions, goals and cards here. Ids are generated on the phone,
-- so a sheet sent twice after a dropped connection lands once.
alter table lineups add column sheet_submitted_by uuid references app_users;
create table match_sheet_events (
  id uuid primary key,
  match_id uuid not null references matches on delete cascade,
  team_id uuid not null references teams,
  kind text not null check (kind in ('substitution', 'goal', 'own_goal', 'yellow_card', 'red_card')),
  minute int not null check (minute between 0 and 130),
  player_id uuid not null references players,
  player_in_id uuid references players,
  submitted_by uuid references app_users,
  created_at timestamptz not null default now(),
  check ((kind = 'substitution') = (player_in_id is not null))
);
alter table matches add column sheet_submitted_at timestamptz,
                    add column video_provider text check (video_provider in ('local', 'mux')),
                    add column video_path text,
                    add column video_size bigint,
                    add column mux_upload_id text,
                    add column mux_playback_id text,
                    add column video_status text check (video_status in ('uploading', 'processing', 'ready', 'failed'));

-- Second analyst: a sample window logged again, kept apart so it never feeds a profile.
create table qc_samples (
  match_id uuid primary key references matches on delete cascade,
  period int not null,
  start_seconds numeric not null,
  end_seconds numeric not null check (end_seconds > start_seconds),
  reviewer_id uuid references app_users
);
create table review_events (like events including defaults including constraints);
alter table review_events add primary key (id), add foreign key (match_id) references matches on delete cascade;
create table qc_runs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches on delete cascade,
  analyst_id uuid references app_users,
  reviewer_id uuid references app_users,
  primary_count int not null,
  review_count int not null,
  agreed int not null,
  agreement numeric not null,
  passed boolean not null,
  flags int not null,
  details jsonb not null default '{}',
  run_at timestamptz not null default now()
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches on delete cascade,
  format text not null check (format in ('csv', 'statsbomb_json')),
  filename text not null,
  rows_imported int not null,
  errors jsonb not null default '[]',
  created_by uuid references app_users,
  created_at timestamptz not null default now()
);

create table playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_users on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  is_demo boolean not null default false
);
create table playlist_items (
  playlist_id uuid references playlists on delete cascade,
  event_id uuid references events on delete cascade,
  position int not null default 0,
  note text not null default '',
  primary key (playlist_id, event_id)
);

create table player_summaries (
  player_id uuid references players on delete cascade,
  competition_id uuid references competitions on delete cascade,
  text text not null,
  source text not null check (source in ('template', 'claude')),
  model text,
  created_at timestamptz not null default now(),
  primary key (player_id, competition_id)
);

-- ---------- Row-level security ----------
do $$ declare t text; begin
  foreach t in array array['settings', 'squad_members', 'match_assignments', 'match_sheet_events', 'qc_samples', 'review_events',
                           'qc_runs', 'imports', 'playlists', 'playlist_items', 'player_summaries'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
grant select, insert, update, delete on settings, squad_members, match_assignments, match_sheet_events, qc_samples,
  review_events, qc_runs, imports, playlists, playlist_items, player_summaries to authenticated;

create function app.assigned(mid uuid, what text) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() or exists (select 1 from match_assignments where match_id = mid and user_id = auth.uid() and task = what) $$;

create policy read_all on settings for select to authenticated using (true);
create policy admin_write on settings for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy staff on squad_members for select to authenticated using ((select app.is_staff()) or (select app.scouting()));
create policy staff_write on squad_members for all to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
create policy own on match_assignments for select to authenticated using (user_id = auth.uid() or (select app.is_admin()));
create policy admin_write on match_assignments for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy covered on match_sheet_events for select to authenticated using (match_id in (select app.covered_matches()));
create policy coordinator on match_sheet_events for all to authenticated
  using (app.assigned(match_id, 'coordinator')) with check (app.assigned(match_id, 'coordinator') and submitted_by = auth.uid());
create policy staff on qc_samples for all to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
create policy staff on review_events for select to authenticated using ((select app.is_staff()));
create policy reviewer on review_events for all to authenticated
  using (app.assigned(match_id, 'reviewer')) with check (app.assigned(match_id, 'reviewer') and tagger_id = auth.uid());
create policy staff on qc_runs for select to authenticated using ((select app.is_staff()));
create policy staff_write on qc_runs for insert to authenticated with check ((select app.is_staff()));
create policy staff on imports for all to authenticated using ((select app.is_staff())) with check ((select app.is_staff()) and created_by = auth.uid());
create policy own on playlists for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own on playlist_items for all to authenticated
  using (exists (select 1 from playlists p where p.id = playlist_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
create policy visible on player_summaries for select to authenticated
  using (player_id in (select app.visible_players()) and competition_id in (select app.covered_competitions()));

-- Analysts write events only for matches assigned to them, and only while the match is being tagged.
drop policy staff_write on events;
create policy analyst_write on events for all to authenticated
  using (app.assigned(match_id, 'analyst') and (select status from matches where id = match_id) in ('uploaded', 'tagging', 'review'))
  with check (app.assigned(match_id, 'analyst') and (select status from matches where id = match_id) in ('uploaded', 'tagging', 'review'));

-- Publishing is a function: it checks the latest quality check passed, then queues the metrics job.
create function app.publish_match(mid uuid) returns void language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if not (app.is_admin() or app.assigned(mid, 'reviewer')) then raise exception 'only a reviewer or admin publishes' using errcode = '42501'; end if;
  select passed into ok from qc_runs where match_id = mid order by run_at desc limit 1;
  if not coalesce(ok, false) then raise exception 'the latest quality check has not passed' using errcode = 'P0001'; end if;
  update matches set status = 'published' where id = mid;
  insert into jobs (kind, payload) values ('compute_match_metrics',
    jsonb_build_object('match_id', mid, 'competition_id', (select competition_id from matches where id = mid)));
end $$;
grant execute on function app.publish_match(uuid), app.assigned(uuid, text) to authenticated;

-- Report summaries are written by a job; a scout asks for one.
create function app.request_summary(pid uuid, cid uuid) returns void language sql security definer set search_path = public as $$
  insert into jobs (kind, payload)
  select 'write_report', jsonb_build_object('player_id', pid, 'competition_id', cid)
  where pid in (select app.visible_players()) and cid in (select app.covered_competitions()) $$;
grant execute on function app.request_summary(uuid, uuid) to authenticated;

-- uploaded -> tagging -> review; publishing goes through app.publish_match.
create function app.advance_match(mid uuid, next text) returns void language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  select status into cur from matches where id = mid;
  if not (app.is_admin() or app.assigned(mid, 'analyst') or app.assigned(mid, 'reviewer')) then
    raise exception 'not assigned to this match' using errcode = '42501'; end if;
  if (cur, next) not in (('uploaded', 'tagging'), ('tagging', 'review'), ('review', 'tagging')) then
    raise exception 'cannot move a match from % to %', cur, next using errcode = 'P0001'; end if;
  update matches set status = next where id = mid;
end $$;
grant execute on function app.advance_match(uuid, text) to authenticated;

-- Where each period starts and ends in the video, marked by the analyst: [{"period": 1, "start": 312.5, "end": 3190}].
-- Rule flags read it to find events outside playing time and to turn video time into match minutes.
alter table matches add column periods jsonb not null default '[]';

-- The demo league for the data-engine tools (worker/seed_demo.py) is flagged like every other demo row.
alter table competitions add column is_demo boolean not null default false;
alter table teams add column is_demo boolean not null default false;
alter table matches add column is_demo boolean not null default false;

create function app.federation_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select l.player_id from lineups l join matches m on m.id = l.match_id
    join org_coverage c on c.competition_id = m.competition_id and c.owner and c.org_id = app.org()
  where app.role() = 'federation'
  union
  select s.player_id from squad_members s join matches m on s.team_id in (m.home_team_id, m.away_team_id)
    join org_coverage c on c.competition_id = m.competition_id and c.owner and c.org_id = app.org()
  where app.role() = 'federation' $$;
grant execute on function app.federation_players() to authenticated;

drop policy verify_only on player_identity;
drop policy verify_write on player_identity;
drop policy write on verifications;
drop policy add on physical_tests;
drop policy verify on physical_tests;
create policy verify_only on player_identity for select to authenticated
  using ((select app.is_admin()) or player_id in (select app.federation_players()) or app.owns_player(player_id));
create policy verify_write on player_identity for all to authenticated
  using ((select app.is_admin()) or player_id in (select app.federation_players()))
  with check ((select app.is_admin()) or player_id in (select app.federation_players()));
create policy write on verifications for all to authenticated
  using ((select app.is_admin()) or player_id in (select app.federation_players()))
  with check ((select app.is_admin()) or player_id in (select app.federation_players()));
create policy add on physical_tests for insert to authenticated
  with check ((app.owns_player(player_id) and not verified) or (select app.is_admin()) or player_id in (select app.federation_players()));
create policy verify on physical_tests for update to authenticated
  using ((select app.is_admin()) or player_id in (select app.federation_players()))
  with check ((select app.is_admin()) or player_id in (select app.federation_players()));

alter table physical_tests add column created_at timestamptz not null default now();

create function app.test_percentiles(pids uuid[]) returns table (
  player_id uuid, test text, label text, value numeric, unit text, tested_at date, verified boolean, is_demo boolean, pct int)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (t.player_id, t.test) t.player_id, t.test, t.value, t.unit, t.tested_at, t.verified, t.is_demo
    from physical_tests t order by t.player_id, t.test, t.tested_at desc, t.created_at desc
  ), ranked as (
    select l.*, k.label, round(100 * cume_dist() over (
             partition by l.test order by case when k.lower_is_better then -l.value else l.value end))::int as pct
    from latest l join physical_test_kinds k on k.key = l.test
  )
  select player_id, test, label, value, unit, tested_at, verified, is_demo, pct from ranked
  where player_id = any(pids) and player_id in (select app.visible_players()) $$;
grant execute on function app.test_percentiles(uuid[]) to authenticated;

-- Phase 4 gate (cso): one federation rule; a withdrawn player leaves it at once, and what a federation sees is what it may verify.
create or replace function app.federation_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select l.player_id from lineups l join matches m on m.id = l.match_id
    join org_coverage c on c.competition_id = m.competition_id and c.owner and c.org_id = app.org()
    join players p on p.id = l.player_id
  where app.role() = 'federation' and p.status <> 'withdrawn'
  union
  select s.player_id from squad_members s join matches m on s.team_id in (m.home_team_id, m.away_team_id)
    join org_coverage c on c.competition_id = m.competition_id and c.owner and c.org_id = app.org()
    join players p on p.id = s.player_id
  where app.role() = 'federation' and p.status <> 'withdrawn' $$;
create function app.coordinator_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.player_id from match_assignments a join matches m on m.id = a.match_id
    join squad_members s on s.team_id in (m.home_team_id, m.away_team_id)
    join players p on p.id = s.player_id
  where a.user_id = auth.uid() and a.task = 'coordinator' and app.role() = 'coordinator' and p.status <> 'withdrawn' $$;
grant execute on function app.coordinator_players() to authenticated;
-- Coordinators stay in app.is_staff() for match data, but see only the squads of the matches they are assigned.
create or replace function app.sees_player(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.role() in ('admin', 'tagger') or app.owns_player(pid) or pid in (select app.federation_players())
      or pid in (select app.coordinator_players())
      or exists (select 1 from players p where p.id = pid and p.visible_to_scouts and app.scouting()) $$;
create or replace function app.visible_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from players p where app.role() in ('admin', 'tagger') or (p.visible_to_scouts and app.scouting())
  union select app.my_players()
  union select app.federation_players()
  union select app.coordinator_players() $$;
drop policy read on verifications;
create policy read on verifications for select to authenticated
  using ((select app.is_admin()) or player_id in (select app.federation_players()) or app.owns_player(player_id));
