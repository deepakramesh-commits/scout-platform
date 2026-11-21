"""Labelled demo data so every screen is full until real values exist.

    uv run --python 3.12 python seed_demo.py           # create or refresh (idempotent)
    uv run --python 3.12 python seed_demo.py --remove  # delete every demo row and value
"""
import argparse
import datetime as dt
import os
import pathlib
import random
import shutil
import subprocess
import uuid

import psycopg

DEFAULT_DB = "postgres://postgres:postgres@localhost:54330/postgres"
NS = uuid.uuid5(uuid.NAMESPACE_URL, "scout-platform/demo")
TODAY = dt.date(2026, 11, 21)
DEMO_PASSWORD = "scout-demo"
UNDER_18_PLAYERS = 6


def did(*parts):
    return uuid.uuid5(NS, ":".join(map(str, parts)))


def rng(*parts):
    return random.Random(str(did(*parts)))


ORGS = [
    ("club", "Öresund FC (demo club)", "club"),
    ("club2", "Kattegat IF (demo club)", "club"),
    ("agency", "Partner Agency (demo)", "agency"),
    ("federation", "Demo Football Federation", "federation"),
    ("academy", "Lusaka Demo Academy", "academy"),
    ("internal", "Scout staff (demo)", "internal"),
]
USERS = [
    ("scout", "club", "scout", "Sara Lind"),
    ("scout2", "club2", "scout", "Erik Holm"),
    ("agent", "agency", "agent", "Amara Diallo"),
    ("federation", "federation", "federation", "Joseph Banda"),
    ("coach", "academy", "coach", "Grace Mwale"),
    ("player", None, "player", "Kofi Mensah"),
    ("guardian", None, "guardian", "Ama Mensah"),
    ("analyst", "internal", "tagger", "Nadia Okafor"),
    ("analyst2", "internal", "tagger", "Samuel Phiri"),
    ("coordinator", "academy", "coordinator", "Peter Zulu"),
    ("admin", "internal", "admin", "Lena Berg"),
]
AVAILABILITY = ["available", "open_to_offers", "not_available"]
CONDITIONS = ["Transfer fee negotiable", "Loan with option to buy", "Free at contract end", "Release clause in contract"]
TESTS = {
    "sprint_10m": (1.78, 0.07, 2),
    "sprint_30m": (4.20, 0.15, 2),
    "endurance": (18.6, 1.2, 1),
    "jump": (40.0, 5.0, 1),
}
HEIGHT_BY_ROLE = {"GK": 189, "CB": 186, "ST": 182, "DM": 180, "CM": 178, "FB": 177, "AM": 175, "LW": 174, "RW": 174}


def birth_year(r, minutes):
    age = int(r.triangular(18, 35, 26)) if minutes >= 90 else r.choice([18, 19, 20, 21, 22, 23, 24])
    return TODAY.year - age


def seed(cur):
    for key, name, kind in ORGS:
        cur.execute("insert into orgs (id, name, kind, is_demo) values (%s,%s,%s,true) on conflict (id) do update set name=excluded.name",
                    (did("org", key), name, kind))
    cur.execute("update orgs set is_partner_agency = true where id = %s", (did("org", "agency"),))
    for key, org, role, name in USERS:
        uid = did("user", key)
        email = f"{key}@demo.scout"
        cur.execute("insert into auth.users (id, email, encrypted_password) values (%s, %s, crypt(%s, gen_salt('bf'))) "
                    "on conflict (id) do update set email = excluded.email", (uid, email, DEMO_PASSWORD))
        cur.execute("insert into app_users (id, org_id, role, display_name, email, is_demo) values (%s,%s,%s,%s,%s,true) "
                    "on conflict (id) do update set org_id=excluded.org_id, role=excluded.role, display_name=excluded.display_name, email=excluded.email",
                    (uid, did("org", org) if org else None, role, name, email))
    cur.execute("select id from competitions")
    for (cid,) in cur.fetchall():
        for org in ("club", "club2", "agency", "federation", "academy"):
            cur.execute("insert into org_coverage (org_id, competition_id, owner, is_demo) values (%s,%s,%s,true) on conflict do nothing",
                        (did("org", org), cid, org == "federation"))

    cur.execute("""
        select p.id, p.primary_position, p.birth_year, p.height_cm, p.preferred_foot, p.demo_fields,
               coalesce(sum(l.minutes_played), 0)::int as minutes
        from players p left join lineups l on l.player_id = p.id
        group by p.id order by minutes, p.id""")
    players = cur.fetchall()
    young = {p[0] for p in players[:UNDER_18_PLAYERS] if p[2] is None}
    for pid, role, by, height, foot, demo, minutes in players:
        fields = set(demo)
        if by is None:
            by = TODAY.year - 17 if pid in young else birth_year(rng("age", pid), minutes)
            fields.add("birth_year")
        if height is None:
            height = round(rng("height", pid).gauss(HEIGHT_BY_ROLE.get(role, 179), 5))
            fields.add("height_cm")
        if foot is None:
            foot = rng("foot", pid).choices(["right", "left", "both"], [72, 23, 5])[0]
            fields.add("preferred_foot")
        cur.execute("update players set birth_year=%s, height_cm=%s, preferred_foot=%s, demo_fields=%s where id=%s",
                    (by, max(150, min(205, height)), foot, sorted(fields), pid))

        r = rng("market", pid)
        cur.execute(
            "insert into player_market (player_id, contract_end, availability, transfer_conditions, representative, is_demo) "
            "values (%s,%s,%s,%s,%s,true) on conflict (player_id) do nothing",
            (pid, dt.date(r.choice([2026, 2027, 2027, 2028, 2028, 2029]), r.choice([6, 11]), 30),
             r.choices(AVAILABILITY, [3, 5, 2])[0], r.choice(CONDITIONS),
             r.choice(["Partner Agency (demo)", "Independent agent (demo)", None])))

        r = rng("tests", pid)
        if r.random() < 0.6:
            when = TODAY - dt.timedelta(days=r.randint(20, 300))
            verified = r.random() < 0.5
            for test, (mean, sd, dp) in TESTS.items():
                cur.execute(
                    "insert into physical_tests (id, player_id, test, value, unit, tested_at, verified, is_demo) "
                    "select %s,%s,%s,%s,unit,%s,%s,true from physical_test_kinds where key=%s on conflict (id) do nothing",
                    (did("test", pid, test), pid, test, round(r.gauss(mean, sd), dp), when, verified, test))
    seed_reports(cur)
    seed_workflow(cur)
    seed_engine(cur)
    cur.execute("select count(*) from players where %s - birth_year < 18 and 'birth_year' = any(demo_fields)", (TODAY.year,))
    print(f"demo: {len(ORGS)} orgs, {len(USERS)} users, {len(players)} players filled, {cur.fetchone()[0]} under 18")


REPORTED = 60
SEEN_IN = ["Two matches on video and one live", "Live at the tournament", "Full matches on video, plus a call with his coach",
           "Training week and two matches", "Video of every match he started"]


def seed_reports(cur):
    cur.execute("select key, label, grp from attributes order by sort")
    attrs = cur.fetchall()
    cur.execute("""
        select distinct on (m.player_id) m.player_id, m.attr_percentiles,
               (select string_agg(distinct t.name, ', ') from lineups l join matches mt on mt.id = l.match_id
                  join teams t on t.id in (mt.home_team_id, mt.away_team_id) and t.id <> l.team_id
                where l.player_id = m.player_id and l.minutes_played > 0) as opponents
        from player_season_metrics m where m.style is not null
        order by m.player_id, m.minutes desc""")
    rows = sorted(cur.fetchall(), key=lambda r: str(did("rank", r[0])))[:REPORTED]
    for pid, pct, opponents in rows:
        opp = (opponents or "").split(", ")
        scouts = ["scout"] + (["scout2"] if rng("second", pid).random() < 0.5 else [])
        for author in scouts:
            r = rng("report", pid, author)
            ratings = {}
            for key, _label, grp in attrs:
                if grp != "mental" and r.random() < 0.3:
                    continue
                base = pct.get(key, 62) / 10 + (0.8 if author == "scout2" else 0)
                ratings[key] = max(1, min(10, round(r.gauss(base, 1.6))))
            label = {k: l for k, l, _ in attrs}
            ranked = sorted(ratings, key=ratings.get)
            avg = sum(ratings.values()) / len(ratings)
            rec = "sign" if avg >= 7 else "follow" if avg >= 5.5 else "pass"
            rid = did("report", pid, author)
            cur.execute(
                "insert into scout_reports (id, player_id, org_id, author_id, seen_in, recommendation, strengths, weaknesses, comments, created_at, is_demo) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true) on conflict (id) do nothing",
                (rid, pid, did("org", "club" if author == "scout" else "club2"), did("user", author), r.choice(SEEN_IN), rec,
                 f"{label[ranked[-1]]} and {label[ranked[-2]].lower()} stand out.",
                 f"{label[ranked[0]]} needs work; {label[ranked[1]].lower()} is inconsistent.",
                 f"Against {r.choice(opp) if opp[0] else 'a stronger side'} he kept working after a poor first half. "
                 f"In training he asked the coach for extra finishing work. In the interview he spoke calmly about moving abroad.",
                 dt.datetime(2026, 11, 21) - dt.timedelta(days=r.randint(3, 120))))
            cur.executemany("insert into scout_ratings (report_id, attribute, rating) values (%s,%s,%s) on conflict do nothing",
                            [(rid, k, v) for k, v in ratings.items()])


def seed_workflow(cur):
    year = TODAY.year
    signups = [
        ("kofi", "Kofi Mensah (demo)", 19, "player", None),
        ("yaw", "Yaw Mensah (demo)", 16, None, "guardian"),
    ]
    for key, name, age, owner, guardian in signups:
        pid = did("signup", key)
        cur.execute(
            "insert into players (id, display_name, birth_year, nationality, primary_position, origin, claimed_by, guardian_id, "
            "academy_org_id, height_cm, preferred_foot, demo_fields, is_demo) values (%s,%s,%s,'Ghana','RW','sign_up',%s,%s,%s,%s,'right',%s,true) "
            "on conflict (id) do nothing",
            (pid, name, year - age, did("user", owner) if owner else None, did("user", guardian) if guardian else None,
             did("org", "academy"), 174 if key == "kofi" else 168, ["birth_year", "height_cm", "preferred_foot"]))
        cur.execute("insert into player_identity (player_id, legal_name, date_of_birth) values (%s,%s,%s) on conflict do nothing",
                    (pid, name.replace(" (demo)", ""), dt.date(year - age, 3, 14)))
        cur.execute(
            "insert into consents (id, player_id, signed_by, scope, guardian_name, guardian_contact, is_demo) "
            "values (%s,%s,%s,'{share_with_clubs}',%s,%s,true) on conflict do nothing",
            (did("consent", key), pid, did("user", owner or guardian), "Ama Mensah" if guardian else None,
             "+233 20 000 0000 (demo)" if guardian else None))

    cur.execute("select id from players where origin = 'match_data' and status = 'live' order by id limit 40")
    live = [r[0] for r in cur.fetchall()]
    for i, pid in enumerate(live[:25]):
        r = rng("verify", pid)
        done = i % 3 != 2
        cur.execute(
            "insert into verifications (player_id, federation_registration, id_checked, photo_checked, contract_status, verified_by, verified_at, is_demo) "
            "values (%s,%s,%s,%s,%s,%s,%s,true) on conflict (player_id) do nothing",
            (pid, f"FED-{r.randint(10000, 99999)}", done, done, r.choice(["under_contract", "free_agent"]), did("user", "federation"),
             dt.datetime(2026, 10, 1) if done else None))

    cur.execute("""select distinct on (m.player_id) m.player_id, m.role from player_season_metrics m join players p on p.id = m.player_id
                   where m.style is not null and p.status = 'live' order by m.player_id, m.minutes desc""")
    by_role: dict = {}
    for pid, role in cur.fetchall():
        by_role.setdefault(role, []).append(pid)
    sl = did("shortlist", "scout")
    cur.execute("insert into shortlists (id, owner_id, name, is_demo) values (%s,%s,'Summer window targets',true) on conflict do nothing",
                (sl, did("user", "scout")))
    for role, pids in by_role.items():
        for rank, pid in enumerate(sorted(pids, key=lambda p: str(did("sl", p)))[:2 if role != "CB" else 3]):
            cur.execute("insert into shortlist_players (shortlist_id, player_id, note, rank) values (%s,%s,%s,%s) on conflict do nothing",
                        (sl, pid, rng("note", pid).choice(["Watch live next window", "Ask the agency about contract", "Strong on video, check pace"]), rank))
    cur.execute("insert into saved_searches (id, owner_id, name, query, is_demo) values (%s,%s,%s,%s,true) on conflict do nothing",
                (did("search", "scout"), did("user", "scout"), "Fast wingers under 24", "role=RW&sort=dribbles_completed&ageMax=24"))
    for pid in live[:5]:
        cur.execute("insert into agent_clients (org_id, player_id, is_demo) values (%s,%s,true) on conflict do nothing", (did("org", "agency"), pid))


DEMO_SQUADS = {
    "home": ("Lusaka Demo FC (demo)", ["Mwila", "Banda", "Phiri", "Tembo", "Zulu", "Mulenga", "Chanda", "Kabwe", "Lungu", "Mumba",
                                       "Sakala", "Ngoma", "Mwale", "Chirwa", "Daka", "Musonda"]),
    "away": ("Kabwe Demo United (demo)", ["Mutale", "Kasonde", "Mbewe", "Nkhata", "Simwanza", "Chola", "Bwalya", "Kapambwe",
                                          "Mwansa", "Sinkala", "Katongo", "Chisenga", "Mutati", "Kalaba", "Njobvu", "Siame"]),
}
SQUAD_ROLES = ["GK", "FB", "CB", "CB", "FB", "DM", "CM", "AM", "RW", "LW", "ST", "GK", "CB", "CM", "LW", "ST"]
VIDEO_SECONDS = 480  # two four-minute "halves" of a synthetic test pattern


def demo_video(match_id) -> int | None:
    """A labelled test-pattern video so the event log has footage to play; skipped without ffmpeg."""
    root = pathlib.Path(os.environ.get("STORAGE_DIR", pathlib.Path(__file__).parent.parent / "storage")) / "videos"
    out = root / f"{match_id}.mp4"
    if not out.exists():
        if not shutil.which("ffmpeg"):
            return None
        root.mkdir(parents=True, exist_ok=True)
        # testsrc draws a running counter, so a clip visibly starts at the right second
        done = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"testsrc=size=960x540:rate=25:duration={VIDEO_SECONDS}",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-pix_fmt", "yuv420p", str(out)])
        if done.returncode != 0:
            out.unlink(missing_ok=True)
            return None
    return out.stat().st_size


def seed_engine(cur):
    """A demo league with one match waiting for its match sheet and tagging. No events: those are logged in the app."""
    comp, match = did("comp", "demo"), did("match", "demo")
    cur.execute("insert into competitions (id, name, country, age_group, season, min_minutes, is_demo) "
                "values (%s, 'Demo League (demo)', 'Zambia', 'U20', '2026', 450, true) on conflict do nothing", (comp,))
    teams = {}
    for side, (name, surnames) in DEMO_SQUADS.items():
        tid = did("team", side)
        teams[side] = tid
        cur.execute("insert into teams (id, name, country, org_id, is_demo) values (%s,%s,'Zambia',%s,true) on conflict do nothing",
                    (tid, name, did("org", "academy") if side == "home" else None))
        first = ["Joseph", "Patrick", "Moses", "Kelvin", "Emmanuel", "Lazarus", "Fashion", "Collins", "Enock", "Clatous",
                 "Rodrick", "Benson", "Prince", "Gift", "Mathews", "Kings"]
        for i, (given, surname) in enumerate(zip(first, surnames)):
            pid = did("demo-player", side, i)
            r = rng("demo-player", side, i)
            cur.execute(
                "insert into players (id, display_name, birth_year, nationality, primary_position, height_cm, preferred_foot, "
                "demo_fields, academy_org_id, is_demo) values (%s,%s,%s,'Zambia',%s,%s,%s,%s,%s,true) on conflict do nothing",
                (pid, f"{given} {surname} (demo)", TODAY.year - r.randint(18, 20), SQUAD_ROLES[i], r.randint(168, 190),
                 r.choice(["right", "left"]), ["birth_year", "height_cm", "preferred_foot"], did("org", "academy") if side == "home" else None))
            cur.execute("insert into squad_members (team_id, player_id, shirt_number) values (%s,%s,%s) on conflict do nothing",
                        (tid, pid, i + 1))
    size = demo_video(match)
    cur.execute(
        "insert into matches (id, competition_id, home_team_id, away_team_id, kickoff_at, status, video_provider, video_path, "
        "video_size, video_status, is_demo) values (%s,%s,%s,%s,'2026-11-15 15:00+00','uploaded',%s,%s,%s,%s,true) on conflict do nothing",
        (match, comp, teams["home"], teams["away"], "local" if size else None, f"{match}.mp4" if size else None, size,
         "ready" if size else None))
    for user, task in (("coordinator", "coordinator"), ("analyst", "analyst"), ("analyst2", "reviewer"), ("admin", "reviewer")):
        cur.execute("insert into match_assignments (match_id, user_id, task) values (%s,%s,%s) on conflict do nothing",
                    (match, did("user", user), task))
    for org in ("club", "club2", "agency", "academy"):
        cur.execute("insert into org_coverage (org_id, competition_id, owner, is_demo) values (%s,%s,false,true) on conflict do nothing",
                    (did("org", org), comp))
    cur.execute("insert into org_coverage (org_id, competition_id, owner, is_demo) values (%s,%s,true,true) on conflict do nothing",
                (did("org", "federation"), comp))


def foreign_keys(cur, target):
    cur.execute("""
        select c.conrelid::regclass::text, a.attname from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = %s::regclass and c.conrelid::regclass::text not like 'auth.%%'""", (target,))
    return cur.fetchall()


def remove(cur):
    cur.execute("select coalesce(array_agg(id), '{}') from players where is_demo")
    players = cur.fetchone()[0]
    cur.execute("select coalesce(array_agg(id), '{}') from app_users where is_demo")
    users = cur.fetchone()[0]
    cur.execute("select coalesce(array_agg(id), '{}') from orgs where is_demo")
    orgs = cur.fetchone()[0]
    for target, ids in (("players", players), ("app_users", users), ("orgs", orgs)):
        for table, col in foreign_keys(cur, target):
            if table in ("players", "teams"):  # entities with their own demo flag: only the link to a demo account goes
                cur.execute(f"update {table} set {col} = null where {col} = any(%s)", (ids,))
            elif table not in ("app_users",):
                cur.execute(f"delete from {table} where {col} = any(%s)", (ids,))
    cur.execute("select table_name from information_schema.columns where table_schema = 'public' and column_name = 'is_demo' and table_name <> 'players'")
    last = ["matches", "teams", "competitions"]  # referenced by the rest
    tables = [t for (t,) in cur.fetchall() if t not in ("app_users", "orgs", *last)]
    for table in tables:
        cur.execute(f"delete from {table} where is_demo")
    cur.execute("delete from players where is_demo")
    for match_fk in ("events", "lineups", "player_match_index"):
        cur.execute(f"delete from {match_fk} where match_id in (select id from matches where is_demo)")
    cur.execute("delete from player_season_metrics where competition_id in (select id from competitions where is_demo)")
    for table in last:
        cur.execute(f"delete from {table} where is_demo")
    for col in ("birth_year", "height_cm", "preferred_foot"):
        cur.execute(f"update players set {col} = null, demo_fields = array_remove(demo_fields, %s) where %s = any(demo_fields)", (col, col))
    cur.execute("delete from app_users where is_demo")
    cur.execute("delete from auth.users where id = any(%s)", (users,))
    cur.execute("delete from orgs where is_demo")
    print("demo data removed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--remove", action="store_true", help="delete every demo row and value")
    a = ap.parse_args()
    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_DB)) as conn, conn.cursor() as cur:
        remove(cur) if a.remove else seed(cur)


if __name__ == "__main__":
    main()
