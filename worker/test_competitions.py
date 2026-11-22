"""Two competitions in one database: every number is computed and ranked within its own competition."""
import os
import uuid

import pandas as pd
import psycopg
import pytest

import xt
from load_statsbomb import set_primary_positions
from metrics import compute_competition

DB = os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:54330/postgres")


@pytest.fixture
def cur():
    try:
        conn = psycopg.connect(DB, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    with conn.cursor() as c:
        yield c
    conn.rollback()
    conn.close()


def make_world(cur):
    ids = {k: uuid.uuid4() for k in ("cup", "league", "A", "B", "m1", "m2", "a", "b", "c")}
    cur.execute("insert into competitions (id, name, country, season, min_minutes) values (%s,'Cup','X','2024',1), (%s,'League','X','2025',1)",
                (ids["cup"], ids["league"]))
    cur.execute("insert into teams (id, name, country) values (%s,'A','X'), (%s,'B','X')", (ids["A"], ids["B"]))
    for p in "abc":
        cur.execute("insert into players (id, display_name) values (%s, %s)", (ids[p], f"test player {p}"))
    for m, comp in (("m1", "cup"), ("m2", "league")):
        cur.execute("insert into matches (id, competition_id, home_team_id, away_team_id, status) values (%s,%s,%s,%s,'published')",
                    (ids[m], ids[comp], ids["A"], ids["B"]))
    return ids


def lineup(cur, ids, match, player, team, position, minutes):
    cur.execute("insert into lineups (match_id, player_id, team_id, position, minutes_played) values (%s,%s,%s,%s,%s)",
                (ids[match], ids[player], ids[team], position, minutes))


def shots(cur, ids, match, player, team, n):
    for i in range(n):
        cur.execute("insert into events (match_id, player_id, team_id, period, video_seconds, type, outcome, x, y) "
                    "values (%s,%s,%s,1,%s,'shot','off_t',100,40)", (ids[match], ids[player], ids[team], i))


def test_each_competition_ranks_only_its_own_players_and_leaves_the_other_alone(cur, monkeypatch):
    monkeypatch.setattr(xt, "competition_xt", lambda cur, comp_id: pd.DataFrame(columns=["match_id", "player_id", "value"]))
    ids = make_world(cur)
    # a outshoots b in the cup and b outshoots a in the league; c plays only in the league
    for match, a, b in (("m1", 3, 1), ("m2", 1, 4)):
        lineup(cur, ids, match, "a", "A", "ST", 90)
        lineup(cur, ids, match, "b", "B", "ST", 90)
        shots(cur, ids, match, "a", "A", a)
        shots(cur, ids, match, "b", "B", b)
    lineup(cur, ids, "m2", "c", "A", "ST", 90)
    cur.execute("select key, metrics from attributes")
    attributes = dict(cur.fetchall())

    compute_competition(cur, ids["league"], 1, attributes)
    compute_competition(cur, ids["cup"], 1, attributes)
    compute_competition(cur, ids["cup"], 1, attributes)  # a re-run of one competition keeps the other's rows

    cur.execute("select c.name, m.player_id, (m.per90->>'shots')::float, (m.percentiles->>'shots')::int, m.peers "
                "from player_season_metrics m join competitions c on c.id = m.competition_id where m.competition_id = any(%s)",
                ([ids["cup"], ids["league"]],))
    rows = {(name, pid): (shots_, pct, peers) for name, pid, shots_, pct, peers in cur.fetchall()}
    assert rows[("Cup", ids["a"])] == (3.0, 100, 2) and rows[("Cup", ids["b"])] == (1.0, 50, 2)
    assert rows[("League", ids["b"])] == (4.0, 100, 3) and rows[("League", ids["a"])][:2] == (1.0, 67)
    assert ("Cup", ids["c"]) not in rows
    cur.execute("select competition_id, count(*) from player_match_index where match_id = any(%s) group by 1", ([ids["m1"], ids["m2"]],))
    assert dict(cur.fetchall()) == {ids["cup"]: 2, ids["league"]: 3}


def test_a_player_s_position_is_where_he_played_most_across_every_competition(cur):
    ids = make_world(cur)
    lineup(cur, ids, "m1", "a", "A", "CB", 90)
    lineup(cur, ids, "m2", "a", "A", "FB", 30)
    cur.execute("update players set primary_position = 'FB' where id = %s", (ids["a"],))  # as if the league were loaded last
    set_primary_positions(cur, [ids["a"]])
    cur.execute("select primary_position from players where id = %s", (ids["a"],))
    assert cur.fetchone()[0] == "CB"


def test_a_competition_with_no_shot_yet_still_computes(cur):
    # Regression: ISSUE-001 found by /qa on 2026-11-22. The first published match of a new league can hold no shot;
    # the xT surface is then all zeros and socceraction refuses to rate with NotFittedError, failing the publish job.
    ids = make_world(cur)
    cur.execute("update matches set kickoff_at = now() where id = %s", (ids["m2"],))
    lineup(cur, ids, "m2", "a", "A", "ST", 90)
    for i, (x, ex) in enumerate(((50, 80), (80, 100))):
        cur.execute("insert into events (match_id, player_id, team_id, period, video_seconds, type, outcome, x, y, end_x, end_y) "
                    "values (%s,%s,%s,1,%s,'pass','complete',%s,40,%s,40)", (ids["m2"], ids["a"], ids["A"], i * 10, x, ex))
    cur.execute("select key, metrics from attributes")
    compute_competition(cur, ids["league"], 1, dict(cur.fetchall()))
    cur.execute("select (per90->>'xt')::float from player_season_metrics where competition_id = %s", (ids["league"],))
    assert cur.fetchall() == [(0.0,)]
