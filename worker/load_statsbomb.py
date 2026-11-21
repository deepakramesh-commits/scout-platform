import argparse
import os
import uuid
import warnings
from collections import defaultdict

import psycopg
from psycopg.types.json import Jsonb

warnings.filterwarnings("ignore", message=".*NoAuthWarning.*")
warnings.filterwarnings("ignore", module="statsbombpy")
from statsbombpy import sb  # noqa: E402

DEFAULT_DB = "postgres://postgres:postgres@localhost:54330/postgres"
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "scout-platform/statsbomb")

ROLE_MAP = {
    "Goalkeeper": "GK",
    "Center Back": "CB", "Left Center Back": "CB", "Right Center Back": "CB",
    "Left Back": "FB", "Right Back": "FB", "Left Wing Back": "FB", "Right Wing Back": "FB",
    "Center Defensive Midfield": "DM", "Left Defensive Midfield": "DM", "Right Defensive Midfield": "DM",
    "Center Midfield": "CM", "Left Center Midfield": "CM", "Right Center Midfield": "CM",
    "Center Attacking Midfield": "AM", "Left Attacking Midfield": "AM", "Right Attacking Midfield": "AM",
    "Left Wing": "LW", "Left Midfield": "LW",
    "Right Wing": "RW", "Right Midfield": "RW",
    "Center Forward": "ST", "Left Center Forward": "ST", "Right Center Forward": "ST", "Secondary Striker": "ST",
}

EVENT_TYPES = {
    "Pass": "pass", "Carry": "carry", "Shot": "shot", "Dribble": "dribble", "Duel": "duel",
    "Ball Recovery": "ball_recovery", "Interception": "interception", "Clearance": "clearance",
    "Foul Committed": "foul_committed", "Foul Won": "foul_won", "Ball Receipt*": "ball_receipt",
    "Pressure": "pressure", "Miscontrol": "miscontrol", "Dispossessed": "dispossessed", "Dribbled Past": "dribbled_past",
    "Block": "block", "Goal Keeper": "goalkeeper",
}
OUTCOME_COL = {
    "Pass": "pass_outcome", "Shot": "shot_outcome", "Dribble": "dribble_outcome", "Duel": "duel_outcome",
    "Interception": "interception_outcome", "Ball Receipt*": "ball_receipt_outcome", "Goal Keeper": "goalkeeper_outcome",
}
SET_PIECE = {"Corner": "corner", "Free Kick": "free_kick", "Throw-in": "throw_in", "Goal Kick": "goal_kick",
             "Kick Off": "kick_off", "Penalty": "penalty"}
AERIAL_WON = ("pass_aerial_won", "clearance_aerial_won", "shot_aerial_won", "miscontrol_aerial_won")
BODY_COL = {"pass": "pass_body_part", "shot": "shot_body_part", "clearance": "clearance_body_part"}
END_COL = {"pass": "pass_end_location", "carry": "carry_end_location", "shot": "shot_end_location"}


def uid(kind, source_id):
    return uuid.uuid5(NAMESPACE, f"statsbomb:{kind}:{source_id}")


def val(row, key):
    v = row.get(key)
    return None if v is None or v != v else v


def slug(s):
    return s.lower().replace(" ", "_")


def clock_seconds(s):
    m, sec = s.split(":")
    return int(m) * 60 + int(sec)


def union_seconds(spans):
    total, hi = 0, 0
    for start, end in sorted(spans):
        total += max(0, end - max(start, hi))
        hi = max(hi, end)
    return total


def event_rows(match_id, team_ids, events):
    through_balls = {r["id"] for r in events if r["type"] == "Pass" and val(r, "pass_through_ball")}
    for r in events:
        t = EVENT_TYPES.get(r["type"])
        if t is None or r["period"] > 4 or val(r, "player_id") is None:
            continue
        extra = {}
        if t == "duel":
            extra["duel_type"] = slug(r["duel_type"])
            if r["duel_type"] == "Tackle":
                t = "tackle"
        if t == "shot":
            extra["xg"] = val(r, "shot_statsbomb_xg")
        if t == "pass":
            for flag in ("shot_assist", "goal_assist", "cross", "through_ball"):
                if val(r, f"pass_{flag}"):
                    extra[flag] = True
        if t == "foul_committed" and val(r, "foul_committed_card"):
            extra["card"] = slug(r["foul_committed_card"])
        set_piece = SET_PIECE.get(val(r, "pass_type") if t == "pass" else val(r, "shot_type") if t == "shot" else None)
        if set_piece:
            extra["set_piece"] = set_piece
        if t == "shot" and val(r, "shot_first_time"):
            extra["first_time"] = True
        if t == "ball_receipt" and any(e in through_balls for e in val(r, "related_events") or []):
            extra["through_ball"] = True
        if t == "goalkeeper":
            extra["gk_type"] = slug(r["goalkeeper_type"])
        if val(r, "under_pressure"):
            extra["under_pressure"] = True
        if any(val(r, k) for k in AERIAL_WON):
            extra["aerial_won"] = True
        outcome = val(r, OUTCOME_COL.get(r["type"], ""))
        if outcome is not None:
            outcome = slug(outcome)
        elif t in ("pass", "ball_receipt"):
            outcome = "complete"
        loc = val(r, "location")
        end = val(r, END_COL.get(t, ""))
        body = val(r, BODY_COL.get(t, ""))
        yield (
            uid("event", r["id"]), match_id, uid("player", int(r["player_id"])), team_ids[r["team_id"]],
            r["period"],
            # match clock, not video time: the open data has no video
            r["minute"] * 60 + r["second"],
            t, outcome,
            loc[0] if loc else None, loc[1] if loc else None,
            end[0] if end else None, end[1] if end else None,
            body, Jsonb(extra),
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--competition-id", type=int, default=1267)
    ap.add_argument("--season-id", type=int, default=107)
    ap.add_argument("--min-minutes", type=int, default=450, help="minutes before percentiles show; a tournament needs fewer")
    a = ap.parse_args()

    comps = sb.competitions()
    c = comps[(comps.competition_id == a.competition_id) & (comps.season_id == a.season_id)].iloc[0]
    comp_id = uid("competition", f"{a.competition_id}:{a.season_id}")
    competition = [(comp_id, c.competition_name, c.country_name, None, str(c.season_name), a.min_minutes)]

    teams, matches, lineups, events = {}, [], [], []
    players = {}
    role_minutes = defaultdict(lambda: defaultdict(int))
    for m in sb.matches(a.competition_id, a.season_id).to_dict("records"):
        team_ids = {}
        for side in ("home", "away"):
            tid = uid("team", m[f"{side}_team_id"])
            team_ids[m[f"{side}_team_id"]] = tid
            teams[tid] = (tid, m[f"{side}_team"], m[f"{side}_team_country_name"])
        mid = uid("match", m["match_id"])
        matches.append((mid, comp_id, team_ids[m["home_team_id"]], team_ids[m["away_team_id"]],
                        f"{m['match_date']} {m['kick_off']}+00"))
        ev = sb.events(match_id=m["match_id"]).to_dict("records")
        match_end = max(e["minute"] * 60 + e["second"] for e in ev if e["period"] <= 4)
        events.extend(event_rows(mid, team_ids, ev))

        sb_team_by_name = {m["home_team"]: m["home_team_id"], m["away_team"]: m["away_team_id"]}
        for team_name, lu in sb.lineups(match_id=m["match_id"]).items():
            for p in lu.to_dict("records"):
                if not p["positions"]:
                    continue
                secs = defaultdict(int)
                spans = []
                for s in p["positions"]:
                    start, end = clock_seconds(s["from"]), clock_seconds(s["to"]) if s["to"] else match_end
                    # some Tactical Shift stints in extra-time matches have to < from; the neighbouring stints cover that time
                    if end < start:
                        continue
                    secs[ROLE_MAP[s["position"]]] += end - start
                    spans.append((start, end))
                minutes = round(union_seconds(spans) / 60)
                pid = uid("player", p["player_id"])
                role = max(secs, key=secs.get)
                players.setdefault(pid, [pid, val(p, "player_nickname") or p["player_name"], val(p, "country")])
                role_minutes[pid][role] += minutes
                started = p["positions"][0].get("start_reason") == "Starting XI"
                lineups.append((mid, pid, team_ids[sb_team_by_name[team_name]], val(p, "jersey_number"), role, minutes, started))

    player_rows = [(*p, max(role_minutes[p[0]], key=role_minutes[p[0]].get)) for p in players.values()]
    known = {p[0] for p in player_rows}
    assert all(e[2] in known for e in events), "event player missing from lineups"

    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_DB)) as conn, conn.cursor() as cur:
        cur.executemany(
            "insert into competitions (id, name, country, age_group, season, min_minutes) values (%s,%s,%s,%s,%s,%s) "
            "on conflict (id) do update set name=excluded.name, country=excluded.country, age_group=excluded.age_group, "
            "season=excluded.season, min_minutes=excluded.min_minutes",
            competition)
        cur.executemany(
            "insert into teams (id, name, country) values (%s,%s,%s) "
            "on conflict (id) do update set name=excluded.name, country=excluded.country", list(teams.values()))
        cur.executemany(
            # visibility belongs to the consent and approval workflow, so a re-run never resurfaces a hidden profile
            "insert into players (id, display_name, nationality, primary_position) values (%s,%s,%s,%s) "
            "on conflict (id) do update set display_name=excluded.display_name, nationality=excluded.nationality, "
            "primary_position=excluded.primary_position",
            player_rows)
        cur.executemany(
            # open data is already checked by its publisher, so it enters as published
            "insert into matches (id, competition_id, home_team_id, away_team_id, kickoff_at, status) values (%s,%s,%s,%s,%s,'published') "
            "on conflict (id) do update set competition_id=excluded.competition_id, home_team_id=excluded.home_team_id, "
            "away_team_id=excluded.away_team_id, kickoff_at=excluded.kickoff_at", matches)
        cur.executemany(
            "insert into lineups (match_id, player_id, team_id, shirt_number, position, minutes_played, started) values (%s,%s,%s,%s,%s,%s,%s) "
            "on conflict (match_id, player_id) do update set team_id=excluded.team_id, shirt_number=excluded.shirt_number, "
            "position=excluded.position, minutes_played=excluded.minutes_played, started=excluded.started", lineups)
        cur.executemany(
            "insert into events (id, match_id, player_id, team_id, period, video_seconds, type, outcome, x, y, end_x, end_y, body_part, extra) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "on conflict (id) do update set match_id=excluded.match_id, player_id=excluded.player_id, team_id=excluded.team_id, "
            "period=excluded.period, video_seconds=excluded.video_seconds, type=excluded.type, outcome=excluded.outcome, "
            "x=excluded.x, y=excluded.y, end_x=excluded.end_x, end_y=excluded.end_y, body_part=excluded.body_part, extra=excluded.extra",
            events)
        cur.execute(
            "insert into squad_members (team_id, player_id, shirt_number) "
            "select distinct on (team_id, player_id) team_id, player_id, shirt_number from lineups "
            "where match_id = any(%s) order by team_id, player_id on conflict do nothing", ([m[0] for m in matches],))
    for name, rows in [("competitions", competition), ("teams", teams), ("players", player_rows),
                       ("matches", matches), ("lineups", lineups), ("events", events)]:
        print(f"{name}: {len(rows)} upserted")


if __name__ == "__main__":
    main()
