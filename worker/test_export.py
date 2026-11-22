import datetime as dt
import uuid

from export_statsbomb import build_match, sid, write_layout

U = lambda n: uuid.uuid5(uuid.NAMESPACE_URL, f"test:{n}")  # noqa: E731
HOME, AWAY, COMP = U("home"), U("away"), U("comp")


def ev(n, team, player, period, secs, typ, outcome=None, x=60, y=40, end=None, body=None, **extra):
    return {"id": U(f"e{n}"), "team_id": team, "player_id": player, "period": period, "video_seconds": secs, "type": typ,
            "outcome": outcome, "x": x, "y": y, "end_x": end[0] if end else None, "end_y": end[1] if end else None,
            "body_part": body, "extra": extra, "related_event_id": None}


def fixture():
    match = {"id": U("m"), "competition_id": COMP, "kickoff_at": dt.datetime(2024, 1, 13, 20), "home_team_id": HOME,
             "away_team_id": AWAY, "competition_name": "Test Cup", "country": "Zambia", "season": "2026",
             "home_name": "Home FC", "away_name": "Away FC"}
    lineups = [{"player_id": U(f"p{i}"), "display_name": f"Player {i}", "nationality": "Zambia", "team_id": HOME if i < 11 else AWAY,
                "shirt_number": i % 11 + 1, "position": ["GK", "CB", "CB", "FB", "FB", "CM", "CM", "DM", "LW", "RW", "ST"][i % 11],
                "started": True} for i in range(22)]
    a, b = U("p10"), U("p21")
    events = [
        ev(1, HOME, a, 1, 61, "pass", "complete", end=(90, 30), body="Right Foot", cross=True, set_piece="corner"),
        ev(2, HOME, a, 1, 63, "carry", end=(100, 35)),
        ev(3, HOME, a, 1, 65, "shot", "goal", x=108, y=40, body="Left Foot", xg=0.31, first_time=True),
        ev(4, AWAY, b, 1, 120, "pass", "incomplete", end=(80, 60), body="Head"),
        ev(5, HOME, a, 1, 122, "pressure", under_pressure=True),
        ev(6, HOME, a, 2, 2800, "tackle", "won"),
        ev(7, AWAY, b, 2, 2810, "goalkeeper", "claim", gk_type="keeper_sweeper"),
        ev(8, AWAY, b, 2, 2820, "foul_committed", card="yellow_card"),
        ev(9, AWAY, b, 2, 2830, "shot", "saved", x=100, y=40, body="Right Foot", xg=0.76, set_piece="penalty"),
        ev(10, HOME, a, 2, 2840, "duel", "won", duel_type="aerial", aerial_won=True),
        ev(11, HOME, a, 2, 2841, "pass", "complete", end=(70, 40), body="Head"),
    ]
    return match, lineups, events


def test_export_reads_back_through_socceraction(tmp_path):
    from socceraction.data.statsbomb import StatsBombLoader
    import socceraction.spadl as spadl
    built = build_match(*fixture())
    write_layout(tmp_path, [built])
    loader = StatsBombLoader(getter="local", root=str(tmp_path))
    games = loader.games(sid(COMP), sid(COMP))
    assert len(games) == 1 and games.iloc[0].home_score == 1
    events = loader.events(sid(U("m")))
    actions = spadl.statsbomb.convert_to_actions(events, home_team_id=sid(HOME))
    names = spadl.add_names(actions)
    assert {"corner_crossed", "dribble", "shot", "tackle", "shot_penalty"} <= set(names.type_name)


def test_export_reads_back_through_kloppy(tmp_path):
    from kloppy import statsbomb
    built = build_match(*fixture())
    write_layout(tmp_path, [built])
    mid = sid(U("m"))
    ds = statsbomb.load(event_data=str(tmp_path / "events" / f"{mid}.json"), lineup_data=str(tmp_path / "lineups" / f"{mid}.json"))
    kinds = [e.event_type.value for e in ds.events]
    assert kinds.count("SHOT") == 2 and "PASS" in kinds and "CARRY" in kinds
    shots = [e for e in ds.events if e.event_type.value == "SHOT"]
    assert shots[0].result.value == "GOAL"


def test_a_won_aerial_duel_becomes_the_flag_on_the_next_action():
    events, _, _ = build_match(*fixture())
    assert not any(e["type"]["name"] == "Duel" and e.get("duel", {}).get("type", {}).get("name") == "Aerial Lost" and e["minute"] == 47 for e in events)
    header = next(e for e in events if e.get("id") == str(U("e11")))
    assert header["pass"]["aerial_won"] is True


def test_a_withdrawn_player_leaves_the_export_under_no_name():
    import os

    import psycopg
    import pytest

    from export_statsbomb import fetch_match
    try:
        conn = psycopg.connect(os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:54330/postgres"), connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    with conn.cursor() as cur:
        m, pid = cur.execute("select match_id, player_id from lineups limit 1").fetchone()
        cur.execute("update players set status = 'withdrawn' where id = %s", (pid,))
        _, lineups, _ = fetch_match(cur, m)
        gone = next(lu for lu in lineups if lu["player_id"] == pid)
        assert (gone["display_name"], gone["nationality"]) == ("Withdrawn player", None)
    conn.rollback()
    conn.close()
