"""Row-level security audit: every table has RLS and a policy, and each user type sees only what section 4 allows.

Integration test against the running database with the demo seed; each test runs in a transaction that is rolled back.
"""
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
    """Become a demo user (or anon) the way the web app does: a role plus the user id in the JWT claims."""
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
