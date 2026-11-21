// Shared pieces of the account and workflow screens: the page head, a player cell, and the loading state.
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Demo } from "./ui";
import { VerifiedMark } from "./verified";

export function PageHead({ title, intro, actions }: { title: string; intro: string; actions?: React.ReactNode }) {
  return (
    <HStack hAlign="between" vAlign="end" wrap="wrap" gap={3}>
      <VStack gap={1}>
        <Heading level={1}>{title}</Heading>
        <Text color="secondary">{intro}</Text>
      </VStack>
      {actions}
    </HStack>
  );
}

export type PlayerRef = { id: string; display_name: string; id_verified: boolean; position?: string | null; is_demo?: boolean };

/** A player's name linking to the profile, with the verified mark always beside it. */
export function PlayerCell({ p, link = true }: { p: PlayerRef; link?: boolean }) {
  return (
    <VStack gap={0}>
      <HStack gap={1} vAlign="center" wrap="wrap">
        {link ? <Link href={`/players/${p.id}`}>{p.display_name}</Link> : <Text weight="semibold">{p.display_name}</Text>}
        <VerifiedMark verified={p.id_verified} />
        {p.is_demo && <Demo />}
      </HStack>
      {p.position && <Text type="supporting">{p.position}</Text>}
    </VStack>
  );
}

export const when = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function PageLoading({ label }: { label: string }) {
  return (
    <VStack gap={6} aria-busy aria-label={label}>
      <VStack gap={2}><Skeleton width={320} height={36} /><Skeleton width="55%" height={18} /></VStack>
      <Card><VStack gap={3}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={40} index={i} />)}</VStack></Card>
    </VStack>
  );
}
