import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { fitScore, PRIORITY_LABEL } from "@/lib/fit";
import { smallGroupNote } from "@/lib/metrics";
import { draftLabel, SOURCE_LABEL, type Attribute, type PlayerEvidence, type Profile } from "@/lib/scouting";
import { ProfilePicker } from "../../profile-picker";
import { Count, Demo, PctBar } from "../../ui";

const PRIORITY_COLOR = { very_high: "green", high: "teal", medium: "default" } as const;

/** How well this player fits one requirement profile: the score, its coverage, then one bar per attribute. */
export function FitCard({ playerId, profiles, profile, attributes, evidence, peers, role }: {
  playerId: string; profiles: Profile[]; profile: Profile; attributes: Map<string, Attribute>;
  evidence: PlayerEvidence; peers: number; role: string;
}) {
  const fit = fitScore(profile.items, evidence.evidence);
  const draft = draftLabel(profile);
  const small = smallGroupNote(peers, role);
  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={2}>Fit</Heading>
          <Text type="supporting">How well his evidence matches what a club needs. Pick the requirement profile to judge him against.</Text>
        </VStack>
        <ProfilePicker key={profile.id} action={`/players/${playerId}`} name="fit" value={profile.id} label="Against profile"
          options={profiles.map((p) => ({ value: p.id, label: p.name, description: p.club ?? undefined }))} />
        <HStack gap={4} wrap="wrap" vAlign="center">
          {fit.score != null
            ? <Heading level={1}><Count value={fit.score} /></Heading>
            : <Heading level={3}>Not enough evidence</Heading>}
          <VStack gap={0}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Text weight="semibold">{profile.name}</Text>
              {draft && <Token size="sm" label={draft} color="yellow" />}
            </HStack>
            <Text type="supporting">
              {fit.measured} of {fit.total} measured · {Math.round(fit.coverage * 100)}% of the weighted profile
              {fit.score == null && "; a score needs at least half"}
            </Text>
          </VStack>
        </HStack>
        <Divider />
        <VStack gap={3}>
          {fit.items.map((it, i) => {
            const a = attributes.get(it.attribute);
            const parts = [
              it.evidence.match != null && `match ${it.evidence.match}`,
              it.evidence.test != null && `test ${it.evidence.test}`,
              it.evidence.scout != null && `scout ${it.evidence.scout}`,
            ].filter(Boolean);
            return (
              <VStack key={it.attribute} gap={1}>
                <HStack gap={2} wrap="wrap" vAlign="center">
                  <Text weight="semibold">{a?.label ?? it.attribute}</Text>
                  <Token size="sm" label={PRIORITY_LABEL[it.priority]} color={PRIORITY_COLOR[it.priority]} description="Priority in this profile" />
                  <Text type="supporting">{a ? SOURCE_LABEL[a.source] : ""}{parts.length ? ` · ${parts.join(", ")}` : " · no evidence yet"}</Text>
                  {evidence.demo.has(it.attribute) && <Demo />}
                </HStack>
                <Grid className="frow" gap={2}>
                  <PctBar pct={it.value} i={i} />
                  <Text weight="bold" display="block" justify="end" hasTabularNumbers>{it.value == null ? "–" : Math.round(it.value)}</Text>
                </Grid>
              </VStack>
            );
          })}
        </VStack>
        <Text type="supporting">
          Each bar is 0 to 100: the match percentile within the position and the physical test percentile among tested players, averaged where both exist.
          Scout ratings join in phase 2.{small && ` Match percentiles here are ${small}.`}
        </Text>
      </VStack>
    </Card>
  );
}
