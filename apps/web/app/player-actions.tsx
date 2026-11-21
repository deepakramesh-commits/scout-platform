import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, me } from "@/lib/auth";
import { ActionForm, Area, Choice, Submit } from "./forms";
import { when } from "./page-kit";
import { addToShortlist, requestIntro } from "./workflow-actions";

export const INTRO_STATUS = { new: "Requested", in_progress: "Agency is on it", closed: "Closed" } as const;

export async function PlayerActions({ playerId }: { playerId: string }) {
  const user = await me();
  if (!user?.active) return null;
  return (
    <VStack gap={4}>
      {["scout", "agent", "admin"].includes(user.role) && <AddToShortlist playerId={playerId} />}
      {user.role === "scout" && <RequestIntro playerId={playerId} />}
    </VStack>
  );
}

type List = { id: string; name: string; has: boolean };

export async function AddToShortlist({ playerId }: { playerId: string }) {
  const lists = await db((tx) => tx<List[]>`
    select s.id, s.name, exists (select 1 from shortlist_players sp where sp.shortlist_id = s.id and sp.player_id = ${playerId}) as has
    from shortlists s order by s.created_at`);
  const on = lists.filter((l) => l.has);
  const open = lists.filter((l) => !l.has);
  return (
    <VStack gap={2}>
      {on.length > 0 && <Text type="supporting">On {on.map((l) => l.name).join(", ")}</Text>}
      {lists.length === 0 ? (
        <HStack><Button size="sm" label="Create a shortlist" href="/shortlists" /></HStack>
      ) : open.length > 0 && (
        <ActionForm action={addToShortlist} done="Added.">
          <input type="hidden" name="player" value={playerId} />
          <HStack gap={2} vAlign="end" wrap="wrap">
            <Choice label="Shortlist" name="list" options={open.map((l) => ({ value: l.id, label: l.name }))} value={open[0].id} width={220} />
            <Submit label="Add to shortlist" variant="secondary" />
          </HStack>
        </ActionForm>
      )}
    </VStack>
  );
}

type Intro = { status: keyof typeof INTRO_STATUS; created_at: Date };

export async function RequestIntro({ playerId, compact = false }: { playerId: string; compact?: boolean }) {
  const [last] = await db((tx) => tx<Intro[]>`
    select status, created_at from intro_requests where player_id = ${playerId} and from_org = (select app.org())
    order by created_at desc limit 1`);
  if (last && last.status !== "closed") {
    return (
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Token size="sm" color={last.status === "new" ? "blue" : "teal"} label={`Introduction: ${INTRO_STATUS[last.status]}`} />
        <Text type="supporting">asked {when(last.created_at)}</Text>
      </HStack>
    );
  }
  if (compact) {
    return (
      <ActionForm action={requestIntro}>
        <input type="hidden" name="player" value={playerId} />
        <HStack><Submit label="Request introduction" variant="secondary" size="sm" /></HStack>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={requestIntro} done="Requested. The partner agency will contact your club.">
      <input type="hidden" name="player" value={playerId} />
      <Area label="Request an introduction" name="message" rows={2} maxLength={500}
        placeholder="What your club would like to discuss (optional)" />
      <HStack><Submit label="Request introduction" variant="secondary" /></HStack>
      <Text type="supporting">The licensed partner agency receives the request and contacts your club. Representation never changes a ranking or a score.</Text>
    </ActionForm>
  );
}
