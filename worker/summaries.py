"""Short scouting summaries from a player's numbers. A plain template by default; Claude when ANTHROPIC_API_KEY is set.

People decide; the summary only restates the numbers, so the template and the model get the same facts.
"""
import json
import os

import pandas as pd

from metrics import LOWER_IS_BETTER, recorded_by_most

MODEL = "claude-opus-5-5"
SYSTEM = (
    "You write three or four plain sentences for a European club scout about an African player, using only the facts "
    "given as JSON. Lead with the standout qualities. Say when a ranking rests on few players or few minutes. "
    "A measure with lower_is_better is good when its percentile is low; say so when you quote it. "
    "Never invent a number, a trait or a comparison that is not in the facts. No headings, no lists."
)


def facts(cur, player_id, competition_id) -> dict:
    cur.execute("""
        select p.display_name, p.birth_year, 'birth_year' = any(p.demo_fields) as age_is_demo, c.name, m.role, m.minutes, m.peers,
               m.per90, m.percentiles, m.attr_percentiles,
               (select count(*) from lineups l join matches mt on mt.id = l.match_id
                where l.player_id = p.id and mt.competition_id = c.id and l.minutes_played > 0) as matches
        from players p join player_season_metrics m on m.player_id = p.id join competitions c on c.id = m.competition_id
        where p.id = %s and c.id = %s order by m.minutes desc limit 1""", (player_id, competition_id))
    row = cur.fetchone()
    if row is None:
        raise LookupError(f"no metrics for player {player_id} in competition {competition_id}")
    name, by, demo_age, comp, role, minutes, peers, per90, pct, attr, matches = row
    cur.execute("select key, label from attributes")
    labels = dict(cur.fetchall())
    cur.execute("select role, per90, percentiles from player_season_metrics where competition_id = %s and role = %s",
                (competition_id, role))
    # the attribute rule: a measure most of his position never records ranks him on noise, so it is not named
    counted = recorded_by_most(pd.DataFrame(cur.fetchall(), columns=["role", "per90", "percentiles"]))
    # stored percentiles are raw, so a high one for a lower-is-better measure is bad: rank on 100 - pct for those
    ranked = sorted(((k, v) for k, v in pct.items() if k in counted and counted.at[role, k]),
                    key=lambda kv: kv[1] - 100 if kv[0] in LOWER_IS_BETTER else -kv[1])

    def measure(k, v):
        return {"measure": k, "percentile": v, "value": per90.get(k), "lower_is_better": k in LOWER_IS_BETTER}

    return {
        "name": name, "competition": comp, "position": role, "minutes": minutes, "matches": matches,
        "ranked_against": peers, "birth_year": by, "birth_year_is_demo": demo_age,
        "standout_qualities": [labels.get(k, k) for k, v in sorted(attr.items(), key=lambda kv: -kv[1]) if v > 85][:2],
        "best_measures": [measure(k, v) for k, v in ranked[:3]],
        "weakest_measures": [measure(k, v) for k, v in ranked[-2:]] if ranked else [],
    }


def nice(key: str) -> str:
    return "xT" if key == "xt" else "xG" if key == "xg" else key.removesuffix("_pct").replace("_", " ")


def count(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else many or one + 's'}"


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def article(code: str) -> str:
    # position codes are read letter by letter, and these letters start with a vowel sound ("an AM", "an ST")
    return "an" if code[:1] in "AEFHILMNORSX" else "a"


def template_summary(f: dict) -> str:
    out = [f"{f['name']} played {count(f['minutes'], 'minute')} in {count(f['matches'], 'match', 'matches')} at {f['competition']} "
           f"as {article(f['position'])} {f['position']}."]
    if f["standout_qualities"]:
        out.append(f"Standout qualities: {' and '.join(q.lower() for q in f['standout_qualities'])}.")
    if f["best_measures"]:
        best = ", ".join(f"{nice(m['measure'])} ({ordinal(m['percentile'])} percentile{', lower is better' * (m['measure'] in LOWER_IS_BETTER)})"
                         for m in f["best_measures"])
        out.append(f"Best measures against other {f['position']} players: {best}.")
    else:
        out.append("He has not played enough minutes to be ranked yet.")
    if f["weakest_measures"]:
        out.append(f"Weakest: {', '.join(nice(m['measure']) for m in f['weakest_measures'])}.")
    if f["ranked_against"] and f["ranked_against"] < 10:
        out.append(f"Rankings rest on only {count(f['ranked_against'], 'player')} in this position, so treat them as indicative.")
    return " ".join(out)


def claude_summary(f: dict) -> str:
    import anthropic

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM,
        output_config={"effort": "low"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": json.dumps(f, ensure_ascii=False)}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("the model declined to write this summary")
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        raise RuntimeError(f"empty summary (stop_reason {response.stop_reason})")
    return text


def write_summary(cur, player_id, competition_id) -> str:
    f = facts(cur, player_id, competition_id)
    use_claude = bool(os.environ.get("ANTHROPIC_API_KEY"))
    text, source = (claude_summary(f), "claude") if use_claude else (template_summary(f), "template")
    cur.execute(
        "insert into player_summaries (player_id, competition_id, text, source, model) values (%s,%s,%s,%s,%s) "
        "on conflict (player_id, competition_id) do update set text=excluded.text, source=excluded.source, "
        "model=excluded.model, created_at=now()",
        (player_id, competition_id, text, source, MODEL if use_claude else None))
    return source
