"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { POSITIONS, validateSheet, type Kind, type Position, type Sheet, type SheetEntry, type SheetError } from "@/lib/match-sheet";
import { uuid } from "@/lib/sheet-sync";

type SquadRow = { player_id: string; name: string; shirt_number: number | null; position: string | null };
export type SheetTeam = { id: string; name: string; squad: SquadRow[]; stored: Sheet | null };

/** One team on this phone: the sheet, how many edits it has had, and which edit was last sent and is queued to send. */
type Local = { sheet: Sheet; version: number; sent: number; queued: number; sentAt: string | null; rejected: string | null };
type Store = Record<string, Local>;

const KIND_LABEL: Record<Kind, string> = { substitution: "Substitution", goal: "Goal", own_goal: "Own goal", yellow_card: "Yellow card", red_card: "Red card" };
const storeKey = (matchId: string) => `scout.sheet.${matchId}`;

function readStore(matchId: string): Store {
  try { return JSON.parse(localStorage.getItem(storeKey(matchId)) ?? "{}") as Store; } catch { return {}; }
}

const emptySheet = (): Sheet => ({ lineup: [], entries: [], length: 90 });

export function SheetForm({ matchId, teams, sentAt }: { matchId: string; teams: SheetTeam[]; sentAt: string | null }) {
  const initial = useMemo<Store>(() => Object.fromEntries(teams.map((t) => [t.id, {
    sheet: t.stored ?? emptySheet(), version: 0, sent: 0, queued: 0, sentAt: t.stored ? sentAt : null, rejected: null,
  }])), [teams, sentAt]);
  const [store, setStore] = useState<Store>(initial);
  const storeRef = useRef(store);
  const [teamId, setTeamId] = useState(teams[0].id);
  const [online, setOnline] = useState(true);
  const [sending, setSending] = useState(false);

  // The phone's copy wins over the server's while it holds changes the server has not confirmed.
  useEffect(() => {
    const unsent = Object.entries(readStore(matchId)).filter(([id, l]) => id in storeRef.current && (l.version > l.sent || l.rejected));
    storeRef.current = { ...storeRef.current, ...Object.fromEntries(unsent) };
    setStore(storeRef.current);
    setOnline(navigator.onLine);
  }, [matchId]);

  // Written to the phone before React renders, so a send that follows reads what was just entered.
  const update = useCallback((id: string, f: (l: Local) => Local) => {
    const next = { ...storeRef.current, [id]: f(storeRef.current[id]) };
    storeRef.current = next;
    try { localStorage.setItem(storeKey(matchId), JSON.stringify(next)); } catch { /* storage full or blocked: the form still works this session */ }
    setStore(next);
  }, [matchId]);
  const edit = (f: (s: Sheet) => Sheet) => update(teamId, (l) => ({ ...l, sheet: f(l.sheet), version: l.version + 1, rejected: null }));

  const flushing = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(async () => {
    if (!navigator.onLine || flushing.current) return;
    const due = Object.entries(storeRef.current).filter(([, l]) => l.queued > l.sent);
    if (!due.length) return;
    flushing.current = true;
    setSending(true);
    let unsent = false;
    for (const [id, l] of due) {
      try {
        // A phone on a weak signal can hang a request for minutes; give up on it and try again.
        const res = await fetch(`/api/matches/${matchId}/sheet`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ team_id: id, sheet: l.sheet }),
          signal: AbortSignal.timeout(15000),
        });
        const body = (await res.json().catch(() => ({}))) as { errors?: SheetError[]; error?: string; sent_at?: string };
        if (res.ok) update(id, (cur) => ({ ...cur, sent: l.queued, sentAt: body.sent_at ?? new Date().toISOString() }));
        else if (res.status === 422 || res.status === 403) {
          update(id, (cur) => ({ ...cur, queued: cur.sent, rejected: body.errors?.map((e) => e.message).join("; ") ?? body.error ?? "refused" }));
        } else if (res.status === 401) {
          update(id, (cur) => ({ ...cur, rejected: "Sign in again to send; the sheet stays on this phone." }));
        } else unsent = true;
      } catch {
        unsent = true;
      }
    }
    flushing.current = false;
    setSending(false);
    clearTimeout(retry.current);
    if (unsent) retry.current = setTimeout(() => void flush(), 5000);
  }, [matchId, update]);

  useEffect(() => {
    const on = () => { setOnline(true); void flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    void flush();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [flush]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/matches/" }).then(() => navigator.serviceWorker.ready).then((reg) => {
      const urls = [location.pathname, ...performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin))];
      reg.active?.postMessage({ cache: urls });
    }).catch(() => { /* no service worker (private mode, plain http): the form still works online */ });
  }, []);

  const team = teams.find((t) => t.id === teamId)!;
  const local = store[teamId];
  const { sheet } = local;
  const squad = team.squad.map((s) => ({ player_id: s.player_id, shirt_number: s.shirt_number }));
  const errors = validateSheet(sheet, squad);
  const fieldError = (f: string) => errors.find((e) => e.field === f)?.message;
  const name = (pid: string) => team.squad.find((s) => s.player_id === pid)?.name ?? "Unknown player";
  const lineIndex = (pid: string) => sheet.lineup.findIndex((l) => l.player_id === pid);
  const starters = sheet.lineup.filter((l) => l.started).length;

  const setRole = (row: SquadRow, role: string) => edit((s) => {
    const rest = s.lineup.filter((l) => l.player_id !== row.player_id);
    if (role === "out") return { ...s, lineup: rest, entries: s.entries.filter((e) => e.player_id !== row.player_id && e.player_in_id !== row.player_id) };
    const cur = s.lineup.find((l) => l.player_id === row.player_id);
    const position = cur?.position ?? (POSITIONS.includes(row.position as Position) ? (row.position as Position) : null);
    const line = { player_id: row.player_id, shirt_number: cur?.shirt_number ?? row.shirt_number, position, started: role === "start" };
    const at = s.lineup.findIndex((l) => l.player_id === row.player_id);
    return { ...s, lineup: at < 0 ? [...rest, line] : s.lineup.map((l, i) => (i === at ? line : l)) };
  });
  const setLine = (pid: string, patch: Partial<Sheet["lineup"][number]>) =>
    edit((s) => ({ ...s, lineup: s.lineup.map((l) => (l.player_id === pid ? { ...l, ...patch } : l)) }));
  const setEntry = (id: string, patch: Partial<SheetEntry>) =>
    edit((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const addEntry = (kind: Kind) => edit((s) => ({ ...s, entries: [...s.entries, { id: uuid(), kind, minute: null, player_id: "", player_in_id: null }] }));

  const named = sheet.lineup.map((l) => ({ value: l.player_id, label: `${l.shirt_number ?? "?"} · ${name(l.player_id)}` }));
  const bench = sheet.lineup.filter((l) => !l.started).map((l) => ({ value: l.player_id, label: `${l.shirt_number ?? "?"} · ${name(l.player_id)}` }));

  const send = () => { update(teamId, (l) => ({ ...l, queued: l.version || 1 })); void flush(); };
  const pending = local.queued > local.sent;
  const changed = local.version > local.sent;
  const state = local.rejected
    ? { status: "error" as const, title: "Not accepted", description: local.rejected }
    : pending
      ? online
        ? { status: "info" as const, title: sending ? "Sending…" : "Waiting to send", description: "Kept on this phone until the server confirms." }
        : { status: "warning" as const, title: "Saved on this phone, will send", description: "You are offline. The sheet goes as soon as the connection returns; you can close this page." }
      : changed
        ? { status: "info" as const, title: "Saved on this phone", description: "Not sent yet. Press Send when the sheet is complete." }
        : local.sentAt
          ? { status: "success" as const, title: "Sent", description: `Received by Scout at ${new Date(local.sentAt).toLocaleTimeString()}.` }
          : { status: "info" as const, title: "Not started", description: "Pick the starters and substitutes below." };

  return (
    <VStack gap={4}>
      <SegmentedControl label="Team" size="lg" layout="fill" value={teamId} onChange={setTeamId}>
        {teams.map((t) => <SegmentedControlItem key={t.id} value={t.id} label={t.name} />)}
      </SegmentedControl>

      <Banner status={state.status} title={state.title} description={state.description} />

      <Card>
        <VStack gap={3}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
            <Heading level={2}>Line-up</Heading>
            <Text type="supporting">{starters} of 11 starters · {sheet.lineup.length - starters} on the bench</Text>
          </HStack>
          {fieldError("lineup") && <FieldStatus type="error" variant="detached" message={errors.filter((e) => e.field === "lineup").map((e) => e.message).join(". ")} />}
          {team.squad.length === 0 && <Text color="secondary">This club has no squad list yet. The club adds its players before the match; they are never typed in here.</Text>}
          {team.squad.map((row, n) => {
            const i = lineIndex(row.player_id);
            const line = i >= 0 ? sheet.lineup[i] : null;
            const role = line ? (line.started ? "start" : "bench") : "out";
            return (
              <VStack key={row.player_id} gap={2}>
                {n > 0 && <Divider />}
                <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                  <Text weight="semibold">{row.name}</Text>
                  <SegmentedControl label={`${row.name}: starts, bench or not named`} size="lg" layout="fill" value={role} onChange={(v) => setRole(row, v)}>
                    <SegmentedControlItem value="start" label="Starts" />
                    <SegmentedControlItem value="bench" label="Bench" />
                    <SegmentedControlItem value="out" label="Out" />
                  </SegmentedControl>
                </HStack>
                {line && (
                  <HStack gap={2} wrap="wrap">
                    <NumberInput label="Shirt" size="sm" min={1} max={99} value={line.shirt_number} width={96}
                      onChange={(v) => setLine(row.player_id, { shirt_number: v })} status={err(fieldError(`lineup.${i}.shirt`))} />
                    <Selector label="Position" size="sm" value={line.position ?? undefined} placeholder="Choose"
                      options={POSITIONS.map((p) => ({ value: p, label: p }))} onChange={(v) => setLine(row.player_id, { position: v as Position })}
                      status={err(fieldError(`lineup.${i}.position`))} />
                  </HStack>
                )}
              </VStack>
            );
          })}
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
            <Heading level={2}>Substitutions, goals and cards</Heading>
            <Switch label="Extra time played" value={sheet.length === 120} onChange={(on) => edit((s) => ({ ...s, length: on ? 120 : 90 }))} />
          </HStack>
          {fieldError("entries") && <FieldStatus type="error" variant="detached" message={fieldError("entries")!} />}
          {sheet.entries.length === 0 && <Text color="secondary">Nothing recorded yet. Add each substitution, goal and card with its minute.</Text>}
          {sheet.entries.map((e, n) => {
            const f = `entries.${n}`;
            const rowError = errors.find((x) => x.field === f)?.message;
            return (
              <VStack key={e.id} gap={2}>
                {n > 0 && <Divider />}
                <HStack hAlign="between" vAlign="center">
                  <Text weight="semibold">{KIND_LABEL[e.kind]}</Text>
                  <Button size="sm" variant="ghost" label="Remove" onClick={() => edit((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== e.id) }))} />
                </HStack>
                <HStack gap={2} wrap="wrap">
                  <NumberInput label="Minute" size="sm" min={1} max={sheet.length + 15} value={e.minute} width={96}
                    onChange={(v) => setEntry(e.id, { minute: v })} status={err(fieldError(`${f}.minute`))} />
                  <Selector label={e.kind === "substitution" ? "Player off" : "Player"} size="sm" value={e.player_id || undefined} placeholder="Choose"
                    options={named} onChange={(v) => setEntry(e.id, { player_id: v })} status={err(fieldError(`${f}.player`))} />
                  {e.kind === "substitution" && (
                    <Selector label="Player on" size="sm" value={e.player_in_id ?? undefined} placeholder="Choose" options={bench}
                      onChange={(v) => setEntry(e.id, { player_in_id: v })} status={err(fieldError(`${f}.player_in`))} />
                  )}
                </HStack>
                {rowError && <FieldStatus type="error" variant="detached" message={rowError} />}
              </VStack>
            );
          })}
          <HStack gap={2} wrap="wrap">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <Button key={k} size="sm" label={`Add ${KIND_LABEL[k].toLowerCase()}`} onClick={() => addEntry(k)} />)}
          </HStack>
        </VStack>
      </Card>

      <VStack gap={2}>
        <Button variant="primary" size="lg" label={`Send ${team.name} sheet`} onClick={send} isDisabled={errors.length > 0 || !changed}
          isLoading={sending && pending} />
        <Text type="supporting" color="secondary">
          {errors.length > 0
            ? `Fix ${errors.length} ${errors.length === 1 ? "problem" : "problems"} above to send.`
            : !changed ? "Nothing new to send." : online ? "Ready to send." : "Offline: pressing Send keeps it on this phone and sends it later."}
        </Text>
      </VStack>
    </VStack>
  );
}

const err = (message: string | undefined) => (message ? { type: "error" as const, message } : undefined);
