import { ViewTransition } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { StackItem } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { ROLE_NAMES } from "@/lib/metrics";
import { SEASON_YEAR } from "@/lib/scouting";
import { Demo, flag, PlayerAvatar } from "../../ui";
import { VerifiedMark } from "../../verified";
import type { Player, PlayerWithoutData } from "./player";

/** Photo, name, verified mark and the facts a scout reads first; `children` holds the page's actions. */
export function PlayerHeader({ id, p, size = 144, children }: {
  id: string; p: Player | PlayerWithoutData; size?: 96 | 144; children?: React.ReactNode;
}) {
  const position = p.role ?? p.primary_position;
  return (
    <HStack gap={6} wrap="wrap" vAlign="center">
      <VStack gap={1} hAlign="start" maxWidth={size}>
        <ViewTransition name={`avatar-${id}`}>
          <PlayerAvatar name={p.display_name} photo={p.photo_url} size={size} />
        </ViewTransition>
        {p.photo_credit && (
          <Text type="supporting" size="xsm">
            Photo: {p.photo_source_url ? <Link href={p.photo_source_url} isExternalLink size="xsm">{p.photo_credit}</Link> : p.photo_credit}
          </Text>
        )}
      </VStack>
      <StackItem size="fill">
        <VStack gap={4}>
          <VStack gap={2}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Heading level={1}>{p.display_name}</Heading>
              <VerifiedMark verified={p.id_verified} />
            </HStack>
            <HStack gap={3} wrap="wrap" vAlign="center">
              {p.team && <Text color="secondary">{flag(p.team)} {p.team}</Text>}
              {position && <Token label={ROLE_NAMES[position] ?? position} color="green" />}
              {p.role != null && <Text color="secondary">{p.matches} {p.matches === 1 ? "match" : "matches"} · {p.minutes} minutes</Text>}
              <HStack gap={1} vAlign="center">
                <Text color="secondary">{p.birth_year == null ? "Age not recorded" : `Age ${SEASON_YEAR - p.birth_year}`}</Text>
                {p.birth_year != null && p.demo_fields.includes("birth_year") && <Demo />}
              </HStack>
              {!p.team && p.nationality && <Text color="secondary">{p.nationality}</Text>}
            </HStack>
          </VStack>
          {children}
        </VStack>
      </StackItem>
    </HStack>
  );
}
