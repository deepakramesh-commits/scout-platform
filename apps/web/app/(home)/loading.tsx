import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

export default function Loading() {
  return (
    <VStack gap={6} aria-busy aria-label="Loading players">
      <VStack gap={2}><Skeleton width={340} height={36} /><Skeleton width="60%" height={18} /></VStack>
      <Grid columns={{ minWidth: 150, repeat: "fit" }} gap={3}>
        {[0, 1, 2, 3, 4].map((i) => <Card key={i}><Skeleton height={86} index={i} /></Card>)}
      </Grid>
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4}>
        <Card><Skeleton height={220} /></Card>
        <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={3}>
          {[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton height={70} index={i} /></Card>)}
        </Grid>
      </Grid>
      <Card>
        <VStack gap={3}>{[...Array(8)].map((_, i) => <Skeleton key={i} height={40} index={i} />)}</VStack>
      </Card>
    </VStack>
  );
}
