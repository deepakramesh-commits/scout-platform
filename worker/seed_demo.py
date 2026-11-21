"""Labelled demo data so every screen is full until real values exist.

    uv run --python 3.12 python seed_demo.py           # create or refresh (idempotent)
    uv run --python 3.12 python seed_demo.py --remove  # delete every demo row and value

Rules: every demo row has is_demo = true; demo values inside a real row are named in players.demo_fields;
a value that already exists is never overwritten; match events and the numbers computed from them are never touched.
"""
import argparse
import datetime as dt
import os
import random
import uuid

import psycopg

DEFAULT_DB = "postgres://postgres:postgres@localhost:54330/postgres"
NS = uuid.uuid5(uuid.NAMESPACE_URL, "scout-platform/demo")
TODAY = dt.date(2026, 11, 21)
UNDER_18 = 6  # profiles that land in the approval queue once phase 4 applies the age rule


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
# key, org, role, name; one user of each type, plus a second scout and analyst for the multi-report and QC screens
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
TESTS = {  # mean, sd, decimals: a realistic spread for senior and youth African players
    "sprint_10m": (1.78, 0.07, 2),
    "sprint_30m": (4.20, 0.15, 2),
    "endurance": (18.6, 1.2, 1),
    "jump": (40.0, 5.0, 1),
}
HEIGHT_BY_ROLE = {"GK": 189, "CB": 186, "ST": 182, "DM": 180, "CM": 178, "FB": 177, "AM": 175, "LW": 174, "RW": 174}


def birth_year(r, minutes):
    """Ages 18 to 35 for players with real minutes; the youngest band goes to fringe squad players."""
    age = int(r.triangular(18, 35, 26)) if minutes >= 90 else r.choice([18, 19, 20, 21, 22, 23, 24])
    return TODAY.year - age


def seed(cur):
    for key, name, kind in ORGS:
        cur.execute("insert into orgs (id, name, kind, is_demo) values (%s,%s,%s,true) on conflict (id) do update set name=excluded.name",
                    (did("org", key), name, kind))
    for key, org, role, name in USERS:
        uid = did("user", key)
        cur.execute("insert into auth.users (id) values (%s) on conflict do nothing", (uid,))
        cur.execute("insert into app_users (id, org_id, role, display_name, is_demo) values (%s,%s,%s,%s,true) "
                    "on conflict (id) do update set org_id=excluded.org_id, role=excluded.role, display_name=excluded.display_name",
                    (uid, did("org", org) if org else None, role, name))

    cur.execute("""
        select p.id, p.primary_position, p.birth_year, p.height_cm, p.preferred_foot, p.demo_fields,
               coalesce(sum(l.minutes_played), 0)::int as minutes
        from players p left join lineups l on l.player_id = p.id
        group by p.id order by minutes, p.id""")
    players = cur.fetchall()
    young = {p[0] for p in players[:UNDER_18] if p[2] is None}
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
        if r.random() < 0.6:  # a little over half the players have been tested
            when = TODAY - dt.timedelta(days=r.randint(20, 300))
            verified = r.random() < 0.5
            for test, (mean, sd, dp) in TESTS.items():
                cur.execute(
                    "insert into physical_tests (id, player_id, test, value, unit, tested_at, verified, is_demo) "
                    "select %s,%s,%s,%s,unit,%s,%s,true from physical_test_kinds where key=%s on conflict (id) do nothing",
                    (did("test", pid, test), pid, test, round(r.gauss(mean, sd), dp), when, verified, test))
    cur.execute("select count(*) from players where %s - birth_year < 18 and 'birth_year' = any(demo_fields)", (TODAY.year,))
    print(f"demo: {len(ORGS)} orgs, {len(USERS)} users, {len(players)} players filled, {cur.fetchone()[0]} under 18")


def remove(cur):
    cur.execute("delete from physical_tests where is_demo")
    cur.execute("delete from player_market where is_demo")
    for col in ("birth_year", "height_cm", "preferred_foot"):
        cur.execute(f"update players set {col} = null, demo_fields = array_remove(demo_fields, %s) where %s = any(demo_fields)", (col, col))
    cur.execute("delete from app_users where is_demo returning id")
    ids = [r[0] for r in cur.fetchall()]
    cur.execute("delete from auth.users where id = any(%s)", (ids,))
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
