import Form from "next/form";
import { notFound } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Q } from "@/lib/auth";
import { clock } from "@/lib/engine";
import { UUID } from "@/lib/input";
import { actionLabel } from "@/lib/playlist";
import { matchMinute, type Period } from "@/lib/qc";
import { ActionForm, Choice, Field, Submit } from "../../forms";
import { PageHead, when } from "../../page-kit";
import { PlayerFinder } from "../../player-finder";
import { Demo } from "../../ui";
import { addToPlaylist, createPlaylist } from "../actions";

export const dynamic = "force-dynamic";

const SHOW = 60;
// Shots first: they are what a scout most often wants to watch, and every player type has few enough to list.
const PREFERRED = ["shot", "dribble", "interception", "tackle", "ball_recovery", "pass"];

type Params = { player?: string; list?: string; type?: string; match?: string; find?: string };
type Playlist = { id: string; name: string };
type TypeCount = { type: string; n: number };
type MatchOption = { id: string; kickoff_at: Date | null; home: string; away: string };
type Ev = {
  id: string; type: string; outcome: string | null; period: number; video_seconds: number; periods: Period[];
  match_id: string; kickoff_at: Date | null; home: string; away: string; is_demo: boolean; has_video: boolean; in_list: boolean;
};

export default async function AddActions({ searchParams }: { searchParams: Promise<Params> }) {
  await requireMe(["scout"]);
  const q = await searchParams;
  return db((tx) => AddPage(tx, q));
}

async function AddPage(tx: Q, q: Params) {
  const lists = await tx<Playlist[]>`select id, name from playlists order by created_at`;
  const list = lists.find((l) => l.id === q.list) ?? lists[0];
  const back = <HStack><Button variant="ghost" size="sm" label="Back to playlists" href={list ? `/playlists?list=${list.id}` : "/playlists"} icon={<Icon icon="chevronLeft" />} /></HStack>;

  if (!q.player || !UUID.test(q.player)) {
    return (
      <VStack gap={6}>
        {back}
        <PageHead title="Add actions to a playlist" intro="Find the player whose actions you want to collect. You can also start from his profile." />
        <Card>
          <PlayerFinder label="Player" path="/playlists/add" params={list ? { list: list.id } : {}} q={q.find}
            action={(id) => <Button size="sm" label="Choose" href={`/playlists/add?player=${id}${list ? `&list=${list.id}` : ""}`} />} />
        </Card>
      </VStack>
    );
  }

  const player = q.player;
  const [who] = await tx<{ display_name: string }[]>`select display_name from players where id = ${player}`;
  if (!who) notFound();
  const types = await tx<TypeCount[]>`select type, count(*)::int as n from events where player_id = ${player} group by type order by n desc`;
  const matches = await tx<MatchOption[]>`
    select m.id, m.kickoff_at, h.name as home, a.name as away from matches m
    join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
    where m.id in (select match_id from events where player_id = ${player}) order by m.kickoff_at`;
  const type = types.find((t) => t.type === q.type)?.type ?? PREFERRED.find((p) => types.some((t) => t.type === p)) ?? types[0]?.type;
  const match = matches.find((m) => m.id === q.match)?.id ?? null;
  const events = type ? await tx<Ev[]>`
    select e.id, e.type, e.outcome, e.period, e.video_seconds::float8 as video_seconds, m.periods, m.id as match_id, m.kickoff_at,
           h.name as home, a.name as away, m.is_demo, m.video_status = 'ready' as has_video,
           exists (select 1 from playlist_items i where i.playlist_id = ${list?.id ?? null} and i.event_id = e.id) as in_list
    from events e join matches m on m.id = e.match_id join teams h on h.id = m.home_team_id join teams a on a.id = m.away_team_id
    where e.player_id = ${player} and e.type = ${type} and (${match}::uuid is null or e.match_id = ${match})
    order by m.kickoff_at, e.video_seconds limit ${SHOW}` : [];
  const total = (match ? null : types.find((t) => t.type === type)?.n) ?? events.length;
  const matchName = (m: Pick<MatchOption, "home" | "away" | "kickoff_at">) => `${m.home} v ${m.away}${m.kickoff_at ? `, ${when(m.kickoff_at)}` : ""}`;

  return (
    <VStack gap={6}>
      {back}
      <PageHead title={`Add ${who.display_name}'s actions`} intro="Pick the actions to watch again. Each becomes a clip in the playlist: the match video from 5 seconds before to 8 after." />

      {list ? (
        <Card>
          <Form action="/playlists/add">
            <input type="hidden" name="player" value={player} />
            <HStack gap={2} vAlign="end" wrap="wrap">
              <Choice label="Playlist" name="list" value={list.id} options={lists.map((l) => ({ value: l.id, label: l.name }))} width={220} />
              <Choice label="Action" name="type" value={type} width={220}
                options={types.map((t) => ({ value: t.type, label: `${actionLabel(t.type, null)} (${t.n})` }))} />
              <Choice label="Match" name="match" value={match ?? ""} width={260}
                options={[{ value: "", label: "Every match" }, ...matches.map((m) => ({ value: m.id, label: matchName(m) }))]} />
              <Button type="submit" label="Show" variant="secondary" />
            </HStack>
          </Form>
        </Card>
      ) : (
        <Card>
          <ActionForm action={createPlaylist}>
            <input type="hidden" name="player" value={player} />
            <Text>You have no playlist yet. Name one, then add his actions to it.</Text>
            <HStack gap={2} vAlign="end" wrap="wrap">
              <Field label="New playlist" name="name" placeholder="e.g. Ball-winning midfielders" width={260} />
              <Submit label="Create" />
            </HStack>
          </ActionForm>
        </Card>
      )}

      <Card>
        <VStack gap={3}>
          <VStack gap={1}>
            <Heading level={3}>{type ? actionLabel(type, null) : "Actions"}</Heading>
            {events.length > 0 && (
              <Text type="supporting" hasTabularNumbers>
                {total > events.length ? `The first ${events.length} of ${total}, in match order. Choose a match to see the rest.` : `${events.length} in match order.`}
                {events.some((e) => !e.has_video) && " Matches without uploaded video still show the action and its minute; the clip plays once video is uploaded."}
              </Text>
            )}
          </VStack>
          {events.length === 0 ? (
            <EmptyState isCompact title="No actions recorded for him"
              description="Actions appear here once a match he plays in is logged. Open match data covers AFCON 2023." />
          ) : (
            <List hasDividers density="compact" edge="flush">
              {events.map((e) => (
                <ListItem key={e.id}
                  label={<HStack gap={2} vAlign="center" wrap="wrap"><Text weight="semibold">{actionLabel(e.type, e.outcome)}</Text>{e.is_demo && <Demo />}</HStack>}
                  description={<Text type="supporting" hasTabularNumbers>{clock(matchMinute(e, e.periods) * 60)} · {matchName(e)}{e.has_video ? " · video" : ""}</Text>}
                  endContent={list && (e.in_list
                    ? <Text type="supporting">In {list.name}</Text>
                    : <ActionForm action={addToPlaylist}>
                        <input type="hidden" name="list" value={list.id} />
                        <input type="hidden" name="event" value={e.id} />
                        <Submit label="Add" variant="secondary" size="sm" />
                      </ActionForm>)} />
              ))}
            </List>
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
