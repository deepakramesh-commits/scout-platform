import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting } from "@/lib/auth";
import { str, UUID } from "@/lib/input";
import { ActionForm, Submit } from "../../forms";
import { when } from "../../page-kit";

type Summary = { text: string; source: "template" | "claude"; model: string | null; created_at: Date };

const SOURCE = {
  template: { token: "Template", says: "Written from a plain template that restates his match numbers" },
  claude: { token: "Claude", says: "Written by Claude from his match numbers only; check it against them before you share it" },
} as const;

async function requestSummary(form: FormData): Promise<string | void> {
  "use server";
  await requireScouting();
  const [player, competition] = [str(form, "player"), str(form, "competition")];
  if (!UUID.test(player) || !UUID.test(competition)) return "This player has no competition numbers to summarise.";
  // The function queues a write_report job only for a player and competition this user may see.
  await db((tx) => tx`select app.request_summary(${player}, ${competition})`);
}

/** The worker's short summary of a player's numbers in one competition, and the button that asks for a new one. */
export async function ReportSummary({ playerId, competitionId }: { playerId: string; competitionId: string }) {
  const [s] = await db((tx) => tx<Summary[]>`
    select text, source, model, created_at from player_summaries where player_id = ${playerId} and competition_id = ${competitionId}`);
  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Heading level={3}>Written summary</Heading>
          {s && <Token size="sm" color={s.source === "claude" ? "purple" : "gray"} label={SOURCE[s.source].token} description="Who wrote this summary" />}
        </HStack>
        {s ? (
          <VStack gap={1}>
            <Text>{s.text}</Text>
            <Text type="supporting">{SOURCE[s.source].says}{s.model ? ` (${s.model})` : ""}, {when(s.created_at)}.</Text>
          </VStack>
        ) : (
          <Text color="secondary">No summary yet. Ask for one and a background job writes a few sentences from his match numbers.</Text>
        )}
        <ActionForm action={requestSummary} done="Asked. The summary appears here once the worker has run; reload the page in a minute.">
          <input type="hidden" name="player" value={playerId} />
          <input type="hidden" name="competition" value={competitionId} />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Submit label={s ? "Write it again" : "Write summary"} variant="secondary" size="sm" />
            <Text type="supporting">The summary appears here once the worker has run.</Text>
          </HStack>
        </ActionForm>
      </VStack>
    </Card>
  );
}
