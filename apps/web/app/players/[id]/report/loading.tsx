import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

export default function Loading() {
  return (
    <VStack gap={6} aria-busy aria-label="Loading form">
      <Skeleton width={320} height={36} />
      <Card><VStack gap={3}><Skeleton height={56} /><Skeleton height={56} index={1} /></VStack></Card>
      <Card>
        <Grid columns={{ minWidth: 220, repeat: "fill" }} gap={4}>
          {[...Array(6)].map((_, i) => <Skeleton key={i} height={64} index={i} />)}
        </Grid>
      </Card>
    </VStack>
  );
}
