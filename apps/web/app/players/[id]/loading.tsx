import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

export default function Loading() {
  return (
    <VStack gap={6} aria-busy aria-label="Loading player">
      <Card>
        <HStack gap={4} vAlign="center" wrap="wrap">
          <Skeleton width={96} height={96} />
          <VStack gap={2}><Skeleton width={280} height={36} /><Skeleton width={220} height={18} /></VStack>
        </HStack>
      </Card>
      <Skeleton height={40} />
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={3}>
        {[0, 1].map((i) => <Card key={i}><Skeleton height={70} index={i} /></Card>)}
      </Grid>
      <Card><VStack gap={3}>{[...Array(6)].map((_, i) => <Skeleton key={i} height={32} index={i} />)}</VStack></Card>
    </VStack>
  );
}
