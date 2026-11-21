import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

export default function Loading() {
  return (
    <VStack gap={4} aria-busy aria-label="Loading scouting report">
      <Card>
        <HStack gap={4} vAlign="center" wrap="wrap">
          <Skeleton width={96} height={96} />
          <VStack gap={2}><Skeleton width={280} height={36} /><Skeleton width={220} height={18} /></VStack>
        </HStack>
      </Card>
      <Card><VStack gap={3}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={28} index={i} />)}</VStack></Card>
      <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4}>
        {[0, 1].map((i) => <Card key={i}><Skeleton height={160} index={i} /></Card>)}
      </Grid>
    </VStack>
  );
}
