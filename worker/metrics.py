import argparse
import os
from typing import Callable, NamedTuple

import pandas as pd
import psycopg
from psycopg.types.json import Jsonb

DEFAULT_DB = "postgres://postgres:postgres@localhost:54330/postgres"
WON = {"won", "success_in_play", "success_out"}
ON_TARGET = {"goal", "saved", "saved_to_post"}
LONG_PASS = 32  # pitch units (yards on the StatsBomb pitch)
TOUCH_TYPES = {"pass", "carry", "shot", "dribble", "ball_recovery", "interception", "tackle", "clearance", "duel"}


class Metric(NamedTuple):
    key: str
    label: str
    value: Callable[[pd.DataFrame], pd.Series]  # per-event contribution: a bool mask counts, xg sums


def _is(t):
    return lambda d: d["type"] == t


def _extra_flag(d, key):
    return d["extra"].map(lambda e: bool(e.get(key)))


def _progressive(d):
    return (d["end_x"] - d["x"] >= 12) & (d["end_x"] >= 60)


def _extra_is(d, key, values):
    return d["extra"].map(lambda e: e.get(key) in values)


def _length(d):
    return ((d["end_x"] - d["x"]) ** 2 + (d["end_y"] - d["y"]) ** 2) ** 0.5


def _in_box(d):
    return (d["x"] >= 102) & d["y"].between(18, 62)


def _cut_in(d):
    return (d["type"] == "carry") & (d["y"] >= 62) & d["end_y"].between(30, 62) & (d["end_x"] >= 80)


METRICS = [
    Metric("touches", "Touches", lambda d: d["type"].isin(TOUCH_TYPES) | ((d["type"] == "ball_receipt") & (d["outcome"] == "complete"))),
    Metric("passes", "Passes", _is("pass")),
    Metric("passes_completed", "Passes completed", lambda d: (d["type"] == "pass") & (d["outcome"] == "complete")),
    Metric("progressive_passes", "Progressive passes", lambda d: (d["type"] == "pass") & _progressive(d)),
    Metric("key_passes", "Key passes", lambda d: (d["type"] == "pass") & (_extra_flag(d, "shot_assist") | _extra_flag(d, "goal_assist"))),
    Metric("crosses", "Crosses", lambda d: (d["type"] == "pass") & _extra_flag(d, "cross")),
    Metric("carries", "Carries", _is("carry")),
    Metric("progressive_carries", "Progressive carries", lambda d: (d["type"] == "carry") & _progressive(d)),
    Metric("cut_ins", "Cut-ins", _cut_in),
    Metric("dribbles_completed", "Dribbles completed", lambda d: (d["type"] == "dribble") & (d["outcome"] == "complete")),
    Metric("shots", "Shots", _is("shot")),
    Metric("xg", "xG", lambda d: d["extra"].map(lambda e: e.get("xg") or 0.0).where(d["type"] == "shot", 0.0)),
    Metric("ball_recoveries", "Ball recoveries", _is("ball_recovery")),
    Metric("interceptions", "Interceptions", _is("interception")),
    Metric("tackles_won", "Tackles won", lambda d: (d["type"] == "tackle") & d["outcome"].isin(WON)),
    Metric("duels_won", "Duels won", lambda d: d["type"].isin(["duel", "tackle"]) & d["outcome"].isin(WON)),
    Metric("goals", "Goals", lambda d: (d["type"] == "shot") & (d["outcome"] == "goal")),
    Metric("assists", "Assists", lambda d: (d["type"] == "pass") & _extra_flag(d, "goal_assist")),
    Metric("first_time_shots", "First-time shots", lambda d: (d["type"] == "shot") & _extra_flag(d, "first_time")),
    Metric("shots_on_target", "Shots on target", lambda d: (d["type"] == "shot") & d["outcome"].isin(ON_TARGET)),
    Metric("long_passes", "Long passes", lambda d: (d["type"] == "pass") & (_length(d) >= LONG_PASS)),
    Metric("pressures", "Pressures", _is("pressure")),
    Metric("through_balls_received", "Through balls received", lambda d: (d["type"] == "ball_receipt") & _extra_flag(d, "through_ball")),
    Metric("receptions_in_box", "Receptions in the box",
           lambda d: (d["type"] == "ball_receipt") & (d["outcome"] == "complete") & _in_box(d)),
    Metric("blocks", "Blocks", _is("block")),
    Metric("aerial_duels_won", "Aerial duels won", lambda d: _extra_flag(d, "aerial_won")),
    Metric("ball_losses", "Ball losses", lambda d: d["type"].isin(["miscontrol", "dispossessed"])),
    Metric("saves", "Saves", lambda d: (d["type"] == "goalkeeper") & d["extra"].map(lambda e: str(e.get("gk_type", "")).startswith("shot_saved"))),
    Metric("crosses_claimed", "Crosses claimed",
           lambda d: (d["type"] == "goalkeeper") & (_extra_is(d, "gk_type", {"collected"}) | (d["outcome"] == "claim"))),
]


class Ratio(NamedTuple):
    key: str
    label: str
    num: Callable[[pd.DataFrame], pd.Series]
    den: Callable[[pd.DataFrame], pd.Series]
    min_den: int  # below this many attempts the share is noise, so it is left empty


def _under_pressure(d):
    return _extra_flag(d, "under_pressure")


# Shares in percent (0..100), not per 90. Keys end in _pct so the web app labels them as shares.
RATIOS = [
    Ratio("pass_accuracy_pct", "Pass accuracy", lambda d: (d["type"] == "pass") & (d["outcome"] == "complete"), _is("pass"), 10),
    Ratio("dribble_success_pct", "Dribble success", lambda d: (d["type"] == "dribble") & (d["outcome"] == "complete"), _is("dribble"), 5),
    Ratio("tackle_success_pct", "Tackle success", lambda d: (d["type"] == "tackle") & d["outcome"].isin(WON), _is("tackle"), 5),
    # Kept = received under pressure without a miscontrol under pressure. Partly match data: a heavy touch
    # that still leads to a dispossession a second later is not counted as a lost reception.
    Ratio("first_touch_under_pressure_pct", "First touch under pressure",
          lambda d: ((d["type"] == "ball_receipt") & (d["outcome"] == "complete") & _under_pressure(d)).astype(float)
          - ((d["type"] == "miscontrol") & _under_pressure(d)).astype(float),
          lambda d: (d["type"] == "ball_receipt") & (d["outcome"] == "complete") & _under_pressure(d), 5),
]
KEYS = [m.key for m in METRICS] + [r.key for r in RATIOS]


def compute_season_metrics(events: pd.DataFrame, lineups: pd.DataFrame, min_minutes: int) -> pd.DataFrame:
    """events: match_id, player_id, type, outcome, x, y, end_x, end_y, extra(dict).
    lineups: match_id, player_id, position (role), minutes_played.
    Events are attributed to the role the player held in that match."""
    ev = events.merge(lineups[["match_id", "player_id", "position"]], on=["match_id", "player_id"])
    parts = {m.key: m.value(ev) for m in METRICS}
    for r in RATIOS:
        parts[f"{r.key}:num"], parts[f"{r.key}:den"] = r.num(ev), r.den(ev)
    counts = pd.DataFrame({k: v.astype(float) for k, v in parts.items()}, index=ev.index)
    counts[["player_id", "position"]] = ev[["player_id", "position"]]
    totals = counts.groupby(["player_id", "position"])[list(parts)].sum()
    minutes = lineups.groupby(["player_id", "position"])["minutes_played"].sum()
    df = minutes.to_frame("minutes").join(totals).fillna(0).reset_index().rename(columns={"position": "role"})
    df = df[df["minutes"] > 0].reset_index(drop=True)

    per90 = df[[m.key for m in METRICS]].div(df["minutes"], axis=0) * 90
    for r in RATIOS:
        den = df[f"{r.key}:den"]
        per90[r.key] = (df[f"{r.key}:num"] / den * 100).where(den >= r.min_den)
    q = df["minutes"] >= min_minutes
    roles = df["role"][q]
    pct = (per90[q].groupby(roles).rank(pct=True) * 100).round()
    std = per90[q].groupby(roles).transform("std", ddof=0)
    # a missing share sits at the position mean, so it neither helps nor hurts similarity
    z = ((per90[q] - per90[q].groupby(roles).transform("mean")) / std.where(std > 0)).fillna(0.0)

    out = df[["player_id", "role", "minutes"]].copy()
    out["per90"] = [{k: None if v != v else round(float(v), 4) for k, v in row.items()} for row in per90.to_dict("records")]
    out["percentiles"] = [{k: int(v) for k, v in pct.loc[i].items() if v == v} if i in pct.index else {} for i in out.index]
    out["style"] = [z.loc[i].tolist() if i in z.index else None for i in out.index]
    return out


def attribute_percentiles(out: pd.DataFrame, attributes: dict[str, list[str]]) -> list[dict]:
    """Per row: for each attribute with stand-in metrics, the mean of the metric percentiles that exist,
    ranked within the role (0..100). Rows without percentiles get none."""
    means = pd.DataFrame(
        [{a: pd.Series([p[m] for m in ms if m in p], dtype=float).mean() for a, ms in attributes.items() if ms} for p in out["percentiles"]],
        index=out.index)
    ranked = (means.groupby(out["role"]).rank(pct=True) * 100).round()
    return [{a: int(v) for a, v in row.items() if v == v} for row in ranked.to_dict("records")]


def load_competition(cur, comp_id):
    """Only published matches feed profiles."""
    cur.execute(
        "select e.match_id, e.player_id, e.type, e.outcome, e.x, e.y, e.end_x, e.end_y, e.extra "
        "from events e join matches m on m.id = e.match_id where m.competition_id = %s and m.status = 'published'", (comp_id,))
    events = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description]).astype(
        {c: float for c in ("x", "y", "end_x", "end_y")})
    cur.execute(
        "select l.match_id, l.player_id, l.position, l.minutes_played "
        "from lineups l join matches m on m.id = l.match_id where m.competition_id = %s and m.status = 'published'", (comp_id,))
    lineups = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
    return events, lineups


def compute_competition(cur, comp_id, min_minutes, attributes):
    events, lineups = load_competition(cur, comp_id)
    cur.execute("delete from player_season_metrics where competition_id = %s", (comp_id,))
    if events.empty:
        return None
    res = compute_season_metrics(events, lineups, min_minutes)
    res["attr_percentiles"] = attribute_percentiles(res, attributes)
    res["peers"] = res["role"].map(res[res["style"].notna()]["role"].value_counts()).fillna(0).astype(int)
    cur.executemany(
        "insert into player_season_metrics (player_id, competition_id, role, minutes, per90, percentiles, style, attr_percentiles, peers) "
        "values (%s,%s,%s,%s,%s,%s,%s::vector,%s,%s)",
        [(r.player_id, comp_id, r.role, int(r.minutes), Jsonb(r.per90), Jsonb(r.percentiles),
          None if r.style is None else str(r.style), Jsonb(r.attr_percentiles), int(r.peers)) for r in res.itertuples()])
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--competition-id", help="competitions.id uuid; defaults to every competition")
    a = ap.parse_args()

    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_DB)) as conn, conn.cursor() as cur:
        cur.execute("select key, metrics from attributes")
        attributes = dict(cur.fetchall())
        unknown = {m for ms in attributes.values() for m in ms} - set(KEYS)
        if unknown:
            raise SystemExit(f"attributes name metrics the worker does not compute: {sorted(unknown)}")
        cur.execute("select id, name, min_minutes from competitions" + (" where id = %s" if a.competition_id else ""),
                    (a.competition_id,) if a.competition_id else None)
        for comp_id, name, min_minutes in cur.fetchall():
            res = compute_competition(cur, comp_id, min_minutes, attributes)
            if res is None:
                print(f"{name}: no published matches")
            else:
                print(f"{name}: {len(res)} player-role rows; {res['style'].notna().sum()} qualify at >= {min_minutes} min")


if __name__ == "__main__":
    main()
