import json
import os
import uuid

import psycopg
import pytest

from seed_demo import did

DB = os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:54330/postgres")


@pytest.fixture
def cur():
    try:
        conn = psycopg.connect(DB, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    with conn.cursor() as c:
        c.execute("select count(*) from app_users where is_demo")
        if c.fetchone()[0] == 0:
            pytest.skip("demo seed not loaded")
        yield c
    conn.rollback()
    conn.close()


def act_as(cur, key=None):
    cur.execute("reset role")
    uid = str(did("user", key)) if key else None
    cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": uid} if uid else {}),))
    cur.execute(f"set local role {'authenticated' if key else 'anon'}")


def one(cur, q, *args):
    cur.execute(q, args)
    return cur.fetchone()[0]


def test_every_public_table_has_rls_and_a_policy(cur):
    cur.execute("""select t.tablename from pg_tables t where t.schemaname = 'public'
                   and (not t.rowsecurity or not exists (select 1 from pg_policies p where p.tablename = t.tablename))""")
    assert cur.fetchall() == []


def test_anon_sees_nothing_private(cur):
    act_as(cur)
    for t in ("players", "player_season_metrics", "events", "scout_reports", "player_identity", "consents"):
        try:
            assert one(cur, f"select count(*) from {t}") == 0
        except psycopg.errors.InsufficientPrivilege:
            cur.connection.rollback()
            act_as(cur)


def test_scout_sees_live_players_but_never_identity_or_pending(cur):
    live = one(cur, "select count(*) from players where status = 'live'")
    act_as(cur, "scout")
    assert one(cur, "select count(*) from players") == live
    assert one(cur, "select count(*) from players where status = 'pending_approval'") == 0
    assert one(cur, "select count(*) from player_identity") == 0
    assert one(cur, "select count(*) from player_season_metrics") > 0


def test_scout_ratings_are_visible_only_to_the_writing_organisation(cur):
    act_as(cur, "scout")
    mine = one(cur, "select count(*) from scout_reports")
    assert mine > 0
    assert one(cur, "select count(*) from scout_reports where org_id <> %s", did("org", "club")) == 0
    assert one(cur, "select count(*) from scout_ratings r join scout_reports s on s.id = r.report_id where s.org_id <> %s", did("org", "club")) == 0
    act_as(cur, "agent")
    assert one(cur, "select count(*) from scout_reports") == 0


def test_scout_cannot_write_a_report_for_another_organisation(cur):
    act_as(cur, "scout")
    pid = one(cur, "select id from players limit 1")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("insert into scout_reports (player_id, org_id, author_id, recommendation) values (%s,%s,%s,'sign')",
                    (pid, did("org", "club2"), did("user", "scout")))


def test_coverage_gates_match_data(cur):
    org, user = uuid.uuid4(), uuid.uuid4()
    cur.execute("insert into orgs (id, name, kind) values (%s, 'Uncovered club', 'club')", (org,))
    cur.execute("insert into auth.users (id) values (%s)", (user,))
    cur.execute("insert into app_users (id, org_id, role) values (%s, %s, 'scout')", (user, org))
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(user)}),))
    cur.execute("set local role authenticated")
    assert one(cur, "select count(*) from player_season_metrics") == 0
    assert one(cur, "select count(*) from events") == 0
    assert one(cur, "select count(*) from matches") == 0


def test_withdrawing_consent_hides_the_profile_at_once_and_queues_deletion(cur):
    kofi = did("signup", "kofi")
    act_as(cur, "scout")
    assert one(cur, "select count(*) from players where id = %s", kofi) == 1
    act_as(cur, "player")
    cur.execute("update consents set revoked_at = now() where player_id = %s", (kofi,))
    act_as(cur, "scout")
    assert one(cur, "select count(*) from players where id = %s", kofi) == 0
    cur.execute("reset role")
    assert one(cur, "select count(*) from jobs where kind = 'delete_personal_data' and payload->>'player_id' = %s", str(kofi)) == 1


def test_under_18_waits_for_an_admin(cur):
    yaw = did("signup", "yaw")
    act_as(cur, "scout")
    assert one(cur, "select count(*) from players where id = %s", yaw) == 0
    act_as(cur, "guardian")
    assert one(cur, "select status from players where id = %s", yaw) == "pending_approval"
    act_as(cur, "scout")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("select app.decide_approval(%s, 'approved', 'ok')", (yaw,))
    cur.connection.rollback()
    act_as(cur, "admin")
    cur.execute("select app.decide_approval(%s, 'approved', 'Guardian consent checked')", (yaw,))
    act_as(cur, "scout")
    assert one(cur, "select count(*) from players where id = %s", yaw) == 1


def test_players_see_only_their_own_profile(cur):
    act_as(cur, "player")
    assert one(cur, "select count(*) from players") == 1
    assert one(cur, "select count(*) from player_identity") == 1
    assert one(cur, "select count(*) from scout_reports") == 0


def test_profile_views_are_counted_by_club_without_exposing_who(cur):
    kofi = did("signup", "kofi")
    act_as(cur, "scout")
    cur.execute("insert into profile_views (viewer_id, player_id, org_id) values (%s,%s,%s)", (did("user", "scout"), kofi, did("org", "club")))
    assert one(cur, "select count(*) from profile_views") == 0
    assert one(cur, "select app.view_count(%s)", kofi) is None
    act_as(cur, "player")
    assert one(cur, "select app.view_count(%s)", kofi) == 1


def test_an_owner_cannot_approve_his_own_profile_or_rewrite_consent(cur):
    yaw = did("signup", "yaw")
    act_as(cur, "guardian")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("update players set status = 'live', approved_at = now() where id = %s", (yaw,))
    cur.connection.rollback()
    act_as(cur, "guardian")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("update consents set scope = '{everything}' where player_id = %s", (yaw,))
    cur.connection.rollback()
    act_as(cur, "guardian")
    cur.execute("update players set height_cm = 170 where id = %s", (yaw,))
    assert cur.rowcount == 1


def test_an_agent_edits_his_clients_details_but_not_their_status(cur):
    act_as(cur, "agent")
    client = one(cur, "select player_id from agent_clients limit 1")
    cur.execute("update players set height_cm = 181 where id = %s", (client,))
    assert cur.rowcount == 1
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("update players set id_verified = true where id = %s", (client,))


def test_a_federation_verifies_only_players_in_its_own_competitions(cur):
    outsider = uuid.uuid4()
    cur.execute("insert into players (id, display_name) values (%s, 'Outside player')", (outsider,))
    act_as(cur, "federation")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("insert into physical_tests (player_id, test, value, unit, tested_at, verified) "
                    "values (%s, 'sprint_30m', 4.1, 's', current_date, true)", (outsider,))


def test_test_percentiles_do_not_depend_on_who_is_looking(cur):
    pid = one(cur, "select t.player_id from physical_tests t join players p on p.id = t.player_id "
                   "where t.test = 'sprint_30m' and p.status = 'live' and p.claimed_by is null limit 1")
    act_as(cur, "scout")
    as_scout = one(cur, "select pct from app.test_percentiles(%s) where test = 'sprint_30m'", [pid])
    act_as(cur, "admin")
    as_admin = one(cur, "select pct from app.test_percentiles(%s) where test = 'sprint_30m'", [pid])
    assert as_scout == as_admin is not None
    act_as(cur, "player")
    assert one(cur, "select count(*) from app.test_percentiles(%s)", [pid]) == 0


def test_an_admin_approves_a_profile_claim_and_it_links(cur):
    pid = one(cur, "select id from players where origin = 'match_data' and claimed_by is null limit 1")
    cur.execute("insert into profile_claims (id, player_id, user_id) values (gen_random_uuid(), %s, %s) returning id", (pid, did("user", "player")))
    claim = cur.fetchone()[0]
    act_as(cur, "player")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("select app.decide_claim(%s, 'approved', 'self')", (claim,))
    cur.connection.rollback()
    cur.execute("insert into profile_claims (id, player_id, user_id) values (%s, %s, %s)", (claim, pid, did("user", "player")))
    act_as(cur, "admin")
    cur.execute("select app.decide_claim(%s, 'approved', 'Matched passport to federation record')", (claim,))
    cur.execute("reset role")
    assert one(cur, "select claimed_by from players where id = %s", pid) == did("user", "player")
    assert one(cur, "select note from profile_claims where id = %s", claim) == "Matched passport to federation record"


def test_the_anonymous_claim_search_shows_only_live_unclaimed_profiles(cur):
    pid, name = cur.execute("select id, display_name from players where origin = 'match_data' and claimed_by is null "
                            "and status = 'live' order by display_name limit 1").fetchone()
    cur.execute("update players set status = 'withdrawn' where id = %s", (pid,))
    act_as(cur)
    assert one(cur, "select count(*) from app.claimable_players(%s) where id = %s", name, pid) == 0
    assert one(cur, "select count(*) from app.claimable_players('___')") == 0


def test_an_agent_edits_market_data_only_after_the_player_confirms_him(cur):
    pid = one(cur, "select id from players where status = 'live' and claimed_by is null "
                   "and id not in (select player_id from agent_clients) limit 1")
    upsert = ("insert into player_market (player_id, representative) values (%s, 'Self-appointed') "
              "on conflict (player_id) do update set representative = excluded.representative")
    act_as(cur, "agent")
    cur.execute("insert into agent_clients (org_id, player_id) values (app.org(), %s)", (pid,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute(upsert, (pid,))
    cur.connection.rollback()
    act_as(cur, "agent")
    cur.execute("insert into agent_clients (org_id, player_id) values (app.org(), %s)", (pid,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("update agent_clients set confirmed_at = now() where player_id = %s", (pid,))
    cur.connection.rollback()
    act_as(cur, "agent")
    cur.execute("insert into agent_clients (org_id, player_id) values (app.org(), %s)", (pid,))
    act_as(cur, "admin")
    cur.execute("select app.confirm_agent(%s, %s)", (did("org", "agency"), pid))
    act_as(cur, "agent")
    cur.execute(upsert, (pid,))
    assert cur.rowcount == 1


def test_scouts_never_read_verification_details(cur):
    assert one(cur, "select count(*) from verifications v join players p on p.id = v.player_id where p.status = 'live'") > 0
    act_as(cur, "scout")
    assert one(cur, "select count(*) from verifications") == 0


def test_a_federation_loses_a_withdrawn_player_at_once(cur):
    act_as(cur, "federation")
    pid = one(cur, "select * from app.federation_players() limit 1")
    cur.execute("reset role")
    cur.execute("update players set status = 'withdrawn' where id = %s", (pid,))
    act_as(cur, "federation")
    assert one(cur, "select count(*) from app.federation_players() f where f = %s", pid) == 0
    assert one(cur, "select count(*) from player_identity where player_id = %s", pid) == 0
    act_as(cur, "federation")
    assert one(cur, "select count(*) from (select app.federation_players() except select id from players) x") == 0


def test_a_claimed_profile_cannot_be_claimed_again(cur):
    pid = one(cur, "select id from players where origin = 'match_data' and claimed_by is null and status = 'live' limit 1")
    first = uuid.uuid4()
    cur.execute("insert into auth.users (id, email) values (%s, %s)", (first, f"{first}@test.scout"))
    cur.execute("insert into app_users (id, role) values (%s, 'player')", (first,))
    cur.execute("update players set claimed_by = %s where id = %s", (first, pid))
    claim = one(cur, "insert into profile_claims (player_id, user_id) values (%s, %s) returning id", pid, did("user", "player"))
    act_as(cur, "admin")
    with pytest.raises(psycopg.errors.RaiseException):
        cur.execute("select app.decide_claim(%s, 'approved', '')", (claim,))


def test_a_shared_report_link_dies_when_its_author_leaves_the_organisation(cur):
    pid = one(cur, "select id from players where status = 'live' limit 1")
    cur.execute("insert into report_links (token, player_id, org_id, created_by, expires_at) "
                "values ('t' || md5(random()::text), %s, %s, %s, now() + interval '1 day') returning token",
                (pid, did("org", "club"), did("user", "scout")))
    token = cur.fetchone()[0]
    cur.execute("update app_users set active = false where id = %s", (did("user", "scout"),))
    act_as(cur)
    assert one(cur, "select count(*) from app.shared_report(%s)", token) == 0


def test_a_coordinator_sees_only_the_squads_of_his_assigned_matches_never_withdrawn(cur):
    me = did("user", "coordinator")
    cur.execute("""select distinct s.player_id from match_assignments a join matches m on m.id = a.match_id
                   join squad_members s on s.team_id in (m.home_team_id, m.away_team_id)
                   where a.user_id = %s and a.task = 'coordinator'""", (me,))
    squad = {r[0] for r in cur.fetchall()}
    assert squad
    cur.execute("select id from players where academy_org_id = (select org_id from app_users where id = %s)", (me,))
    academy = {r[0] for r in cur.fetchall()}
    gone = next(iter(squad - academy))
    cur.execute("update players set status = 'withdrawn' where id = %s", (gone,))
    act_as(cur, "coordinator")
    cur.execute("select id from players")
    assert {r[0] for r in cur.fetchall()} == (squad | academy) - {gone}


def test_only_an_adult_player_his_guardian_or_an_admin_confirms_an_agent(cur):
    pid = one(cur, "select id from players where academy_org_id is not null and claimed_by is null and guardian_id is null limit 1")
    cur.execute("insert into agent_clients (org_id, player_id) values (%s, %s) on conflict do nothing", (did("org", "agency"), pid))
    act_as(cur, "coach")
    assert one(cur, "select app.owns_player(%s)", pid)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("select app.confirm_agent(%s, %s)", (did("org", "agency"), pid))


MATCH_TABLES = {"matches", "lineups", "squad_members", "events", "imports", "qc_samples", "qc_runs"}
MATCH_WRITES = {
    "matches": "update matches set periods = periods where id = %(m)s",
    "lineups": "insert into lineups (match_id, team_id, player_id) values (%(m)s, %(team)s, %(player)s)",
    "squad_members": "update squad_members set shirt_number = shirt_number where team_id = %(team)s",
    "events": "insert into events (match_id, team_id, period, video_seconds, type, source) values (%(m)s, %(team)s, 1, 0, 'pass', 'manual')",
    "imports": "insert into imports (match_id, format, filename, rows_imported, created_by) values (%(m)s, 'csv', 'x.csv', 0, auth.uid())",
    "qc_samples": "insert into qc_samples (match_id, period, start_seconds, end_seconds) values (%(m)s, 1, 0, 60)",
    "qc_runs": "insert into qc_runs (match_id, primary_count, review_count, agreed, agreement, passed, flags) "
               "values (%(m)s, 1, 1, 1, 1, true, 0)",
}


def stranger_match(cur):
    """A match in the demo league, between two new teams, that nobody is assigned to."""
    m, home, away = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    cur.execute("insert into teams (id, name, country) values (%s, 'Stranger home', 'Zambia'), (%s, 'Stranger away', 'Zambia')", (home, away))
    cur.execute("insert into matches (id, competition_id, home_team_id, away_team_id) values (%s, %s, %s, %s)",
                (m, did("comp", "demo"), home, away))
    cur.execute("insert into squad_members (team_id, player_id) values (%s, %s)", (home, did("demo-player", "away", 0)))
    return m


def writable(cur, key, m):
    """The match tables `key` can change for match `m`, each write tried in its own savepoint."""
    cur.execute("reset role")
    cur.execute("update matches set status = 'tagging' where id = %s", (m,))
    cur.execute("delete from qc_samples where match_id = %s", (m,))
    team, player = cur.execute("select s.team_id, s.player_id from matches m join squad_members s on s.team_id = m.home_team_id "
                               "where m.id = %s and s.player_id not in (select player_id from lineups where match_id = m.id) limit 1",
                               (m,)).fetchone()
    act_as(cur, key)
    done = set()
    for table, q in MATCH_WRITES.items():
        cur.execute("savepoint w")
        try:
            cur.execute(q, {"m": m, "team": team, "player": player})
            if cur.rowcount > 0:
                done.add(table)
        except psycopg.errors.InsufficientPrivilege:
            pass
        cur.execute("rollback to savepoint w")
    return done


@pytest.mark.parametrize("key, tables", [
    ("analyst", {"matches", "events", "imports"}),
    ("analyst2", {"qc_samples", "qc_runs"}),
    ("coordinator", {"matches", "lineups", "squad_members"}),
    ("admin", MATCH_TABLES),
])
def test_staff_change_match_data_only_for_the_task_they_are_assigned(cur, key, tables):
    stranger = stranger_match(cur)
    assert writable(cur, key, did("match", "demo")) == tables
    assert writable(cur, key, stranger) == (MATCH_TABLES if key == "admin" else set())


def test_a_match_is_published_only_through_the_quality_check(cur):
    cur.execute("update matches set status = 'review' where id = %s", (did("match", "demo"),))
    for key in ("analyst", "coordinator", "admin"):
        act_as(cur, key)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute("update matches set status = 'published' where id = %s", (did("match", "demo"),))
        cur.connection.rollback()


def test_a_tagger_lists_only_the_matches_assigned_to_him(cur):
    stranger = stranger_match(cur)
    cur.execute("select match_id from match_assignments where user_id = %s", (did("user", "analyst"),))
    mine = {r[0] for r in cur.fetchall()}
    assert did("match", "demo") in mine
    act_as(cur, "analyst")
    cur.execute("select id from matches")
    assert {r[0] for r in cur.fetchall()} == mine
    assert one(cur, "select count(*) from events where match_id = %s", stranger) == 0


def export_jobs(cur, m):
    cur.execute("reset role")
    return one(cur, "select count(*) from jobs where kind = 'export_match' and status = 'queued' and payload = %s::jsonb",
               json.dumps({"match_id": str(m)}))


@pytest.mark.parametrize("key", ["analyst2", "admin"])
def test_the_reviewer_or_an_admin_queues_one_export(cur, key):
    m = did("match", "demo")
    cur.execute("delete from jobs where kind = 'export_match'")
    act_as(cur, key)
    cur.execute("select app.request_export(%s)", (m,))
    cur.execute("select app.request_export(%s)", (m,))
    assert export_jobs(cur, m) == 1


@pytest.mark.parametrize("key", ["analyst", "coordinator", "scout"])
def test_nobody_else_queues_an_export(cur, key):
    act_as(cur, key)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        cur.execute("select app.request_export(%s)", (did("match", "demo"),))
