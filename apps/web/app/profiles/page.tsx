import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { ROLE_NAMES } from "@/lib/metrics";
import { ageRange, draftLabel, getAttributes, getProfiles, SOURCE_LABEL } from "@/lib/scouting";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function Profiles() {
  const [profiles, attributes] = await Promise.all([getProfiles(), getAttributes()]);
  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Requirement profiles</Heading>
        <Text color="secondary">Describe the player your club needs: positions, age and the attributes that matter. Scout then ranks every player against it.</Text>
      </VStack>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={2}>Write a profile</Heading>
              <Text type="supporting">Very high counts three times as much as medium, high twice as much.</Text>
            </VStack>
            <ProfileForm
              positions={Object.entries(ROLE_NAMES).map(([value, label]) => ({ value, label }))}
              attributes={attributes.map((a) => ({ value: a.key, label: a.label, source: SOURCE_LABEL[a.source], group: a.grp }))}
            />
          </VStack>
        </Card>

        <Card>
          <VStack gap={3}>
            <Heading level={2}>Saved profiles</Heading>
            {profiles.length === 0 && <EmptyState isCompact title="No profiles yet" description="Write the first one; it appears here and in Find by role." />}
            {profiles.map((p) => {
              const draft = draftLabel(p);
              return (
                <VStack key={p.id} gap={1}>
                  <HStack gap={2} wrap="wrap" vAlign="center">
                    <Link href={`/roles?profile=${p.id}`}>{p.name}</Link>
                    {draft && <Token size="sm" label={draft} color="yellow" />}
                  </HStack>
                  <Text type="supporting">
                    {[p.club, p.positions.map((r) => ROLE_NAMES[r] ?? r).join(", "), ageRange(p), `${p.items.length} attributes`].filter(Boolean).join(" · ")}
                  </Text>
                </VStack>
              );
            })}
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
