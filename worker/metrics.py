import argparse
import datetime as dt
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


COUNT_KEYS = [m.key for m in METRICS]
LOWER_IS_BETTER = {"ball_losses"}
MATCH_MIN_MINUTES = 30


def match_index(events: pd.DataFrame, lineups: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """One 0..100 number per player per match (30+ minutes): the player's per-90 counts in that match are z-scored
    against every match by a player in the same role, averaged (ball losses count against), and ranked within the role.
    An opponent is stronger when its goal difference per match in the competition beats the player's own team's."""
    lu = lineups[lineups["minutes_played"] >= MATCH_MIN_MINUTES]
    ev = events.merge(lu[["match_id", "player_id"]], on=["match_id", "player_id"])
    counts = pd.DataFrame({m.key: m.value(ev).astype(float) for m in METRICS}, index=ev.index)
    counts[["match_id", "player_id"]] = ev[["match_id", "player_id"]]
    totals = counts.groupby(["match_id", "player_id"])[COUNT_KEYS].sum()
    df = lu.set_index(["match_id", "player_id"]).join(totals).fillna({k: 0.0 for k in COUNT_KEYS}).reset_index()
    per90 = df[COUNT_KEYS].div(df["minutes_played"], axis=0) * 90
    per90[list(LOWER_IS_BETTER)] *= -1
    std = per90.groupby(df["position"]).transform("std", ddof=0)
    z = ((per90 - per90.groupby(df["position"]).transform("mean")) / std.where(std > 0)).fillna(0.0)
    df["index"] = (z.mean(axis=1).groupby(df["position"]).rank(pct=True) * 100).round().astype(int)

    goals = events[(events["type"] == "shot") & (events["outcome"] == "goal")].groupby(["match_id", "team_id"]).size()
    sides = pd.concat([matches.rename(columns={"home_team_id": "team", "away_team_id": "opp"}),
                       matches.rename(columns={"away_team_id": "team", "home_team_id": "opp"})])[["id", "team", "opp"]]
    sides["gd"] = [goals.get((m, t), 0) - goals.get((m, o), 0) for m, t, o in sides[["id", "team", "opp"]].itertuples(index=False)]
    strength = sides.groupby("team")["gd"].mean()
    opp = sides.set_index(["id", "team"])["opp"]
    df["opponent_team_id"] = [opp[(m, t)] for m, t in zip(df["match_id"], df["team_id"])]
    df["opponent_stronger"] = df["opponent_team_id"].map(strength) > df["team_id"].map(strength)
    return df.rename(columns={"position": "role", "minutes_played": "minutes"})[
        ["player_id", "match_id", "role", "minutes", "index", "opponent_team_id", "opponent_stronger"]]


def age_band(age):
    if age is None or age != age:
        return None
    return "U17" if age < 17 else "U19" if age < 19 else "U21" if age < 21 else "senior"


def band_percentiles(res: pd.DataFrame, birth_years: dict, year: int) -> pd.DataFrame:
    """Percentiles within role x age band (U17, U19, U21, senior), for players who qualify and have a birth year."""
    bands = res["player_id"].map(lambda p: age_band(year - birth_years[p]) if birth_years.get(p) else None)
    q = res["style"].notna() & bands.notna()
    per90 = pd.DataFrame(list(res["per90"]), index=res.index)[KEYS].astype(float)
    groups = [res["role"][q], bands[q]]
    pct = (per90[q].groupby(groups).rank(pct=True) * 100).round()
    peers = res[q].groupby(groups)["player_id"].transform("count")
    return pd.DataFrame({
        "age_band": bands,
        "band_percentiles": [{k: int(v) for k, v in pct.loc[i].items() if v == v} if i in pct.index else {} for i in res.index],
        "band_peers": [int(peers[i]) if i in peers.index else 0 for i in res.index],
    }, index=res.index)


def add_value_metric(res: pd.DataFrame, lineups: pd.DataFrame, per_match: pd.DataFrame, key: str) -> pd.DataFrame:
    """Fold a per-match value (xT) into per90 and percentiles, attributed to the role held in each match.
    It stays out of the style vector, which is built from METRICS only."""
    v = per_match.merge(lineups[["match_id", "player_id", "position"]], on=["match_id", "player_id"])
    sums = v.groupby(["player_id", "position"])["value"].sum()
    value = pd.Series([sums.get((p, r), 0.0) for p, r in zip(res["player_id"], res["role"])], index=res.index)
    per90 = value / res["minutes"] * 90
    q = res["style"].notna()
    pct = (per90[q].groupby(res["role"][q]).rank(pct=True) * 100).round()
    out = res.copy()
    out["per90"] = [{**p, key: round(float(per90[i]), 4)} for i, p in zip(res.index, res["per90"])]
    out["percentiles"] = [{**p, key: int(pct[i])} if i in pct.index else p for i, p in zip(res.index, res["percentiles"])]
    return out


def load_competition(cur, comp_id):
    """Only published matches feed profiles."""
    cur.execute(
        "select e.match_id, e.player_id, e.team_id, e.type, e.outcome, e.x, e.y, e.end_x, e.end_y, e.extra "
        "from events e join matches m on m.id = e.match_id where m.competition_id = %s and m.status = 'published'", (comp_id,))
    events = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description]).astype(
        {c: float for c in ("x", "y", "end_x", "end_y")})
    cur.execute(
        "select l.match_id, l.player_id, l.team_id, l.position, l.minutes_played "
        "from lineups l join matches m on m.id = l.match_id where m.competition_id = %s and m.status = 'published'", (comp_id,))
    lineups = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
    cur.execute("select id, home_team_id, away_team_id from matches where competition_id = %s and status = 'published'", (comp_id,))
    matches = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
    return events, lineups, matches


def compute_competition(cur, comp_id, min_minutes, attributes):
    from xt import competition_xt

    events, lineups, matches = load_competition(cur, comp_id)
    cur.execute("delete from player_season_metrics where competition_id = %s", (comp_id,))
    cur.execute("delete from player_match_index where competition_id = %s", (comp_id,))
    if events.empty:
        return None
    res = compute_season_metrics(events, lineups, min_minutes)
    res = add_value_metric(res, lineups, competition_xt(cur, comp_id), "xt")
    res["attr_percentiles"] = attribute_percentiles(res, attributes)
    res["peers"] = res["role"].map(res[res["style"].notna()]["role"].value_counts()).fillna(0).astype(int)
    cur.execute("select id, birth_year from players where birth_year is not null")
    res = res.join(band_percentiles(res, dict(cur.fetchall()), dt.date.today().year))
    cur.executemany(
        "insert into player_season_metrics (player_id, competition_id, role, minutes, per90, percentiles, style, attr_percentiles, peers, "
        "age_band, band_percentiles, band_peers) values (%s,%s,%s,%s,%s,%s,%s::vector,%s,%s,%s,%s,%s)",
        [(r.player_id, comp_id, r.role, int(r.minutes), Jsonb(r.per90), Jsonb(r.percentiles),
          None if r.style is None else str(r.style), Jsonb(r.attr_percentiles), int(r.peers),
          r.age_band, Jsonb(r.band_percentiles), int(r.band_peers)) for r in res.itertuples()])
    idx = match_index(events, lineups, matches)
    cur.executemany(
        "insert into player_match_index (player_id, match_id, competition_id, role, minutes, index, opponent_team_id, opponent_stronger) "
        "values (%s,%s,%s,%s,%s,%s,%s,%s)",
        [(r.player_id, r.match_id, comp_id, r.role, int(r.minutes), int(r.index), r.opponent_team_id, bool(r.opponent_stronger))
         for r in idx.itertuples()])
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
