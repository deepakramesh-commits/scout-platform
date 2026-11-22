import json
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


@pytest.mark.parametrize("position, phrase", [("AM", "as an AM."), ("ST", "as an ST."), ("FB", "as an FB."), ("CB", "as a CB."), ("GK", "as a GK.")])
def test_template_summary_reads_the_position_code_aloud_for_its_article(position, phrase):
    f = {"name": "A", "competition": "Cup", "position": position, "minutes": 90, "matches": 1, "ranked_against": 20,
         "standout_qualities": [], "birth_year": 2004, "birth_year_is_demo": True, "best_measures": [], "weakest_measures": []}
    assert phrase in template_summary(f)


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


def test_a_summary_never_names_a_measure_most_of_his_position_never_records():
    from summaries import facts
    try:
        c = psycopg.connect(DB, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    cid = c.execute("insert into competitions (name, country, season) values ('Test cup', 'GH', '2026') returning id").fetchone()[0]
    keepers = [r[0] for r in c.execute("select id from players order by id limit 3")]
    for pid, (pct, per90) in zip(keepers, [
        ({"dribbles_completed": 100, "saves": 40, "passes": 30}, {"dribbles_completed": 0.2, "saves": 2.0, "passes": 20.0}),
        ({"dribbles_completed": 50, "saves": 90, "passes": 60}, {"dribbles_completed": 0.0, "saves": 3.5, "passes": 25.0}),
        ({"dribbles_completed": 50, "saves": 60, "passes": 90}, {"dribbles_completed": 0.0, "saves": 2.5, "passes": 30.0}),
    ]):
        c.execute("insert into player_season_metrics (player_id, competition_id, role, minutes, per90, percentiles, peers) "
                  "values (%s, %s, 'GK', 900, %s::jsonb, %s::jsonb, 3)", (pid, cid, json.dumps(per90), json.dumps(pct)))
    text = template_summary(facts(c.cursor(), keepers[0], cid))
    c.rollback()
    c.close()
    assert "dribbles completed" not in text
    assert "saves (40th percentile)" in text and "passes (30th percentile)" in text


def test_a_summary_reads_ball_losses_as_lower_is_better():
    from summaries import facts
    try:
        c = psycopg.connect(DB, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    cid = c.execute("insert into competitions (name, country, season) values ('Test cup', 'GH', '2026') returning id").fetchone()[0]
    careful, careless, middle = [r[0] for r in c.execute("select id from players order by id limit 3")]
    for pid, losses in [(careful, 10), (careless, 100), (middle, 50)]:
        pct = {"ball_losses": losses, "passes": 50, "tackles": 60, "interceptions": 40}
        per90 = {"ball_losses": losses / 10, "passes": 20.0, "tackles": 2.0, "interceptions": 1.5}
        c.execute("insert into player_season_metrics (player_id, competition_id, role, minutes, per90, percentiles, peers) "
                  "values (%s, %s, 'CM', 900, %s::jsonb, %s::jsonb, 3)", (pid, cid, json.dumps(per90), json.dumps(pct)))
    few, many = facts(c.cursor(), careful, cid), facts(c.cursor(), careless, cid)
    text = template_summary(few)
    c.rollback()
    c.close()
    assert "ball_losses" not in [m["measure"] for m in few["weakest_measures"]]
    assert "ball_losses" not in [m["measure"] for m in many["best_measures"]]
    assert "ball losses (10th percentile, lower is better)" in text


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


def test_withdrawal_deletes_the_id_documents_the_guardian_contact_and_his_match_exports(tmp_path, monkeypatch):
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
        m = cur.execute("select id from matches where not is_demo limit 1").fetchone()[0]
        team = cur.execute("select home_team_id from matches where id = %s", (m,)).fetchone()[0]
        cur.execute("insert into lineups (match_id, team_id, player_id) values (%s, %s, %s) on conflict do nothing", (m, team, pid))
        monkeypatch.setattr(jobs, "EXPORTS", tmp_path / "exports")
        (tmp_path / "exports" / str(m) / "events").mkdir(parents=True)
        (tmp_path / "exports" / "other-match").mkdir()
        jobs.delete_personal_data(cur, {"player_id": str(pid)})
        assert [p.name for p in ids.iterdir()] == ["someone-else-1.pdf"]
        assert [p.name for p in (tmp_path / "exports").iterdir()] == ["other-match"]
        assert cur.execute("select count(*) from consents where player_id = %s and guardian_contact is not null", (pid,)).fetchone()[0] == 0
    conn.rollback()
    conn.close()


def test_withdrawal_deletes_his_summaries_and_no_summary_is_written_after_it():
    try:
        conn = psycopg.connect(DB, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("database not running")
    with conn.cursor() as cur:
        pid, cid = cur.execute("select player_id, competition_id from player_season_metrics where style is not null limit 1").fetchone()
        cur.execute("insert into player_summaries (player_id, competition_id, text, source) values (%s, %s, 'old', 'template') "
                    "on conflict (player_id, competition_id) do update set text = excluded.text", (pid, cid))
        cur.execute("update players set status = 'withdrawn' where id = %s", (pid,))
        jobs.delete_personal_data(cur, {"player_id": str(pid)})
        assert cur.execute("select count(*) from player_summaries where player_id = %s", (pid,)).fetchone()[0] == 0
        jobs.write_report(cur, {"player_id": str(pid), "competition_id": str(cid)})
        assert cur.execute("select count(*) from player_summaries where player_id = %s", (pid,)).fetchone()[0] == 0
    conn.rollback()
    conn.close()
