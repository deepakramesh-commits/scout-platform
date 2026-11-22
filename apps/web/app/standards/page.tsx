import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { requireMe } from "@/lib/auth";
import { REFERENCE, STANDARDS } from "@/lib/standards";

export default async function Standards() {
  await requireMe();
  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Standards</Heading>
        <Text color="secondary">The five written standards every match follows, from filming to publishing. Clubs, analysts and reviewers work to these; scouts can read exactly how each number was made.</Text>
      </VStack>
      <Grid columns={{ minWidth: 260, repeat: "fill" }} gap={4}>
        {[...STANDARDS, ...REFERENCE].map((s) => (
          <Card key={s.slug}>
            <VStack gap={1}>
              <Link href={`/standards/${s.slug}`}>{s.title}</Link>
              <Text type="supporting">{s.summary}</Text>
            </VStack>
          </Card>
        ))}
      </Grid>
    </VStack>
  );
}
