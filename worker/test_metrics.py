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
    assert len(out.loc["a", "style"]) == len(KEYS) == 16


def test_zero_std_gives_zero_z_score():
    events = pd.DataFrame([ev("a", "pass", outcome="complete"), ev("b", "pass", outcome="complete")])
    out = compute_season_metrics(events, lineups([("a", "CM", 90), ("b", "CM", 90)]), 90)
    assert all(s == [0.0] * 16 for s in out["style"])
