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
        ev("a", "goalkeeper", outcome="fail", extra={"gk_type": "collected"}),
        ev("a", "goalkeeper", outcome="saved_twice", extra={"gk_type": "penalty_saved"}),
        ev("a", "ball_receipt", outcome="incomplete", x=50, y=40, extra={"through_ball": True}),
    ])
    p = compute_season_metrics(events, lineups([("a", "ST", 90)]), 0).iloc[0]["per90"]
    expected = {
        "goals": 1, "assists": 1, "first_time_shots": 1, "shots_on_target": 2, "long_passes": 1, "pressures": 1,
        "through_balls_received": 1, "receptions_in_box": 1, "blocks": 1, "aerial_duels_won": 1,
        "ball_losses": 2, "saves": 2, "crosses_claimed": 1,
    }
    assert {k: p[k] for k in expected} == expected


def test_ratio_metrics_are_shares_not_per90_and_empty_under_min_denominator():
    passes = [ev("a", "pass", outcome="complete")] * 9 + [ev("a", "pass", outcome="incomplete")]
    dribbles = [ev("a", "dribble", outcome="complete"), ev("a", "dribble", outcome="failed")]
    receptions = [ev("a", "ball_receipt", outcome="complete", extra={"under_pressure": True})] * 8
    lost = [ev("a", "miscontrol", extra={"under_pressure": True}), ev("a", "miscontrol", extra={"under_pressure": True})]
    events = pd.DataFrame(passes + dribbles + receptions + lost)
    p = compute_season_metrics(events, lineups([("a", "CM", 45)]), 0).iloc[0]["per90"]
    assert p["pass_accuracy_pct"] == 90.0
    assert p["first_touch_under_pressure_pct"] == 75.0
    assert p["dribble_success_pct"] is None
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
        {"role": "ST", "percentiles": {"goals": 100, "xg": 90}, "per90": {"goals": 1.0, "xg": 0.8}},
        {"role": "ST", "percentiles": {"goals": 50, "xg": 40}, "per90": {"goals": 0.5, "xg": 0.3}},
        {"role": "ST", "percentiles": {"goals": 10}, "per90": {"goals": 0.1}},
        {"role": "ST", "percentiles": {}, "per90": {}},
        {"role": "CB", "percentiles": {"goals": 5, "xg": 5}, "per90": {"goals": 0.1, "xg": 0.1}},
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


def test_match_index_ranks_each_match_within_role_and_marks_stronger_opponents():
    from metrics import match_index
    events = pd.DataFrame([
        {**ev("a", "shot", outcome="goal"), "match_id": "m1", "team_id": "A"},
        {**ev("a", "shot"), "match_id": "m1", "team_id": "A"},
        {**ev("b", "shot", outcome="goal"), "match_id": "m2", "team_id": "B"},
        {**ev("c", "shot", outcome="goal"), "match_id": "m2", "team_id": "B"},
        {**ev("a", "pass", outcome="complete"), "match_id": "m2", "team_id": "A"},
    ])
    lu = pd.DataFrame([
        {"match_id": "m1", "player_id": "a", "team_id": "A", "position": "ST", "minutes_played": 90},
        {"match_id": "m1", "player_id": "x", "team_id": "C", "position": "ST", "minutes_played": 90},
        {"match_id": "m2", "player_id": "a", "team_id": "A", "position": "ST", "minutes_played": 90},
        {"match_id": "m2", "player_id": "b", "team_id": "B", "position": "ST", "minutes_played": 90},
        {"match_id": "m2", "player_id": "c", "team_id": "B", "position": "ST", "minutes_played": 20},
    ])
    matches = pd.DataFrame([{"id": "m1", "home_team_id": "A", "away_team_id": "C"}, {"id": "m2", "home_team_id": "A", "away_team_id": "B"}])
    out = match_index(events, lu, matches).set_index(["player_id", "match_id"])
    assert ("c", "m2") not in out.index
    assert out.loc[("a", "m1"), "index"] > out.loc[("x", "m1"), "index"]
    assert out.loc[("a", "m1"), "index"] == 100 and 0 <= out.loc[("x", "m1"), "index"] <= 100
    assert bool(out.loc[("a", "m2"), "opponent_stronger"]) and not bool(out.loc[("a", "m1"), "opponent_stronger"])
    assert out.loc[("a", "m2"), "opponent_team_id"] == "B"


def test_ball_losses_count_against_the_match_index():
    from metrics import match_index
    events = pd.DataFrame([{**ev("a", "miscontrol"), "team_id": "A"}, {**ev("a", "dispossessed"), "team_id": "A"}])
    lu = pd.DataFrame([
        {"match_id": "m1", "player_id": "a", "team_id": "A", "position": "CM", "minutes_played": 90},
        {"match_id": "m1", "player_id": "b", "team_id": "B", "position": "CM", "minutes_played": 90},
    ])
    out = match_index(events, lu, pd.DataFrame([{"id": "m1", "home_team_id": "A", "away_team_id": "B"}])).set_index("player_id")
    assert out.loc["a", "index"] < out.loc["b", "index"]


def test_age_band_percentiles_rank_within_role_and_band():
    from metrics import age_band, band_percentiles
    assert [age_band(a) for a in (15, 16, 17, 18, 19, 20, 21, None)] == ["U17", "U17", "U19", "U19", "U21", "U21", "senior", None]
    events = pd.DataFrame([ev("a", "shot"), ev("a", "shot"), ev("b", "shot"), ev("c", "shot"), ev("c", "shot"), ev("c", "shot")])
    res = compute_season_metrics(events, lineups([("a", "ST", 90), ("b", "ST", 90), ("c", "ST", 90)]), 90)
    bands = band_percentiles(res, {"a": 2007, "b": 2007, "c": 1995}, 2026).set_index(res["player_id"])
    assert bands.loc["a", "age_band"] == "U21" and bands.loc["a", "band_peers"] == 2
    assert bands.loc["a", "band_percentiles"]["shots"] == 100 and bands.loc["b", "band_percentiles"]["shots"] == 50
    assert bands.loc["c", "band_peers"] == 1


def test_value_metric_is_per90_by_role_and_ranked():
    from metrics import add_value_metric
    res = compute_season_metrics(pd.DataFrame([ev("a", "pass"), ev("b", "pass")]), lineups([("a", "CM", 90), ("b", "CM", 45)]), 0)
    per_match = pd.DataFrame([{"match_id": "m1", "player_id": "a", "value": 0.2}, {"match_id": "m1", "player_id": "b", "value": 0.2}])
    out = add_value_metric(res, lineups([("a", "CM", 90), ("b", "CM", 45)]), per_match, "xt").set_index("player_id")
    assert out.loc["a", "per90"]["xt"] == 0.2 and out.loc["b", "per90"]["xt"] == 0.4
    assert out.loc["b", "percentiles"]["xt"] == 100 and out.loc["a", "percentiles"]["xt"] == 50


def test_a_value_metric_is_ranked_within_the_age_band_too():
    from metrics import add_value_metric, band_percentiles
    lu = lineups([("a", "CM", 90), ("b", "CM", 45)])
    res = compute_season_metrics(pd.DataFrame([ev("a", "pass"), ev("b", "pass")]), lu, 0)
    per_match = pd.DataFrame([{"match_id": "m1", "player_id": "a", "value": 0.2}, {"match_id": "m1", "player_id": "b", "value": 0.2}])
    res = add_value_metric(res, lu, per_match, "xt")
    bands = band_percentiles(res, {"a": 2007, "b": 2007}, 2026).set_index(res["player_id"])
    assert bands.loc["b", "band_percentiles"]["xt"] == 100 and bands.loc["a", "band_percentiles"]["xt"] == 50


def test_a_measure_most_of_the_position_never_records_gives_no_attribute_evidence():
    from metrics import attribute_percentiles
    out = pd.DataFrame([
        {"role": "GK", "percentiles": {"dribbles_completed": 100, "saves": 40}, "per90": {"dribbles_completed": 0.2, "saves": 2.0}},
        {"role": "GK", "percentiles": {"dribbles_completed": 50, "saves": 90}, "per90": {"dribbles_completed": 0.0, "saves": 3.5}},
        {"role": "GK", "percentiles": {"dribbles_completed": 50, "saves": 60}, "per90": {"dribbles_completed": 0.0, "saves": 2.5}},
    ])
    res = attribute_percentiles(out, {"dribbling": ["dribbles_completed"], "shot_stopping": ["saves"]})
    assert all("dribbling" not in r for r in res)
    assert [r["shot_stopping"] for r in res] == [33, 100, 67]
