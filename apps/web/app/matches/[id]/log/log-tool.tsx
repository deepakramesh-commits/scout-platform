"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Kbd } from "@astryxdesign/core/Kbd";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { BODY_PARTS, EVENT_SPEC, SPEC_BY_KEY, SPEC_BY_TYPE, type EventType, type LoggedEvent } from "@/lib/event-spec";
import { denormalise, periodAt } from "@/lib/log-tool";
import { clock, type Period, type Sample } from "@/lib/qc";
import { uuid } from "@/lib/sheet-sync";
import { moveMatch, savePeriods } from "./actions";

export type LogPlayer = { player_id: string; team_id: string; shirt_number: number | null; display_name: string };
export type Logged = LoggedEvent & { id: string; player_id: string; team_id: string; period: number; video_seconds: number };
type Row = Logged & { state: "saving" | "saved" | "failed"; error?: string };
type Point = { x: number; y: number };
type Draft = {
  id: string | null; type: EventType | null; outcome: string | null; bodyPart: string | null; extra: Record<string, unknown>;
  start: Point | null; end: Point | null; t: number | null;
};

const EMPTY: Draft = { id: null, type: null, outcome: null, bodyPart: null, extra: {}, start: null, end: null, t: null };
const round = (n: number) => Math.round(n * 10) / 10;
const PERIOD_NAME: Record<number, string> = { 1: "First half", 2: "Second half", 3: "Extra time, first", 4: "Extra time, second" };

function startDraft(type: EventType): Draft {
  const extra: Record<string, unknown> = {};
  if (type.type === "goalkeeper") extra.gk_type = type.choices![0].options[0].value;
  return { ...EMPTY, type, outcome: type.outcomes[0]?.value ?? null, extra };
}

export function LogTool(props: {
  matchId: string; mode: "events" | "review"; status: string; videoSrc: string | null;
  teams: { id: string; name: string }[]; players: LogPlayer[]; periods: Period[]; sample: Sample | null; initial: Logged[];
  clip: { before: number; after: number }; startAt: number | null;
}) {
  const { matchId, mode, teams, players, sample } = props;
  const video = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);
  const [teamId, setTeamId] = useState(teams[0].id);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [shirt, setShirt] = useState("");
  const shirtBuffer = useRef("");
  const shirtTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [rows, setRows] = useState<Row[]>(props.initial.map((e) => ({ ...e, state: "saved" })));
  const [marks, setMarks] = useState<Partial<Period>[]>(props.periods);
  const [extraTime, setExtraTime] = useState(props.periods.some((p) => p.period > 2));
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [status, setStatus] = useState(props.status);

  const team = teams.find((t) => t.id === teamId)!;
  const squad = useMemo(() => players.filter((p) => p.team_id === teamId), [players, teamId]);
  const player = players.find((p) => p.player_id === playerId) ?? null;
  const name = (pid: string) => players.find((p) => p.player_id === pid);
  // Incomplete marks still place events: a started period runs until it is marked as ended.
  const livePeriods: Period[] = marks.filter((m) => m.period && m.start != null).map((m) => ({ period: m.period!, start: m.start!, end: m.end ?? Infinity }));

  const save = useCallback(async (e: Logged) => {
    setRows((rs) => [{ ...e, state: "saving" as const }, ...rs.filter((r) => r.id !== e.id)]);
    try {
      const res = await fetch(`/api/matches/${matchId}/events`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...e, table: mode }),
      });
      const body = (await res.json().catch(() => ({}))) as { errors?: string[]; error?: string };
      if (!res.ok) throw new Error(body.errors?.join("; ") ?? body.error ?? `the server answered ${res.status}`);
      setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, state: "saved" } : r)));
      if (mode === "events" && status === "uploaded") setStatus("tagging");
    } catch (err) {
      const error = err instanceof TypeError ? "no connection; retrying when it returns" : (err as Error).message;
      setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, state: "failed", error } : r)));
    }
  }, [matchId, mode, status]);

  useEffect(() => {
    const retry = () => rows.filter((r) => r.state === "failed" && r.error?.startsWith("no connection")).forEach((r) => void save(r));
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [rows, save]);

  const remove = async (r: Row) => {
    if (!confirm(`Delete this ${SPEC_BY_TYPE[r.type]?.label.toLowerCase() ?? "event"}?`)) return;
    const res = await fetch(`/api/matches/${matchId}/events?table=${mode}&event=${r.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setRows((rs) => rs.filter((x) => x.id !== r.id));
    else setNotice("Could not delete: no connection or no permission. Try again.");
  };

  const commit = useCallback((d: Draft) => {
    const v = video.current;
    if (!d.type || !player) { setNotice("Choose a player (type his shirt number) and an event type (its key) first."); return; }
    if (!d.start) return;
    const t = d.t ?? round(v?.currentTime ?? 0);
    if (sample && mode === "review" && (t < sample.start || t > sample.end)) {
      setNotice(`This moment (${clock(t)}) is outside the sample window, ${clock(sample.start)} to ${clock(sample.end)}.`);
      setDraft(EMPTY);
      return;
    }
    const prior = d.id ? rows.find((r) => r.id === d.id) : null;
    const e: Logged = {
      id: d.id ?? uuid(), player_id: player.player_id, team_id: player.team_id,
      period: prior?.period ?? periodAt(livePeriods, t), video_seconds: prior?.video_seconds ?? t,
      type: d.type.type, outcome: d.outcome,
      x: round(d.start.x), y: round(d.start.y), end_x: d.end ? round(d.end.x) : null, end_y: d.end ? round(d.end.y) : null,
      body_part: d.bodyPart, extra: d.extra,
    };
    void save(e);
    setNotice(null);
    setDraft(EMPTY);
    setPlayerId(null);
  }, [player, rows, sample, mode, livePeriods, save]);

  const clickPitch = (p: Point) => {
    if (!draft.type || !player) { setNotice("Choose a player (type his shirt number) and an event type (its key) first."); return; }
    const t = draft.t ?? (draft.id ? null : round(video.current?.currentTime ?? 0));
    if (draft.type.end === "required" && (!draft.start || draft.end)) { setDraft({ ...draft, start: p, end: null, t }); return; }
    const next = draft.type.end === "required" ? { ...draft, end: p, t } : { ...draft, start: p, t };
    commit(next);
  };

  const clip = (r: Logged) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, r.video_seconds - props.clip.before);
    stopAt.current = r.video_seconds + props.clip.after;
    void v.play();
  };

  const edit = (r: Row) => {
    const e = denormalise(r);
    const spec = SPEC_BY_TYPE[e.type];
    setTeamId(r.team_id);
    setPlayerId(r.player_id);
    setDraft({
      id: r.id, type: spec, outcome: e.outcome, bodyPart: e.body_part, extra: e.extra,
      start: e.x != null && e.y != null ? { x: e.x, y: e.y } : null, end: e.end_x != null && e.end_y != null ? { x: e.end_x, y: e.end_y } : null, t: r.video_seconds,
    });
    if (video.current) video.current.currentTime = r.video_seconds;
    setNotice("Editing: change what is wrong, then click the pitch again or press Enter to save.");
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || el?.closest("input, textarea, select, [contenteditable=true], [role=combobox], [role=listbox]")) return;
      const v = video.current;
      if (ev.shiftKey && /^Digit[1-5]$/.test(ev.code) && draft.type?.outcomes.length) {
        const o = draft.type.outcomes[Number(ev.code.slice(5)) - 1];
        if (o) setDraft((d) => ({ ...d, outcome: o.value }));
        ev.preventDefault();
        return;
      }
      if (/^\d$/.test(ev.key)) {
        // A pause of over a second starts a new number, so "1" then "6" later is 6, not 16.
        const next = (shirtBuffer.current + ev.key).slice(-2);
        shirtBuffer.current = next;
        setShirt(next);
        const hit = squad.find((p) => String(p.shirt_number) === next);
        if (hit) setPlayerId(hit.player_id);
        clearTimeout(shirtTimer.current);
        shirtTimer.current = setTimeout(() => { shirtBuffer.current = ""; setShirt(""); }, 1200);
        return;
      }
      const key = ev.key.toLowerCase();
      if (key === " ") { ev.preventDefault(); if (v) void (v.paused ? v.play() : v.pause()); return; }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.preventDefault();
        if (v) v.currentTime = Math.max(0, v.currentTime + (ev.key === "ArrowLeft" ? -1 : 1) * (ev.shiftKey ? 10 : 2));
        return;
      }
      if (ev.key === "Escape") { setDraft(EMPTY); setNotice(null); return; }
      if (ev.key === "Enter") { if (draft.start && (draft.type?.end !== "required" || draft.end)) commit(draft); return; }
      if (key === "q") {
        setTeamId((id) => teams.find((t) => t.id !== id)!.id);
        setPlayerId(null);
        return;
      }
      const spec = SPEC_BY_KEY[key];
      if (spec && !ev.shiftKey) setDraft((d) => (d.id ? { ...startDraft(spec), id: d.id, start: d.start, end: spec.end === "required" ? d.end : null, t: d.t } : startDraft(spec)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, squad, teams, commit]);

  const markPeriod = async (period: number, edge: "start" | "end") => {
    const t = round(video.current?.currentTime ?? 0);
    const next = [...marks.filter((m) => m.period !== period), { ...marks.find((m) => m.period === period), period, [edge]: t }].sort((a, b) => a.period! - b.period!);
    setMarks(next);
    const complete = next.filter((m): m is Period => m.period != null && m.start != null && m.end != null);
    const r = await savePeriods(matchId, complete);
    setNotice(r.ok ? `${PERIOD_NAME[period]} ${edge === "start" ? "starts" : "ends"} at ${clock(t)}.` : r.error);
  };

  const pitchRef = useRef<SVGSVGElement>(null);
  const onPitch = (ev: React.MouseEvent<SVGSVGElement>) => {
    const r = pitchRef.current!.getBoundingClientRect();
    clickPitch({ x: Math.min(120, Math.max(0, ((ev.clientX - r.left) / r.width) * 120)), y: Math.min(80, Math.max(0, ((ev.clientY - r.top) / r.height) * 80)) });
  };

  const failed = rows.filter((r) => r.state === "failed").length;
  const inSample = sample && now >= sample.start && now <= sample.end;
  const recent = rows.slice(0, 25);
  const typeOptions = EVENT_SPEC.map((s) => ({ value: s.type, label: `${s.label} (${s.key.toUpperCase()})` }));
  const playerOptions = squad.map((p) => ({ value: p.player_id, label: `${p.shirt_number ?? "?"} · ${p.display_name}` }));

  return (
    <VStack gap={4}>
      {mode === "review" && sample && (
        <Banner status={inSample ? "info" : "warning"} title={`Sample window: ${PERIOD_NAME[sample.period] ?? `period ${sample.period}`}, ${clock(sample.start)} to ${clock(sample.end)} in the video`}
          description="Log every event in this window again, without looking at the first analyst's events. Your events are kept apart and never feed a profile."
          endContent={<Button size="sm" label="Go to the window start" onClick={() => { if (video.current) video.current.currentTime = sample.start; }} />} />
      )}
      {failed > 0 && <Banner status="error" title={`${failed} ${failed === 1 ? "event has" : "events have"} not saved`} description="They are marked below. A save without a connection is retried when it returns; use Retry for the others." />}
      {notice && <Banner status="info" title={notice} onDismiss={() => setNotice(null)} />}

      <Grid columns={{ minWidth: 440, max: 2, repeat: "fit" }} gap={4} align="start">
        <VStack gap={3}>
          {props.videoSrc ? (
            <video ref={video} className="match-video" src={props.videoSrc} controls preload="auto"
              onLoadedMetadata={(e) => { if (props.startAt != null) e.currentTarget.currentTime = props.startAt; }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setNow(t);
                if (stopAt.current != null && t >= stopAt.current) { e.currentTarget.pause(); stopAt.current = null; }
              }} />
          ) : (
            <Banner status="warning" title="No video for this match yet" description="The coordinator uploads it on the Video page. You can still import events." />
          )}
          <HStack gap={3} wrap="wrap" vAlign="center">
            <Text weight="semibold">{clock(now)}</Text>
            <Token size="sm" label={PERIOD_NAME[periodAt(livePeriods, now)] ?? "Period 1"} />
            {livePeriods.length === 0 && <Text type="supporting">Mark where each half starts and ends so events fall in the right period.</Text>}
          </HStack>
          {mode === "events" && (
            <Card>
              <VStack gap={2}>
                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                  <Heading level={3}>Periods in the video</Heading>
                  <Switch size="sm" label="Extra time" value={extraTime} onChange={setExtraTime} />
                </HStack>
                {[1, 2, ...(extraTime ? [3, 4] : [])].map((p) => {
                  const m = marks.find((x) => x.period === p);
                  return (
                    <HStack key={p} gap={2} vAlign="center" wrap="wrap">
                      <Text>{PERIOD_NAME[p]}</Text>
                      <Text type="supporting">{m?.start == null ? "Not started" : m.end == null ? `Started at ${clock(m.start)}` : `${clock(m.start)} to ${clock(m.end)}`}</Text>
                      <Button size="sm" label="Starts now" onClick={() => markPeriod(p, "start")} isDisabled={!props.videoSrc} />
                      <Button size="sm" label="Ends now" onClick={() => markPeriod(p, "end")} isDisabled={!props.videoSrc || m?.start == null} />
                    </HStack>
                  );
                })}
              </VStack>
            </Card>
          )}
        </VStack>

        <Card>
          <VStack gap={3}>
            <HStack gap={2} wrap="wrap" vAlign="end">
              <SegmentedControl label="Acting team" value={teamId} onChange={(v) => { setTeamId(v); setPlayerId(null); }}>
                {teams.map((t) => <SegmentedControlItem key={t.id} value={t.id} label={t.name} />)}
              </SegmentedControl>
              <Text type="supporting">{shirt ? `Shirt ${shirt}…` : "Type a shirt number"}</Text>
            </HStack>
            <Grid columns={2} gap={2}>
              <Selector label="Player" size="sm" hasSearch value={playerId ?? undefined} placeholder="Shirt number or name" options={playerOptions}
                onChange={setPlayerId} emptyText="No players: the match sheet and squad are empty" />
              <Selector label="Event" size="sm" value={draft.type?.type} placeholder="Press its key" options={typeOptions}
                onChange={(v) => setDraft(startDraft(SPEC_BY_TYPE[v]))} />
            </Grid>
            {draft.type && draft.type.outcomes.length > 0 && (
              <SegmentedControl label="Outcome" size="sm" value={draft.outcome ?? ""} onChange={(v) => setDraft({ ...draft, outcome: v })}>
                {draft.type.outcomes.map((o) => <SegmentedControlItem key={o.value} value={o.value} label={o.label} />)}
              </SegmentedControl>
            )}
            {draft.type && (draft.type.bodyPart || draft.type.flags.length > 0 || draft.type.choices) && (
              <HStack gap={3} wrap="wrap" vAlign="center">
                {draft.type.bodyPart && (
                  <Selector label="Body part" size="sm" hasClear value={draft.bodyPart} placeholder="Not recorded"
                    options={BODY_PARTS} onChange={(v: string | null) => setDraft({ ...draft, bodyPart: v ?? null })} />
                )}
                {draft.type.choices?.map((ch) => (
                  <Selector key={ch.key} label={ch.label} size="sm" hasClear value={(draft.extra[ch.key] as string | undefined) ?? null}
                    placeholder="None" options={ch.options} onChange={(v: string | null) => {
                      const extra = { ...draft.extra };
                      if (v) extra[ch.key] = v; else if (ch.key !== "gk_type") delete extra[ch.key]; // a goalkeeper action always needs its type
                      setDraft({ ...draft, extra });
                    }} />
                ))}
                {draft.type.flags.map((f) => (
                  <CheckboxInput key={f.key} size="sm" label={f.label} value={Boolean(draft.extra[f.key])} onChange={(on) => {
                    const extra = { ...draft.extra };
                    if (on) extra[f.key] = true; else delete extra[f.key];
                    setDraft({ ...draft, extra });
                  }} />
                ))}
              </HStack>
            )}
            <Text type="supporting">
              {!player || !draft.type
                ? `${player ? `${player.shirt_number} ${player.display_name}` : "No player"} · ${draft.type?.label ?? "no event type"}`
                : draft.type.end === "required" && !draft.start
                  ? `${player.display_name}: ${draft.type.label.toLowerCase()}. Click where it starts.`
                  : draft.type.end === "required" && !draft.end
                    ? "Now click where the ball ended. It saves on that click."
                    : `${player.display_name}: ${draft.type.label.toLowerCase()}. Click where it happened; it saves on the click.`}
            </Text>
            <svg ref={pitchRef} className="log-pitch" viewBox="0 0 120 80" onClick={onPitch} role="img"
              aria-label={`Pitch with ${team.name} attacking to the right. Click to place the event.`}>
              <rect className="line" x="0.3" y="0.3" width="119.4" height="79.4" />
              <line className="line" x1="60" y1="0" x2="60" y2="80" />
              <circle className="line" cx="60" cy="40" r="10" />
              <rect className="line" x="0.3" y="18" width="18" height="44" />
              <rect className="line" x="101.7" y="18" width="18" height="44" />
              <rect className="line" x="0.3" y="30" width="6" height="20" />
              <rect className="line" x="113.7" y="30" width="6" height="20" />
              <text className="dir" x="60" y="5" fontSize={3} textAnchor="middle">{team.name} attacking →</text>
              {rows.filter((r) => r.team_id === teamId && r.x != null && r.id !== draft.id).slice(0, 8).map((r) => (
                <circle key={r.id} className="ghost" cx={r.x!} cy={r.y!} r="0.9" />
              ))}
              {draft.start && draft.end && <line className="path" x1={draft.start.x} y1={draft.start.y} x2={draft.end.x} y2={draft.end.y} />}
              {draft.start && <circle key={`s${draft.start.x}`} className="start" cx={draft.start.x} cy={draft.start.y} r="1.4" />}
              {draft.end && <circle key={`e${draft.end.x}`} className="end" cx={draft.end.x} cy={draft.end.y} r="1.6" />}
            </svg>
            {draft.id && (
              <HStack gap={2}>
                <Button size="sm" variant="primary" label="Save changes" onClick={() => commit(draft)} isDisabled={!draft.start || (draft.type?.end === "required" && !draft.end)} />
                <Button size="sm" variant="ghost" label="Cancel edit" onClick={() => setDraft(EMPTY)} />
              </HStack>
            )}
          </VStack>
        </Card>
      </Grid>

      <Grid columns={{ minWidth: 440, max: 2, repeat: "fit" }} gap={4} align="start">
        <Card padding={0}>
          <VStack gap={2} padding={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
              <Heading level={2}>{mode === "review" ? "Your sample events" : "Recent events"}</Heading>
              <Text type="supporting">{rows.length} logged{mode === "events" ? ` · match ${status}` : ""}</Text>
            </HStack>
            {mode === "events" && status !== "published" && (
              <HStack gap={2} wrap="wrap">
                {status !== "review" ? (
                  <Button size="sm" label="Send to review" onClick={async () => { const r = await moveMatch(matchId, "review"); setNotice(r.ok ? "Sent to the reviewer." : r.error); if (r.ok) setStatus("review"); }} isDisabled={rows.length === 0} />
                ) : (
                  <Button size="sm" label="Back to tagging" onClick={async () => { const r = await moveMatch(matchId, "tagging"); setNotice(r.ok ? "Back in tagging." : r.error); if (r.ok) setStatus("tagging"); }} />
                )}
              </HStack>
            )}
          </VStack>
          {recent.length === 0 ? (
            <VStack padding={4}><Text color="secondary">No events yet. Pause the video at an action, type the shirt number, press the event key and click the pitch.</Text></VStack>
          ) : (
            <Table density="compact">
              <TableHeader>
                <TableRow><TableHeaderCell>Time</TableHeaderCell><TableHeaderCell>Player</TableHeaderCell><TableHeaderCell>Event</TableHeaderCell><TableHeaderCell>Saved</TableHeaderCell><TableHeaderCell>Actions</TableHeaderCell></TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((r) => {
                  const p = name(r.player_id);
                  const spec = SPEC_BY_TYPE[r.type];
                  const e = denormalise(r);
                  const outcome = spec?.outcomes.find((o) => o.value === e.outcome)?.label;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{clock(r.video_seconds)} · P{r.period}</TableCell>
                      <TableCell>{p ? `${p.shirt_number ?? "?"} ${p.display_name}` : "Unknown"}</TableCell>
                      <TableCell>{spec?.label ?? r.type}{outcome ? `, ${outcome.toLowerCase()}` : ""}</TableCell>
                      <TableCell>
                        {r.state === "saved" ? <Token size="sm" label="Saved" color="green" /> : r.state === "saving" ? <Token size="sm" label="Saving" color="gray" />
                          : <Token size="sm" label="Not saved" color="red" description={r.error} />}
                      </TableCell>
                      <TableCell>
                        <HStack gap={1}>
                          <Button size="sm" variant="ghost" label="Clip" onClick={() => clip(r)} isDisabled={!props.videoSrc} />
                          <Button size="sm" variant="ghost" label="Edit" onClick={() => edit(r)} />
                          {r.state === "failed" && <Button size="sm" variant="ghost" label="Retry" onClick={() => void save(r)} />}
                          <Button size="sm" variant="ghost" label="Delete" onClick={() => void remove(r)} />
                        </HStack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <VStack gap={2}>
            <Heading level={2}>Keys</Heading>
            <Grid columns={2} gap={1}>
              {[["0-9", "Shirt number"], ["Q", "Switch team"], ["Space", "Play or pause"], ["←  →", "Back or on 2 s (Shift: 10 s)"],
                ["Shift+1-5", "Outcome"], ["Enter", "Save an edit"], ["Esc", "Clear the event"]].map(([k, what]) => (
                <HStack key={k} gap={2} vAlign="center"><Kbd keys={k} /><Text type="supporting">{what}</Text></HStack>
              ))}
              {EVENT_SPEC.map((s) => (
                <HStack key={s.type} gap={2} vAlign="center"><Kbd keys={s.key.toUpperCase()} /><Text type="supporting">{s.label}</Text></HStack>
              ))}
            </Grid>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
