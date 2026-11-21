"""Possession value per action: expected threat (xT) with socceraction, fitted on a competition's own matches.

The match export (export_statsbomb.py) is read back with socceraction's StatsBomb loader, exactly as any outside
tool would read it, converted to SPADL, and every successful move (pass, cross, carry) is rated by how much it
raised the chance of scoring within the next few actions.
"""
import pathlib
import tempfile
import warnings

import pandas as pd

from export_statsbomb import export, sid

warnings.filterwarnings("ignore", module="socceraction")
warnings.filterwarnings("ignore", category=FutureWarning)


def competition_xt(cur, comp_id) -> pd.DataFrame:
    import socceraction.spadl as spadl
    from socceraction.data.statsbomb import StatsBombLoader
    from socceraction.xthreat import ExpectedThreat

    with tempfile.TemporaryDirectory() as tmp:
        matches = export(cur, pathlib.Path(tmp), competition_id=comp_id)
        if not matches:
            return pd.DataFrame(columns=["match_id", "player_id", "value"])
        loader = StatsBombLoader(getter="local", root=tmp)
        frames = []
        for m in matches:
            events = loader.events(m["match_id"])
            home = m["home_team"]["home_team_id"]
            frames.append(spadl.play_left_to_right(spadl.statsbomb.convert_to_actions(events, home_team_id=home), home))
    actions = spadl.add_names(pd.concat(frames, ignore_index=True))
    model = ExpectedThreat(l=16, w=12)
    model.fit(actions)
    actions["value"] = model.rate(actions)
    rated = actions.dropna(subset=["value"])

    cur.execute("select id from players")
    rows = cur.fetchall()
    players = {sid(p): p for (p,) in rows}
    assert len(players) == len(rows), "two players share a 31-bit StatsBomb id"
    cur.execute("select id from matches where competition_id = %s", (comp_id,))
    match_ids = {sid(m): m for (m,) in cur.fetchall()}
    out = rated.groupby(["game_id", "player_id"])["value"].sum().reset_index()
    out["match_id"] = out["game_id"].map(match_ids)
    out["player_id"] = out["player_id"].astype(int).map(players)
    return out.dropna(subset=["match_id", "player_id"])[["match_id", "player_id", "value"]]


if __name__ == "__main__":
    import os
    import psycopg
    with psycopg.connect(os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:54330/postgres")) as conn, conn.cursor() as cur:
        cur.execute("select id from competitions limit 1")
        df = competition_xt(cur, cur.fetchone()[0])
        print(len(df), df["value"].describe().to_string())
