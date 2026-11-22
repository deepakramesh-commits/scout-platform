import os

import psycopg
import pytest

import jobs
from summaries import template_summary

DB = os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:54330/postgres")


def test_template_summary_states_only_the_facts_and_flags_small_groups():
    f = {"name": "A", "competition": "Cup", "position": "AM", "minutes": 300, "matches": 4, "ranked_against": 4,
         "standout_qualities": ["Final pass"], "birth_year": 2004, "birth_year_is_demo": True,
         "best_measures": [{"measure": "key_passes", "percentile": 100, "value": 3.1}, {"measure": "xt", "percentile": 75, "value": 0.1}],
         "weakest_measures": [{"measure": "pass_accuracy_pct", "percentile": 25, "value": 70.0}]}
    text = template_summary(f)
    assert "300 minutes in 4 matches" in text and "final pass" in text
    assert "key passes (100th percentile)" in text and "xT (75th percentile)" in text
    assert "pass accuracy" in text and "only 4 players" in text


def test_template_summary_counts_read_as_english_for_one():
    f = {"name": "A", "competition": "Cup", "position": "AM", "minutes": 1, "matches": 1, "ranked_against": 1,
         "standout_qualities": [], "birth_year": 2004, "birth_year_is_demo": True,
         "best_measures": [{"measure": "xt", "percentile": p, "value": 0.1} for p in (1, 2, 3)]
         + [{"measure": "xg", "percentile": p, "value": 0.1} for p in (11, 12, 13, 21, 22, 23)],
         "weakest_measures": []}
    text = template_summary(f)
    assert "1 minute in 1 match at" in text and "only 1 player in" in text
    for p in ("1st", "2nd", "3rd", "11th", "12th", "13th", "21st", "22nd", "23rd"):
        assert f"({p} percentile)" in text


@pytest.fixture
def conn():
    try:
        c = psycopg.connect(DB, autocommit=True, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    created = []
    yield c, created
    c.execute("delete from jobs where id = any(%s)", (created,))
    c.close()


def add_job(c, created, kind, payload):
    jid = c.execute("insert into jobs (kind, payload) values (%s, %s::jsonb) returning id", (kind, payload)).fetchone()[0]
    created.append(jid)
    c.execute("update jobs set run_after = now() + interval '1 day' where status = 'queued' and id <> %s", (jid,))
    return jid


def test_failed_job_is_retried_later_with_its_error(conn):
    c, created = conn
    jid = add_job(c, created, "no_such_kind", "{}")
    assert jobs.run_one(c)
    status, attempts, err, later = c.execute(
        "select status, attempts, last_error, run_after > now() from jobs where id = %s", (jid,)).fetchone()
    assert (status, attempts, later) == ("queued", 1, True) and "unknown job kind" in err
    c.execute("update jobs set attempts = %s, run_after = now() where id = %s", (jobs.MAX_ATTEMPTS - 1, jid))
    jobs.run_one(c)
    assert c.execute("select status from jobs where id = %s", (jid,)).fetchone()[0] == "failed"
    c.execute("update jobs set run_after = now() where status = 'queued' and run_after > now() + interval '23 hours'")


def test_write_report_job_stores_a_template_summary(conn, monkeypatch):
    c, created = conn
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    pid, cid = c.execute("select player_id, competition_id from player_season_metrics where style is not null limit 1").fetchone()
    jid = add_job(c, created, "write_report", f'{{"player_id": "{pid}", "competition_id": "{cid}"}}')
    assert jobs.run_one(c)
    assert c.execute("select status from jobs where id = %s", (jid,)).fetchone()[0] == "done"
    assert c.execute("select source from player_summaries where player_id = %s", (pid,)).fetchone()[0] == "template"
    c.execute("update jobs set run_after = now() where status = 'queued' and run_after > now() + interval '23 hours'")


def test_withdrawal_deletes_the_id_documents_and_the_guardian_contact(tmp_path, monkeypatch):
    try:
        conn = psycopg.connect(DB, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    monkeypatch.setattr(jobs, "STORAGE", tmp_path)
    with conn.cursor() as cur:
        pid = cur.execute("select player_id from consents limit 1").fetchone()[0]
        cur.execute("update consents set guardian_contact = '+233 20 000 0000' where player_id = %s", (pid,))
        ids = tmp_path / "private" / "ids"
        ids.mkdir(parents=True)
        (ids / f"{pid}-1.pdf").write_bytes(b"%PDF")
        (ids / "someone-else-1.pdf").write_bytes(b"%PDF")
        jobs.delete_personal_data(cur, {"player_id": str(pid)})
        assert [p.name for p in ids.iterdir()] == ["someone-else-1.pdf"]
        assert cur.execute("select count(*) from consents where player_id = %s and guardian_contact is not null", (pid,)).fetchone()[0] == 0
    conn.rollback()
    conn.close()
