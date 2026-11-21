import numpy as np
import pandas as pd

from metrics import KEYS, METRICS, compute_season_metrics


def ev(player, typ, **kw):
    return {"match_id": "m1", "player_id": player, "type": typ, "outcome": None,
            "x": np.nan, "y": np.nan, "end_x": np.nan, "end_y": np.nan, "extra": {}, **kw}


def lineups(rows):
    return pd.DataFrame([{"match_id": "m1", "player_id": p, "position": r, "minutes_played": m} for p, r, m in rows])


def metric(key):
    return next(m for m in METRICS if m.key == key)


def test_per90_is_count_over_minutes_times_90_and_xg_sums_extra():
    events = pd.DataFrame([ev("a", "shot", extra={"xg": 0.25}), ev("a", "shot", extra={"xg": 0.5}), ev("a", "pass", outcome="complete")])
    out = compute_season_metrics(events, lineups([("a", "RW", 45)]), 0).iloc[0]
    assert out["per90"]["shots"] == 4.0
    assert out["per90"]["xg"] == 1.5
    assert out["per90"]["passes_completed"] == 2.0


def test_cut_in_predicate():
    events = pd.DataFrame([
        ev("a", "carry", x=70, y=70, end_x=90, end_y=50),
        ev("a", "carry", x=70, y=45, end_x=90, end_y=40),
        ev("a", "carry", x=60, y=70, end_x=70, end_y=50),
    ])
    assert metric("cut_ins").value(events).tolist() == [True, False, False]


def test_percentiles_and_style_only_for_players_over_threshold():
    events = pd.DataFrame([ev("a", "shot"), ev("a", "shot"), ev("b", "shot"), ev("c", "shot")])
    out = compute_season_metrics(events, lineups([("a", "ST", 90), ("b", "ST", 90), ("c", "ST", 30)]), 90).set_index("player_id")
    assert out.loc["c", "percentiles"] == {} and out.loc["c", "style"] is None
    assert out.loc["a", "percentiles"]["shots"] == 100 and out.loc["b", "percentiles"]["shots"] == 50
    assert len(out.loc["a", "style"]) == len(KEYS)


def test_zero_std_gives_zero_z_score():
    events = pd.DataFrame([ev("a", "pass", outcome="complete"), ev("b", "pass", outcome="complete")])
    out = compute_season_metrics(events, lineups([("a", "CM", 90), ("b", "CM", 90)]), 90)
    assert all(s == [0.0] * len(KEYS) for s in out["style"])


def test_new_counting_metrics():
    events = pd.DataFrame([
        ev("a", "shot", outcome="goal", extra={"xg": 0.3, "first_time": True}),
        ev("a", "shot", outcome="saved", extra={"xg": 0.1}),
        ev("a", "shot", outcome="off_t", extra={"xg": 0.1}),
        ev("a", "pass", outcome="complete", x=10, y=40, end_x=50, end_y=40, extra={"goal_assist": True}),
        ev("a", "pressure"),
        ev("a", "ball_receipt", outcome="complete", x=110, y=40, extra={"through_ball": True}),
        ev("a", "block"),
        ev("a", "duel", outcome="lost", extra={"duel_type": "aerial_lost"}),
        ev("a", "clearance", extra={"aerial_won": True}),
        ev("a", "miscontrol"),
        ev("a", "dispossessed"),
        ev("a", "goalkeeper", outcome="success", extra={"gk_type": "shot_saved"}),
        ev("a", "goalkeeper", outcome="claim", extra={"gk_type": "keeper_sweeper"}),
        ev("a", "goalkeeper", outcome="success", extra={"gk_type": "collected"}),
    ])
    p = compute_season_metrics(events, lineups([("a", "ST", 90)]), 0).iloc[0]["per90"]
    expected = {
        "goals": 1, "assists": 1, "first_time_shots": 1, "shots_on_target": 2, "long_passes": 1, "pressures": 1,
        "through_balls_received": 1, "receptions_in_box": 1, "blocks": 1, "aerial_duels_won": 1,
        "ball_losses": 2, "saves": 1, "crosses_claimed": 2,
    }
    assert {k: p[k] for k in expected} == expected


def test_ratio_metrics_are_shares_not_per90_and_empty_under_min_denominator():
    passes = [ev("a", "pass", outcome="complete")] * 9 + [ev("a", "pass", outcome="incomplete")]
    dribbles = [ev("a", "dribble", outcome="complete"), ev("a", "dribble", outcome="failed")]
    receptions = [ev("a", "ball_receipt", outcome="complete", extra={"under_pressure": True})] * 8
    lost = [ev("a", "miscontrol", extra={"under_pressure": True}), ev("a", "miscontrol", extra={"under_pressure": True})]
    events = pd.DataFrame(passes + dribbles + receptions + lost)
    p = compute_season_metrics(events, lineups([("a", "CM", 45)]), 0).iloc[0]["per90"]
    assert p["pass_accuracy_pct"] == 90.0  # minutes do not scale a share
    assert p["first_touch_under_pressure_pct"] == 75.0
    assert p["dribble_success_pct"] is None  # 2 attempts is under the minimum
    assert p["tackle_success_pct"] is None


def test_missing_ratio_gets_no_percentile_and_neutral_style():
    events = pd.DataFrame([ev("a", "pass", outcome="complete")] * 10 + [ev("b", "pass", outcome="incomplete")])
    out = compute_season_metrics(events, lineups([("a", "CM", 90), ("b", "CM", 90)]), 90).set_index("player_id")
    assert "pass_accuracy_pct" in out.loc["a", "percentiles"]
    assert "pass_accuracy_pct" not in out.loc["b", "percentiles"]
    assert len(out.loc["b", "style"]) == len(KEYS)


def test_style_vector_size_in_migrations_matches_keys():
    import pathlib
    import re
    sql = "".join(p.read_text() for p in sorted(pathlib.Path(__file__).parent.parent.joinpath("supabase/migrations").glob("*.sql")))
    assert int(re.findall(r"style (?:type )?vector\((\d+)\)", sql)[-1]) == len(KEYS)


def test_attribute_percentile_ranks_the_mean_of_stand_in_percentiles_within_role():
    from metrics import attribute_percentiles
    out = pd.DataFrame([
        {"role": "ST", "percentiles": {"goals": 100, "xg": 90}},
        {"role": "ST", "percentiles": {"goals": 50, "xg": 40}},
        {"role": "ST", "percentiles": {"goals": 10}},
        {"role": "ST", "percentiles": {}},
        {"role": "CB", "percentiles": {"goals": 5, "xg": 5}},
    ])
    res = attribute_percentiles(out, {"finishing": ["goals", "xg"], "link_up": []})
    assert [r.get("finishing") for r in res] == [100, 67, 33, None, 100]
    assert all("link_up" not in r for r in res)


def test_attribute_metrics_exist_in_registry():
    import pathlib
    import re
    sql = pathlib.Path(__file__).parent.parent.joinpath("supabase/migrations/20261121000000_phase1_scouting.sql").read_text()
    arrays = re.findall(r"'(?:technical|physical|tactical|mental)', '\w+', '\{([a-z_0-9,]*)\}'", sql)
    assert len(arrays) == 30
    assert {k for a in arrays for k in a.split(",") if k} <= set(KEYS)
