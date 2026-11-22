import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { Match } from "@/lib/engine";
import { StatusToken } from "../status-token";

export function MatchHeader({ match, tool, intro }: { match: Match; tool: string; intro: string }) {
  return (
    <VStack gap={1}>
      <Link href="/matches">All matches</Link>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={1}>{tool}</Heading>
        <StatusToken status={match.status} />
        {match.is_demo && <Token size="sm" label="Demo" color="yellow" />}
      </HStack>
      <Text weight="semibold">{match.home} v {match.away}</Text>
      <Text type="supporting">{match.competition} {match.season}{match.kickoff_at ? ` · ${match.kickoff_at.toISOString().slice(0, 10)}` : ""}</Text>
      <Text color="secondary">{intro}</Text>
    </VStack>
  );
}
