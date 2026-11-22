import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Q } from "@/lib/auth";
import { clock } from "@/lib/engine";
import { actionLabel, clipSrc, clipWindow } from "@/lib/playlist";
import { matchMinute, type Period } from "@/lib/qc";
import { playbackUrl } from "@/lib/video";
import { ActionForm, Area, Field, Submit } from "../forms";
import { PageHead, when } from "../page-kit";
import { Demo } from "../ui";
import { createPlaylist, deletePlaylist, movePlaylistItem, notePlaylistItem, removeFromPlaylist, renamePlaylist } from "./actions";

export const dynamic = "force-dynamic";

type List = { id: string; name: string; is_demo: boolean; items: number };
/** An item whose event row-level security now hides (coverage ended, consent withdrawn) keeps only its key. */
type Item = { event_id: string; note: string } & (
  | { available: false }
  | {
      available: true; type: string; outcome: string | null; period: number; video_seconds: number;
      match_id: string; kickoff_at: Date | null; home: string; away: string; match_is_demo: boolean; periods: Period[];
      video_status: string | null; video_provider: string | null; mux_playback_id: string | null; player: string | null;
    });
type Shown = Extract<Item, { available: true }>;

export default async function Playlists({ searchParams }: { searchParams: Promise<{ list?: string; clip?: string }> }) {
  await requireMe(["scout"]);
  const { list, clip } = await searchParams;
  return db((tx) => PlaylistsPage(tx, list, clip));
}

async function PlaylistsPage(tx: Q, wanted: string | undefined, clip: string | undefined) {
  const lists = await tx<List[]>`
    select l.id, l.name, l.is_demo, (select count(*)::int from playlist_items i where i.playlist_id = l.id) as items
    from playlists l order by l.created_at`;
  const current = lists.find((l) => l.id === wanted) ?? lists[0];
  const items: Item[] = current ? await tx<Item[]>`
    select i.event_id, i.note, e.id is not null as available, e.type, e.outcome, e.period, e.video_seconds::float8 as video_seconds,
           m.id as match_id, m.kickoff_at, h.name as home, a.name as away, m.is_demo as match_is_demo, m.periods,
           m.video_status, m.video_provider, m.mux_playback_id, p.display_name as player
    from playlist_items i
    left join events e on e.id = i.event_id
    left join matches m on m.id = e.match_id
    left join teams h on h.id = m.home_team_id
    left join teams a on a.id = m.away_team_id
    left join players p on p.id = e.player_id
    where i.playlist_id = ${current.id}
    order by i.position, i.event_id` : [];
  const shown = items.filter((i): i is Shown => i.available);
  const playing = shown.find((i) => i.event_id === clip) ?? shown[0];
  const at = playing ? shown.indexOf(playing) : -1;

  return (
    <VStack gap={6}>
      <PageHead title="Playlists" intro="Collect actions from matches into a playlist and watch each one as a clip: the match video from 5 seconds before the action to 8 after." />

      <Card>
        <VStack gap={4}>
          <Heading level={3}>Your playlists</Heading>
          {lists.length === 0 && <Text type="supporting">None yet. Name your first one below, then add actions from a player's profile. Only you see your playlists.</Text>}
          <HStack gap={4} wrap="wrap">
            {lists.map((l) => (
              <HStack key={l.id} gap={2} vAlign="center" wrap="wrap">
                {l.id === current?.id ? <Text weight="semibold">{l.name}</Text> : <Link href={`/playlists?list=${l.id}`}>{l.name}</Link>}
                <Text type="supporting" hasTabularNumbers>{l.items} {l.items === 1 ? "clip" : "clips"}</Text>
                {l.is_demo && <Demo />}
              </HStack>
            ))}
          </HStack>
          <ActionForm action={createPlaylist}>
            <HStack gap={2} vAlign="end" wrap="wrap">
              <Field label="New playlist" name="name" placeholder="e.g. Ball-winning midfielders" width={260} />
              <Submit label="Create" variant="secondary" />
            </HStack>
          </ActionForm>
        </VStack>
      </Card>

      {current ? (
        <Card>
          <VStack gap={4}>
            <HStack hAlign="between" vAlign="end" wrap="wrap" gap={2}>
              <ActionForm action={renamePlaylist}>
                <input type="hidden" name="list" value={current.id} />
                <HStack gap={2} vAlign="end" wrap="wrap">
                  <Field label="Playlist name" name="name" value={current.name} width={260} />
                  <Submit label="Rename" variant="ghost" />
                </HStack>
              </ActionForm>
              <HStack gap={2} wrap="wrap">
                <Button size="sm" variant="primary" label="Add actions" href={`/playlists/add?list=${current.id}`} />
                <ActionForm action={deletePlaylist}>
                  <input type="hidden" name="list" value={current.id} />
                  <Submit label="Delete playlist" variant="ghost" size="sm" />
                </ActionForm>
              </HStack>
            </HStack>

            {playing && <ClipPanel item={playing} n={at + 1} of={shown.length} prev={shown[at - 1] && clipHref(current.id, shown[at - 1])} next={shown[at + 1] && clipHref(current.id, shown[at + 1])} />}

            {items.length === 0 ? (
              <EmptyState isCompact title="No clips in this playlist"
                description="Open a player's profile and choose “Add actions to a playlist”, or use Add actions above."
                actions={<Button label="Add actions" href={`/playlists/add?list=${current.id}`} />} />
            ) : (
              <VStack gap={3}>
                <Heading level={3}>In this playlist</Heading>
                {items.map((it, i) => (
                  <VStack key={it.event_id} gap={2}>
                    <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                      {it.available ? (
                        <VStack gap={0}>
                          <HStack gap={2} vAlign="center" wrap="wrap">
                            <Text type="supporting" hasTabularNumbers>{i + 1}</Text>
                            {it === playing
                              ? <Text weight="semibold">{actionLabel(it.type, it.outcome)}</Text>
                              : <Link href={clipHref(current.id, it)}>{actionLabel(it.type, it.outcome)}</Link>}
                            {it === playing && <Token size="sm" color="teal" label="Playing" />}
                            {it.match_is_demo && <Demo />}
                          </HStack>
                          <Text type="supporting">{it.player ?? "No player"} · {it.home} v {it.away} · {clock(minuteOf(it) * 60)}</Text>
                        </VStack>
                      ) : (
                        <Text type="supporting">{i + 1} · This action is no longer available to you (the match left your plan, or the player withdrew consent).</Text>
                      )}
                      <HStack gap={1} wrap="wrap">
                        <ActionForm action={movePlaylistItem}>
                          <input type="hidden" name="list" value={current.id} />
                          <input type="hidden" name="event" value={it.event_id} />
                          <HStack gap={1}>
                            {i > 0 && <Submit label="Move up" variant="ghost" size="sm" name="by" value="up" />}
                            {i < items.length - 1 && <Submit label="Move down" variant="ghost" size="sm" name="by" value="down" />}
                          </HStack>
                        </ActionForm>
                        <ActionForm action={removeFromPlaylist}>
                          <input type="hidden" name="list" value={current.id} />
                          <input type="hidden" name="event" value={it.event_id} />
                          <Submit label="Remove" variant="ghost" size="sm" />
                        </ActionForm>
                      </HStack>
                    </HStack>
                    <ActionForm action={notePlaylistItem} done="Note saved.">
                      <input type="hidden" name="list" value={current.id} />
                      <input type="hidden" name="event" value={it.event_id} />
                      <Area label="Note" name="note" value={it.note} rows={1} maxLength={1000} placeholder="What to look for in this clip" />
                      <HStack><Submit label="Save note" variant="secondary" size="sm" /></HStack>
                    </ActionForm>
                    {i < items.length - 1 && <Divider />}
                  </VStack>
                ))}
              </VStack>
            )}
          </VStack>
        </Card>
      ) : (
        lists.length > 0 && <Card><EmptyState title="Choose a playlist" description="Pick one of your playlists above to watch its clips." /></Card>
      )}
    </VStack>
  );
}

const minuteOf = (it: Shown) => matchMinute(it, it.periods);
const clipHref = (list: string, it: Shown) => `/playlists?list=${list}&clip=${it.event_id}`;
const PERIOD: Record<number, string> = { 1: "first half", 2: "second half", 3: "extra time, first half", 4: "extra time, second half", 5: "penalties" };

function ClipPanel({ item, n, of, prev, next }: { item: Shown; n: number; of: number; prev?: string; next?: string }) {
  const src = item.video_status === "ready" ? playbackUrl({ id: item.match_id, video_provider: item.video_provider, mux_playback_id: item.mux_playback_id }) : null;
  const w = clipWindow(item.video_seconds);
  return (
    <Card variant="muted">
      <Grid columns={{ minWidth: 240, repeat: "fit" }} gap={4} align="start">
        {src
          ? <video key={item.event_id} className="match-video" src={clipSrc(src, w)} controls preload="metadata" aria-label={`Clip: ${actionLabel(item.type, item.outcome)}`} />
          : <EmptyState isCompact title="No video for this match"
              description="There is no video of this match. Its events come from open match data, which records when each action happened but has no footage. The clip plays here once someone uploads the match video." />}
        <VStack gap={3}>
          <VStack gap={1}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={3}>{actionLabel(item.type, item.outcome)}</Heading>
              <Text type="supporting" hasTabularNumbers>Clip {n} of {of}</Text>
            </HStack>
            <Text>{item.player ?? "No player recorded"} · {item.home} v {item.away}{item.kickoff_at ? ` · ${when(item.kickoff_at)}` : ""}</Text>
            <Text type="supporting" hasTabularNumbers>
              Match clock {clock(minuteOf(item) * 60)}, {PERIOD[item.period] ?? `period ${item.period}`}.{" "}
              {src ? `Plays ${clock(w.start)} to ${clock(w.end)} of the match video.` : `With video, the clip would cover ${clock(w.start)} to ${clock(w.end)} of the match clock.`}
            </Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            {prev && <Button size="sm" label="Previous clip" href={prev} />}
            {next && <Button size="sm" label="Next clip" href={next} />}
          </HStack>
        </VStack>
      </Grid>
    </Card>
  );
}
