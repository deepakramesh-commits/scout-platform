"""Write matches as StatsBomb-style JSON in the open-data folder layout, so kloppy and socceraction read them unchanged.

    uv run --python 3.12 python export_statsbomb.py --out exports/ [--competition-id <uuid>] [--match-id <uuid>]

Layout: competitions.json, matches/<competition>/<season>.json, events/<match>.json, lineups/<match>.json.
Our ids are uuids; StatsBomb's are integers, so each uuid maps to a stable 31-bit integer (`sid`).
"""
import argparse
import json
import os
import pathlib
import uuid
from collections import Counter

import psycopg

DEFAULT_DB = "postgres://postgres:postgres@localhost:54330/postgres"
# Official StatsBomb id for every name the open data uses, harvested from the raw open data.
IDS = json.loads(pathlib.Path(__file__).with_name("statsbomb_ids.json").read_text())
TYPES = {
    "pass": "Pass", "carry": "Carry", "shot": "Shot", "dribble": "Dribble", "duel": "Duel", "tackle": "Duel",
    "ball_recovery": "Ball Recovery", "interception": "Interception", "clearance": "Clearance",
    "foul_committed": "Foul Committed", "foul_won": "Foul Won", "ball_receipt": "Ball Receipt*",
    "pressure": "Pressure", "miscontrol": "Miscontrol", "dispossessed": "Dispossessed",
    "dribbled_past": "Dribbled Past", "block": "Block", "goalkeeper": "Goal Keeper",
}
TYPE_IDS = {**IDS["type"], "Starting XI": 35, "Half Start": 18, "Half End": 34}
ROLE_POSITION = {
    "GK": (1, "Goalkeeper"), "FB": (2, "Right Back"), "CB": (4, "Center Back"), "DM": (10, "Center Defensive Midfield"),
    "CM": (14, "Center Midfield"), "AM": (19, "Center Attacking Midfield"), "LW": (21, "Left Wing"),
    "RW": (17, "Right Wing"), "ST": (23, "Center Forward"),
}
PERIOD_START = {1: 0, 2: 45 * 60, 3: 90 * 60, 4: 105 * 60}
ON_BALL = {"pass", "carry", "shot", "dribble", "ball_receipt", "ball_recovery", "miscontrol"}
SET_PIECE = {
    "pass.type": {"corner": "Corner", "free_kick": "Free Kick", "throw_in": "Throw-in", "goal_kick": "Goal Kick", "kick_off": "Kick Off"},
    "shot.type": {"penalty": "Penalty", "free_kick": "Free Kick", "corner": "Corner", "kick_off": "Kick Off"},
}


def sid(u) -> int:
    return int(uuid.UUID(str(u)).hex[:8], 16) & 0x7FFFFFFF


def named(path: str, value: str) -> dict:
    """{"id", "name"} for a stored slug or name, using StatsBomb's spelling and id."""
    wanted = value.replace("_", " ").lower()
    # body parts and outcomes share ids across event types, so a sibling table can answer
    suffix = "." + path.split(".")[-1]
    for table in [IDS.get(path, {})] + [t for k, t in IDS.items() if k.endswith(suffix) and k != path]:
        name = next((n for n in table if n.lower() == wanted), None)
        if name is not None:
            return {"id": table[name], "name": name}
    raise ValueError(f"{path}: no StatsBomb id for {value!r}")


def clock(seconds: float) -> str:
    s = max(0.0, seconds)
    return f"{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{s % 60:06.3f}"


def formation(roles: list[str]) -> int:
    lines = [sum(r in g for r in roles) for g in ({"CB", "FB"}, {"DM", "CM", "AM"}, {"LW", "RW", "ST"})]
    return int("".join(str(n) for n in lines if n)) if any(lines) else 0


def type_detail(e: dict) -> dict:
    t, ex = e["type"], e["extra"] or {}
    d: dict = {}
    if e["end_x"] is not None and t in ("pass", "carry", "shot"):
        d["end_location"] = [float(e["end_x"]), float(e["end_y"])]
    if e["body_part"] and t in ("pass", "shot", "clearance", "goalkeeper"):
        d["body_part"] = named(f"{t}.body_part", e["body_part"])
    out = e["outcome"]
    if t == "pass":
        if out and out != "complete":
            d["outcome"] = named("pass.outcome", out)
        for flag in ("cross", "shot_assist", "goal_assist", "through_ball"):
            if ex.get(flag):
                d[flag] = True
        if ex.get("through_ball"):
            d["technique"] = named("pass.technique", "Through Ball")
    elif t == "shot":
        # our spec logs where a shot was taken, not where it went; readers require an end, so the goal centre stands in
        d.setdefault("end_location", [120.0, 40.0])
        d["outcome"] = named("shot.outcome", out)
        d["type"] = named("shot.type", SET_PIECE["shot.type"].get(ex.get("set_piece"), "Open Play"))
        if ex.get("xg") is not None:
            d["statsbomb_xg"] = ex["xg"]
        if ex.get("first_time"):
            d["first_time"] = True
    elif t in ("dribble", "interception", "ball_receipt") and out and out != ("complete" if t == "ball_receipt" else None):
        d["outcome"] = named(f"{t}.outcome", out)
    elif t == "tackle":
        d["type"] = named("duel.type", "Tackle")
        if out:
            d["outcome"] = named("duel.outcome", out)
    elif t == "duel":
        d["type"] = named("duel.type", ex.get("duel_type", "aerial_lost"))
        if out:
            d["outcome"] = named("duel.outcome", out)
    elif t == "foul_committed" and ex.get("card"):
        d["card"] = named("foul_committed.card", ex["card"])
    elif t == "goalkeeper":
        d["type"] = named("goalkeeper.type", ex["gk_type"])
        if out:
            d["outcome"] = named("goalkeeper.outcome", out)
    if t == "pass" and ex.get("set_piece") in SET_PIECE["pass.type"]:
        d["type"] = named("pass.type", SET_PIECE["pass.type"][ex["set_piece"]])
    if ex.get("aerial_won") and t in ("pass", "clearance", "shot", "miscontrol"):
        d["aerial_won"] = True
    return d


def build_match(match: dict, lineups: list[dict], events: list[dict]) -> tuple[list, list, dict]:
    """Rows from our tables in, (events.json, lineups.json, matches.json entry) out."""
    teams = {match["home_team_id"]: match["home_name"], match["away_team_id"]: match["away_name"]}
    ref = lambda tid: {"id": sid(tid), "name": teams[tid]}  # noqa: E731
    pref = {l["player_id"]: l for l in lineups}
    events = sorted(events, key=lambda e: (e["period"], float(e["video_seconds"])))
    periods = sorted({e["period"] for e in events})
    out: list[dict] = []

    def add(typ: str, period: int, secs: float, team, **rest):
        out.append({
            "id": rest.pop("id", str(uuid.uuid5(uuid.NAMESPACE_URL, f"{match['id']}:{typ}:{team}:{period}"))),
            "index": len(out) + 1, "period": period, "timestamp": clock(secs - PERIOD_START.get(period, 0)),
            "minute": int(secs // 60), "second": int(secs % 60), "type": {"id": TYPE_IDS[typ], "name": typ},
            "team": ref(team), "duration": 0.0, "related_events": [], "under_pressure": False, "counterpress": False, **rest,
        })

    for tid in teams:
        starters = [l for l in lineups if l["team_id"] == tid and l["started"]]
        add("Starting XI", 1, 0, tid, possession=1, possession_team=ref(match["home_team_id"]),
            play_pattern={"id": 1, "name": "Regular Play"},
            tactics={"formation": formation([l["position"] for l in starters]), "lineup": [
                {"player": {"id": sid(l["player_id"]), "name": l["display_name"]},
                 "position": dict(zip(("id", "name"), ROLE_POSITION.get(l["position"], (0, "Substitute")))),
                 "jersey_number": l["shirt_number"] or 0} for l in starters]})
    possession, holder = 1, match["home_team_id"]
    for p in periods:
        in_period = [e for e in events if e["period"] == p]
        for tid in teams:
            add("Half Start", p, PERIOD_START.get(p, 0), tid, possession=possession, possession_team=ref(holder),
                play_pattern={"id": 1, "name": "Regular Play"})
        for e in in_period:
            if e["type"] in ON_BALL and e["team_id"] != holder:
                possession, holder = possession + 1, e["team_id"]
            row = dict(
                id=str(e["id"]), possession=possession, possession_team=ref(holder),
                play_pattern={"id": 1, "name": "Regular Play"},
                location=[float(e["x"]), float(e["y"])] if e["x"] is not None else None,
                related_events=[str(e["related_event_id"])] if e.get("related_event_id") else [],
            )
            if e["player_id"]:
                l = pref.get(e["player_id"])
                row["player"] = {"id": sid(e["player_id"]), "name": l["display_name"] if l else ""}
                row["position"] = dict(zip(("id", "name"), ROLE_POSITION.get(l["position"] if l else "", (0, "Substitute"))))
            if (e["extra"] or {}).get("under_pressure"):
                row["under_pressure"] = True
            detail = type_detail(e)
            key = {"tackle": "duel", "ball_receipt": "ball_receipt", "goalkeeper": "goalkeeper"}.get(e["type"], e["type"])
            if detail:
                row[key] = detail
            add(TYPES[e["type"]], p, float(e["video_seconds"]), e["team_id"], **row)
        end = max((float(e["video_seconds"]) for e in in_period), default=PERIOD_START.get(p, 0))
        for tid in teams:
            add("Half End", p, end, tid, possession=possession, possession_team=ref(holder),
                play_pattern={"id": 1, "name": "Regular Play"})

    goals = Counter(e["team_id"] for e in events if e["type"] == "shot" and e["outcome"] == "goal")
    lineup_json = [{"team_id": sid(tid), "team_name": name, "lineup": [
        {"player_id": sid(l["player_id"]), "player_name": l["display_name"], "player_nickname": None,
         "jersey_number": l["shirt_number"] or 0, "country": {"id": 0, "name": l.get("nationality") or ""},
         "cards": [], "positions": []}
        for l in lineups if l["team_id"] == tid]} for tid, name in teams.items()]
    kickoff = match["kickoff_at"]
    match_json = {
        "match_id": sid(match["id"]), "match_date": kickoff.strftime("%Y-%m-%d"), "kick_off": kickoff.strftime("%H:%M:%S.000"),
        "competition": {"competition_id": sid(match["competition_id"]), "country_name": match["country"],
                        "competition_name": match["competition_name"]},
        "season": {"season_id": sid(match["competition_id"]), "season_name": match["season"]},
        "home_team": {"home_team_id": sid(match["home_team_id"]), "home_team_name": match["home_name"], "home_team_gender": "male"},
        "away_team": {"away_team_id": sid(match["away_team_id"]), "away_team_name": match["away_name"], "away_team_gender": "male"},
        "home_score": goals[match["home_team_id"]], "away_score": goals[match["away_team_id"]],
        "match_status": "available", "match_week": 1, "competition_stage": {"id": 1, "name": "Regular Season"},
        "stadium": None, "referee": None,
    }
    return out, lineup_json, match_json


def fetch_match(cur, match_id):
    cur.execute("""
        select m.id, m.competition_id, m.kickoff_at, m.home_team_id, m.away_team_id, c.name as competition_name, c.country, c.season,
               h.name as home_name, a.name as away_name
        from matches m join competitions c on c.id = m.competition_id join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
        where m.id = %s""", (match_id,))
    match = dict(zip([d.name for d in cur.description], cur.fetchone()))
    cur.execute("""select l.player_id, p.display_name, p.nationality, l.team_id, l.shirt_number, l.position, l.started
                   from lineups l join players p on p.id = l.player_id where l.match_id = %s""", (match_id,))
    lineups = [dict(zip([d.name for d in cur.description], r)) for r in cur.fetchall()]
    cur.execute("""select id, team_id, player_id, period, video_seconds, type, outcome, x, y, end_x, end_y, body_part, extra, related_event_id
                   from events where match_id = %s""", (match_id,))
    events = [dict(zip([d.name for d in cur.description], r)) for r in cur.fetchall()]
    return match, lineups, events


def write_layout(root: pathlib.Path, built: list[tuple[list, list, dict]]):
    for sub in ("events", "lineups"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    by_season: dict[tuple, list] = {}
    for events, lineups, match in built:
        (root / "events" / f"{match['match_id']}.json").write_text(json.dumps(events))
        (root / "lineups" / f"{match['match_id']}.json").write_text(json.dumps(lineups))
        by_season.setdefault((match["competition"]["competition_id"], match["season"]["season_id"]), []).append(match)
    comps = []
    for (cid, season), matches in by_season.items():
        (root / "matches" / str(cid)).mkdir(parents=True, exist_ok=True)
        (root / "matches" / str(cid) / f"{season}.json").write_text(json.dumps(matches))
        m = matches[0]
        comps.append({"competition_id": cid, "season_id": season, "country_name": m["competition"]["country_name"],
                      "competition_name": m["competition"]["competition_name"], "competition_gender": "male",
                      "competition_youth": False, "competition_international": False,
                      "season_name": m["season"]["season_name"], "match_updated": None, "match_available": None})
    (root / "competitions.json").write_text(json.dumps(comps))


def export(cur, root: pathlib.Path, competition_id=None, match_id=None, published_only=True):
    cur.execute("select id from matches where (%s::uuid is null or competition_id = %s) and (%s::uuid is null or id = %s)"
                + (" and status = 'published'" if published_only else ""), (competition_id, competition_id, match_id, match_id))
    built = [build_match(*fetch_match(cur, mid)) for (mid,) in cur.fetchall()]
    write_layout(root, built)
    return [b[2] for b in built]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--competition-id")
    ap.add_argument("--match-id")
    a = ap.parse_args()
    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_DB)) as conn, conn.cursor() as cur:
        matches = export(cur, pathlib.Path(a.out), a.competition_id, a.match_id, published_only=not a.match_id)
    print(f"exported {len(matches)} matches to {a.out}")


if __name__ == "__main__":
    main()
