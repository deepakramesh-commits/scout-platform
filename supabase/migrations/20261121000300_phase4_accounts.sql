-- Phase 4: accounts, trust and workflow. Row-level security on every table.
--
-- Requests run as role `authenticated` (or `anon`) with the user id in request.jwt.claims, exactly as on Supabase.
-- Policy helpers live in schema `app` as security definer functions, so policies never recurse into app_users.

-- ---------- Profile state: one status drives visibility ----------
drop policy scouts_read_visible on players;
alter table players drop column visible_to_scouts;
alter table players
  add column status text not null default 'live' check (status in ('live', 'pending_approval', 'declined', 'withdrawn')),
  add column visible_to_scouts boolean generated always as (status = 'live') stored,
  add column origin text not null default 'match_data' check (origin in ('match_data', 'sign_up')),
  add column claimed_by uuid references app_users,
  add column guardian_id uuid references app_users,
  add column academy_org_id uuid references orgs,
  add column approved_at timestamptz,
  add column is_demo boolean not null default false;

-- Section 4 rule 5: under 18 waits for an admin; a birth date that becomes known applies the same rule.
create function app_age_rule() returns trigger language plpgsql as $$
begin
  if new.status in ('live', 'pending_approval') and new.approved_at is null then
    if new.birth_year is not null and extract(year from now())::int - new.birth_year < 18 then
      new.status := 'pending_approval';
    elsif new.status = 'pending_approval' and new.origin = 'match_data' then
      new.status := 'live';  -- age no longer known, or now an adult: shown as "age not recorded" or live
    end if;
  end if;
  return new;
end $$;
create trigger players_age_rule before insert or update of birth_year, status on players
  for each row execute function app_age_rule();
update players set birth_year = birth_year;  -- apply the rule to rows that already exist

alter table app_users add column active boolean not null default true,
                      add column email text;
alter table consents add column guardian_name text, add column guardian_contact text,
                     add column is_demo boolean not null default false;
alter table shortlists add column is_demo boolean not null default false, add column created_at timestamptz not null default now();
alter table shortlist_players add column rank int not null default 0, add column added_at timestamptz not null default now();
alter table profile_views add column org_id uuid references orgs;
alter table jobs add column last_error text, add column locked_at timestamptz, add column finished_at timestamptz,
  add constraint jobs_status_check check (status in ('queued', 'running', 'done', 'failed'));
create index on jobs (status, run_after);

-- The licensed partner agency is a separate company: it sees introduction requests, never rankings it could influence.
alter table orgs add column is_partner_agency boolean not null default false;

-- ---------- Coverage: a subscription unlocks leagues, not features ----------
create table org_coverage (
  org_id uuid references orgs on delete cascade,
  competition_id uuid references competitions on delete cascade,
  owner boolean not null default false,  -- a federation owns its competition
  is_demo boolean not null default false,
  primary key (org_id, competition_id)
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  decision text not null check (decision in ('approved', 'declined')),
  note text not null default '',
  decided_by uuid not null references app_users,
  decided_at timestamptz not null default now()
);

create table verifications (
  player_id uuid primary key references players on delete cascade,
  federation_registration text,
  id_checked boolean not null default false,
  photo_checked boolean not null default false,
  contract_status text check (contract_status in ('under_contract', 'free_agent', 'amateur', 'unknown')),
  note text not null default '',
  verified_by uuid references app_users,
  verified_at timestamptz,
  is_demo boolean not null default false
);

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_users on delete cascade,
  name text not null,
  query text not null,          -- the search URL's query string
  seen_player_ids uuid[] not null default '{}',
  checked_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create table agent_clients (
  org_id uuid references orgs on delete cascade,
  player_id uuid references players on delete cascade,
  added_at timestamptz not null default now(),
  is_demo boolean not null default false,
  primary key (org_id, player_id)
);

create table profile_shares (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  from_user uuid not null references app_users,
  from_org uuid not null references orgs,
  to_org uuid not null references orgs,
  message text not null default '',
  created_at timestamptz not null default now(),
  is_demo boolean not null default false
);

-- Recorded only: no messaging in this build.
create table intro_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  from_user uuid not null references app_users,
  from_org uuid not null references orgs,
  message text not null default '',
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  created_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create table report_links (
  token text primary key,
  player_id uuid not null references players on delete cascade,
  profile_id uuid references requirement_profiles on delete set null,
  org_id uuid not null references orgs,
  created_by uuid not null references app_users,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------- Policy helpers ----------
create schema app;
create function app.role() returns text language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid() and active $$;
create function app.org() returns uuid language sql stable security definer set search_path = public as $$
  select org_id from app_users where id = auth.uid() and active $$;
create function app.is_admin() returns boolean language sql stable as $$ select coalesce(app.role() = 'admin', false) $$;
create function app.is_staff() returns boolean language sql stable as $$ select coalesce(app.role() in ('admin', 'tagger', 'coordinator'), false) $$;
create function app.scouting() returns boolean language sql stable as $$
  select coalesce(app.role() in ('scout', 'agent', 'federation', 'coach', 'admin'), false) $$;
create function app.covers(cid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_staff() or exists (select 1 from org_coverage where org_id = app.org() and competition_id = cid) $$;
create function app.covers_match(mid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.covers((select competition_id from matches where id = mid)) $$;
-- The player is me, my child, or a player of my academy.
create function app.owns_player(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.id = pid and (
    p.claimed_by = auth.uid() or p.guardian_id = auth.uid() or (p.academy_org_id is not null and p.academy_org_id = app.org()))) $$;
-- Whom the scouting side may see. Federations also see their own competition's players while they wait for approval.
create function app.sees_player(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_staff() or app.owns_player(pid) or exists (
    select 1 from players p where p.id = pid and (
      (p.visible_to_scouts and app.scouting())
      or (app.role() = 'federation' and p.status <> 'withdrawn' and exists (
        select 1 from lineups l join matches m on m.id = l.match_id
        join org_coverage c on c.competition_id = m.competition_id and c.org_id = app.org() and c.owner
        where l.player_id = p.id)))) $$;

-- Set-returning forms, for policies on large tables: `x in (select app.f())` is evaluated once per query.
create function app.my_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from players where claimed_by = auth.uid() or guardian_id = auth.uid() or (academy_org_id is not null and academy_org_id = app.org()) $$;
create function app.visible_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from players p where app.is_staff() or (p.visible_to_scouts and app.scouting())
  union select app.my_players()
  union select l.player_id from lineups l join matches m on m.id = l.match_id
        join org_coverage c on c.competition_id = m.competition_id and c.org_id = app.org() and c.owner
        join players p on p.id = l.player_id
        where app.role() = 'federation' and p.status <> 'withdrawn' $$;
create function app.covered_competitions() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from competitions where app.is_staff() or id in (select competition_id from org_coverage where org_id = app.org()) $$;
create function app.covered_matches() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from matches where competition_id in (select app.covered_competitions()) $$;

-- ---------- Row-level security on every table ----------
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

grant usage on schema public, app to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant select on attributes, physical_test_kinds to anon;
grant execute on all functions in schema app to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage on sequences to authenticated;

-- Reference data
create policy read_all on attributes for select using (true);
create policy read_all on physical_test_kinds for select using (true);
create policy read_all on competitions for select to authenticated using (true);
create policy read_all on teams for select to authenticated using (true);
create policy admin_write on competitions for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy admin_write on teams for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- People and organisations
create policy self_or_org on app_users for select to authenticated
  using (id = auth.uid() or org_id = app.org() or app.is_admin());
create policy admin_write on app_users for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy read_all on orgs for select to authenticated using (true);
create policy admin_write on orgs for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy own_or_admin on org_coverage for select to authenticated using (org_id = app.org() or app.is_admin());
create policy admin_write on org_coverage for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- Players. Writes to status go through the approval and consent functions below.
create policy visible on players for select to authenticated using (id in (select app.visible_players()));
create policy owner_edit on players for update to authenticated
  using (app.owns_player(id) or app.is_admin()) with check (app.owns_player(id) or app.is_admin());
-- player_identity and ID documents: no scout-facing policy. Admins, federations verifying, and the player.
create policy verify_only on player_identity for select to authenticated
  using (app.is_admin() or app.role() = 'federation' and app.sees_player(player_id) or app.owns_player(player_id));
create policy verify_write on player_identity for all to authenticated
  using (app.is_admin() or app.role() = 'federation' and app.sees_player(player_id))
  with check (app.is_admin() or app.role() = 'federation' and app.sees_player(player_id));
create policy own on consents for select to authenticated
  using (signed_by = auth.uid() or app.owns_player(player_id) or app.is_admin());
create policy own_write on consents for update to authenticated
  using (app.owns_player(player_id)) with check (app.owns_player(player_id));
create policy read on approvals for select to authenticated using (app.is_admin() or app.owns_player(player_id));
create policy read on verifications for select to authenticated using (player_id in (select app.visible_players()));
create policy write on verifications for all to authenticated
  using (app.is_admin() or app.role() = 'federation' and app.sees_player(player_id))
  with check (app.is_admin() or app.role() = 'federation' and app.sees_player(player_id));

-- Match data, gated by coverage
create policy covered on matches for select to authenticated using (competition_id in (select app.covered_competitions()));
create policy staff_write on matches for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy covered on lineups for select to authenticated using (match_id in (select app.covered_matches()));
create policy staff_write on lineups for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy covered on events for select to authenticated
  using (match_id in (select app.covered_matches()) and (player_id is null or player_id in (select app.visible_players())));
create policy staff_write on events for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy covered on player_season_metrics for select to authenticated
  using (player_id in (select app.visible_players())
         and (competition_id in (select app.covered_competitions()) or player_id in (select app.my_players())));
create policy covered on player_match_index for select to authenticated
  using (player_id in (select app.visible_players())
         and (competition_id in (select app.covered_competitions()) or player_id in (select app.my_players())));

-- Scouting data about a visible player
create policy visible on player_market for select to authenticated using (player_id in (select app.visible_players()));
create policy owner_or_agent on player_market for all to authenticated
  using (app.is_admin() or app.owns_player(player_id) or exists (select 1 from agent_clients a where a.player_id = player_market.player_id and a.org_id = app.org()))
  with check (app.is_admin() or app.owns_player(player_id) or exists (select 1 from agent_clients a where a.player_id = player_market.player_id and a.org_id = app.org()));
create policy visible on physical_tests for select to authenticated using (player_id in (select app.visible_players()));
-- A coach, the player or an admin adds a test; only an admin or federation marks it verified.
create policy add on physical_tests for insert to authenticated
  with check ((app.owns_player(player_id) and not verified) or app.is_admin() or app.role() = 'federation' and app.sees_player(player_id));
create policy verify on physical_tests for update to authenticated
  using (app.is_admin() or app.role() = 'federation' and app.sees_player(player_id))
  with check (app.is_admin() or app.role() = 'federation' and app.sees_player(player_id));

-- A scout's ratings of a person: only members of the organisation that wrote them.
create policy own_org on scout_reports for select to authenticated using (org_id = app.org());
create policy write_own on scout_reports for insert to authenticated
  with check (org_id = app.org() and author_id = auth.uid() and app.role() in ('scout', 'agent', 'admin') and app.sees_player(player_id));
create policy edit_own on scout_reports for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and org_id = app.org());
create policy delete_own on scout_reports for delete to authenticated using (author_id = auth.uid());
create policy own_org on scout_ratings for select to authenticated
  using (exists (select 1 from scout_reports r where r.id = report_id and r.org_id = app.org()));
create policy write_own on scout_ratings for all to authenticated
  using (exists (select 1 from scout_reports r where r.id = report_id and r.author_id = auth.uid()))
  with check (exists (select 1 from scout_reports r where r.id = report_id and r.author_id = auth.uid()));

-- Requirement profiles: the shared ones, plus the organisation's own
create policy shared_or_own on requirement_profiles for select to authenticated using (org_id is null or org_id = app.org());
create policy write_own on requirement_profiles for all to authenticated
  using (org_id = app.org() or app.is_admin()) with check (org_id = app.org() or app.is_admin());
create policy via_profile on requirement_items for select to authenticated
  using (exists (select 1 from requirement_profiles p where p.id = profile_id));
create policy write_own on requirement_items for all to authenticated
  using (exists (select 1 from requirement_profiles p where p.id = profile_id and (p.org_id = app.org() or app.is_admin())))
  with check (exists (select 1 from requirement_profiles p where p.id = profile_id and (p.org_id = app.org() or app.is_admin())));

-- Workflow tables owned by a user or an organisation
create policy own on shortlists for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own on shortlist_players for all to authenticated
  using (exists (select 1 from shortlists s where s.id = shortlist_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from shortlists s where s.id = shortlist_id and s.owner_id = auth.uid()) and app.sees_player(player_id));
create policy own on saved_searches for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_org on agent_clients for all to authenticated
  using (org_id = app.org() and app.role() = 'agent') with check (org_id = app.org() and app.role() = 'agent' and app.sees_player(player_id));
create policy parties on profile_shares for select to authenticated using (from_org = app.org() or to_org = app.org());
create policy send on profile_shares for insert to authenticated
  with check (from_user = auth.uid() and from_org = app.org() and app.role() = 'agent' and app.sees_player(player_id));
create policy parties on intro_requests for select to authenticated
  using (from_org = (select app.org()) or (select is_partner_agency from orgs where id = (select app.org())) or (select app.is_admin()));
create policy request on intro_requests for insert to authenticated
  with check (from_user = auth.uid() and from_org = app.org() and app.role() = 'scout' and app.sees_player(player_id));
create policy agency_update on intro_requests for update to authenticated
  using ((select is_partner_agency from orgs where id = (select app.org()))) with check ((select is_partner_agency from orgs where id = (select app.org())));
create policy own_org on report_links for all to authenticated
  using (org_id = app.org()) with check (org_id = app.org() and created_by = auth.uid() and app.sees_player(player_id));
-- Views are written by the viewer and read only by admins; players see a count through app.view_count().
create policy write_own on profile_views for insert to authenticated with check (viewer_id = auth.uid());
create policy admin_read on profile_views for select to authenticated using (app.is_admin());
create policy admin_read on jobs for select to authenticated using (app.is_staff());

-- ---------- Workflow functions (the only way to change a profile's status) ----------
create function app.decide_approval(pid uuid, decision text, note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'only an admin can approve' using errcode = '42501'; end if;
  if decision not in ('approved', 'declined') then raise exception 'bad decision'; end if;
  insert into approvals (player_id, decision, note, decided_by) values (pid, decision, coalesce(note, ''), auth.uid());
  update players set approved_at = case when decision = 'approved' then now() end,
                     status = case when decision = 'approved' then 'live' else 'declined' end
  where id = pid and status in ('pending_approval', 'declined', 'live');
end $$;

-- Withdrawing consent hides the profile at once and queues deletion of personal data.
create function app_consent_withdrawn() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update players set status = 'withdrawn' where id = new.player_id;
    insert into jobs (kind, payload) values ('delete_personal_data', jsonb_build_object('player_id', new.player_id));
  end if;
  return new;
end $$;
create trigger consents_withdrawn after update of revoked_at on consents for each row execute function app_consent_withdrawn();

-- "12 clubs viewed you", without exposing who.
create function app.view_count(pid uuid) returns int language sql stable security definer set search_path = public as $$
  select case when app.owns_player(pid) or app.is_admin() then (select count(distinct org_id)::int from profile_views where player_id = pid) end $$;

-- Verified when every check is done.
create function app_verification_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update players set id_verified = (new.id_checked and new.photo_checked and coalesce(new.federation_registration, '') <> '')
  where id = new.player_id;
  return new;
end $$;
create trigger verifications_done after insert or update on verifications for each row execute function app_verification_done();

-- Public numbers for the landing page; no player data.
create function app.landing_stats() returns table (players int, matches int, competitions int, events int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from players where visible_to_scouts), (select count(*)::int from matches where status = 'published'),
         (select count(*)::int from competitions), (select count(*)::int from events) $$;

-- A shared report link works without login until it expires or the profile is hidden.
-- The page then renders as the link's creator, read-only, so the reader sees exactly what was shared.
create function app.shared_report(tok text) returns table (player_id uuid, profile_id uuid, created_by uuid)
language sql stable security definer set search_path = public as $$
  select l.player_id, l.profile_id, l.created_by from report_links l join players p on p.id = l.player_id
  where l.token = tok and l.expires_at > now() and p.visible_to_scouts $$;

-- A player signs up and claims the profile built from match data; an admin checks it is him before linking it.
create table profile_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  user_id uuid not null references app_users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  note text not null default '',
  created_at timestamptz not null default now(),
  decided_by uuid references app_users,
  decided_at timestamptz,
  unique (player_id, user_id)
);
alter table profile_claims enable row level security;
grant select, insert, update, delete on profile_claims to authenticated;
create policy own_or_admin on profile_claims for select to authenticated using (user_id = auth.uid() or (select app.is_admin()));
create policy claim on profile_claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and (select app.role()) in ('player', 'guardian'));

create function app.decide_claim(cid uuid, decision text, note text) returns void
language plpgsql security definer set search_path = public as $$
declare c profile_claims;
begin
  if not app.is_admin() then raise exception 'only an admin decides a claim' using errcode = '42501'; end if;
  if decision not in ('approved', 'declined') then raise exception 'bad decision'; end if;
  update profile_claims set status = decision, note = coalesce(note, ''), decided_by = auth.uid(), decided_at = now()
  where id = cid and status = 'pending' returning * into c;
  if c.id is null then raise exception 'no pending claim %', cid; end if;
  if decision = 'approved' then
    update players set claimed_by = case when (select role from app_users where id = c.user_id) = 'player' then c.user_id else claimed_by end,
                       guardian_id = case when (select role from app_users where id = c.user_id) = 'guardian' then c.user_id else guardian_id end
    where id = c.player_id;
  end if;
end $$;
grant execute on function app.decide_claim(uuid, text, text) to authenticated;
-- Claiming needs to find the profile by name, even one not live to scouts; only names and positions are exposed.
create function app.claimable_players(q text) returns table (id uuid, display_name text, primary_position text, nationality text)
language sql stable security definer set search_path = public as $$
  select id, display_name, primary_position, nationality from players
  where origin = 'match_data' and claimed_by is null and length(q) >= 3 and display_name ilike '%' || q || '%'
  order by display_name limit 20 $$;
grant execute on function app.claimable_players(text) to authenticated;

-- Column-level grants: people edit descriptive fields only. Status, approval, verification and ownership change
-- through the app.* functions and triggers above, so an owner cannot approve his own under-18 profile.
revoke update on players from authenticated;
grant update (height_cm, preferred_foot, nationality, primary_position, demo_fields, photo_url, photo_credit, photo_source_url)
  on players to authenticated;
drop policy owner_edit on players;
create policy owner_edit on players for update to authenticated
  using (app.owns_player(id) or app.is_admin() or id in (select player_id from agent_clients where org_id = (select app.org())))
  with check (app.owns_player(id) or app.is_admin() or id in (select player_id from agent_clients where org_id = (select app.org())));
-- Consent is withdrawn, never rewritten.
revoke update on consents from authenticated;
grant update (revoked_at) on consents to authenticated;
-- The agency moves a request along; it cannot change who asked or what was asked.
revoke update on intro_requests from authenticated;
grant update (status) on intro_requests to authenticated;
