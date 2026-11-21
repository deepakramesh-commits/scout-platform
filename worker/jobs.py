"""The worker loop. The web app only inserts rows into `jobs`; this takes them with `for update skip locked`,
so several workers can run, and retries a failure with attempts + 1 and a growing delay.

    uv run --python 3.12 python jobs.py          # run forever
    uv run --python 3.12 python jobs.py --once   # drain the queue and exit
"""
import argparse
import os
import pathlib
import time
import traceback

import psycopg

from export_statsbomb import export
from metrics import compute_competition
from summaries import write_summary

DEFAULT_DB = "postgres://postgres:postgres@localhost:54330/postgres"
MAX_ATTEMPTS = 5
STALE_MINUTES = 15  # a job running longer than this belonged to a worker that died
EXPORTS = pathlib.Path(os.environ.get("STORAGE_DIR", pathlib.Path(__file__).parent.parent / "storage")) / "exports"


def compute_match_metrics(cur, payload):
    cur.execute("select key, metrics from attributes")
    attributes = dict(cur.fetchall())
    cur.execute("select min_minutes from competitions where id = %s", (payload["competition_id"],))
    compute_competition(cur, payload["competition_id"], cur.fetchone()[0], attributes)


def write_report(cur, payload):
    write_summary(cur, payload["player_id"], payload["competition_id"])


def delete_personal_data(cur, payload):
    """Consent withdrawn: identity, documents, market and test data go; the match record of events stays."""
    pid = payload["player_id"]
    for table in ("player_identity", "player_market", "physical_tests", "verifications"):
        cur.execute(f"delete from {table} where player_id = %s", (pid,))
    cur.execute("update players set birth_year = null, height_cm = null, preferred_foot = null, photo_url = null, "
                "photo_credit = null, photo_source_url = null, demo_fields = '{}' where id = %s", (pid,))


def export_match(cur, payload):
    export(cur, EXPORTS / payload["match_id"], match_id=payload["match_id"], published_only=False)


HANDLERS = {
    "compute_match_metrics": compute_match_metrics,
    "write_report": write_report,
    "delete_personal_data": delete_personal_data,
    "export_match": export_match,
}


def claim(conn):
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("""
            update jobs set status = 'queued', locked_at = null
            where status = 'running' and locked_at < now() - make_interval(mins => %s)""", (STALE_MINUTES,))
        cur.execute("""
            update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
            where id = (select id from jobs where status = 'queued' and run_after <= now()
                        order by id for update skip locked limit 1)
            returning id, kind, payload, attempts""")
        return cur.fetchone()


def run_one(conn) -> bool:
    job = claim(conn)
    if job is None:
        return False
    jid, kind, payload, attempts = job
    try:
        handler = HANDLERS.get(kind)
        if handler is None:
            raise ValueError(f"unknown job kind {kind!r}")
        with conn.transaction(), conn.cursor() as cur:
            handler(cur, payload)
            cur.execute("update jobs set status = 'done', finished_at = now(), last_error = null where id = %s", (jid,))
        print(f"job {jid} {kind}: done")
    except Exception as e:  # noqa: BLE001 - any failure is recorded on the job and retried
        print(f"job {jid} {kind}: attempt {attempts} failed: {e}")
        traceback.print_exc()
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(
                "update jobs set status = case when attempts >= %s then 'failed' else 'queued' end, "
                "run_after = now() + make_interval(secs => 30 * power(2, attempts)), last_error = %s, locked_at = null where id = %s",
                (MAX_ATTEMPTS, f"{type(e).__name__}: {e}"[:2000], jid))
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="drain the queue, then exit")
    a = ap.parse_args()
    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_DB), autocommit=True) as conn:
        while True:
            if not run_one(conn):
                if a.once:
                    break
                time.sleep(2)


if __name__ == "__main__":
    main()
