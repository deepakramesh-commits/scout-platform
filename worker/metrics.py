import argparse
import os
from typing import Callable, NamedTuple

import pandas as pd
import psycopg
from psycopg.types.json import Jsonb

DEFAULT_DB = "postgres://postgres:postgres@localhost:54330/postgres"
WON = {"won", "success_in_play", "success_out"}
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
]
KEYS = [m.key for m in METRICS]


def compute_season_metrics(events: pd.DataFrame, lineups: pd.DataFrame, min_minutes: int) -> pd.DataFrame:
    """events: match_id, player_id, type, outcome, x, y, end_x, end_y, extra(dict).
    lineups: match_id, player_id, position (role), minutes_played.
    Events are attributed to the role the player held in that match."""
    ev = events.merge(lineups[["match_id", "player_id", "position"]], on=["match_id", "player_id"])
    counts = pd.DataFrame({m.key: m.value(ev).astype(float) for m in METRICS})
    counts[["player_id", "position"]] = ev[["player_id", "position"]]
    totals = counts.groupby(["player_id", "position"])[KEYS].sum()
    minutes = lineups.groupby(["player_id", "position"])["minutes_played"].sum()
    df = minutes.to_frame("minutes").join(totals).fillna(0).reset_index().rename(columns={"position": "role"})
    df = df[df["minutes"] > 0].reset_index(drop=True)

    per90 = df[KEYS].div(df["minutes"], axis=0) * 90
    q = df["minutes"] >= min_minutes
    roles = df["role"][q]
    pct = (per90[q].groupby(roles).rank(pct=True) * 100).round().astype(int)
    std = per90[q].groupby(roles).transform("std", ddof=0)
    z = ((per90[q] - per90[q].groupby(roles).transform("mean")) / std.where(std > 0)).fillna(0.0)

    out = df[["player_id", "role", "minutes"]].copy()
    out["per90"] = [{k: round(float(v), 4) for k, v in row.items()} for row in per90.to_dict("records")]
    out["percentiles"] = [pct.loc[i].to_dict() if i in pct.index else {} for i in out.index]
    out["style"] = [z.loc[i].tolist() if i in z.index else None for i in out.index]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-minutes", type=int, default=450)
    ap.add_argument("--competition-id", help="competitions.id uuid; defaults to the only one loaded")
    a = ap.parse_args()

    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_DB)) as conn, conn.cursor() as cur:
        cur.execute("select id from competitions" + (" where id = %s" if a.competition_id else ""), (a.competition_id,) if a.competition_id else None)
        comps = cur.fetchall()
        if len(comps) != 1:
            raise SystemExit(f"{len(comps)} competitions match; pass --competition-id <uuid>")
        (comp_id,) = comps[0]
        cur.execute(
            "select e.match_id, e.player_id, e.type, e.outcome, e.x, e.y, e.end_x, e.end_y, e.extra "
            "from events e join matches m on m.id = e.match_id where m.competition_id = %s", (comp_id,))
        events = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description]).astype(
            {c: float for c in ("x", "y", "end_x", "end_y")})
        cur.execute(
            "select l.match_id, l.player_id, l.position, l.minutes_played "
            "from lineups l join matches m on m.id = l.match_id where m.competition_id = %s", (comp_id,))
        lineups = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])

        res = compute_season_metrics(events, lineups, a.min_minutes)
        cur.execute("delete from player_season_metrics where competition_id = %s", (comp_id,))
        cur.executemany(
            "insert into player_season_metrics (player_id, competition_id, role, minutes, per90, percentiles, style) "
            "values (%s,%s,%s,%s,%s,%s,%s::vector)",
            [(r.player_id, comp_id, r.role, int(r.minutes), Jsonb(r.per90), Jsonb(r.percentiles),
              None if r.style is None else str(r.style)) for r in res.itertuples()])

    qualifying = res["style"].notna().sum()
    print(f"{len(res)} player-role rows; {qualifying} qualify at >= {a.min_minutes} min")


if __name__ == "__main__":
    main()
