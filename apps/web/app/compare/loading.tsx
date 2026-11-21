import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

export default function Loading() {
  return (
    <VStack gap={6} aria-busy aria-label="Loading comparison">
      <VStack gap={2}><Skeleton width={300} height={36} /><Skeleton width="60%" height={18} /></VStack>
      <Card><Skeleton height={64} /></Card>
      <Card><Skeleton height={96} /></Card>
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4}>
        <Card><Skeleton height={400} /></Card>
        <Card><VStack gap={2}>{[...Array(14)].map((_, i) => <Skeleton key={i} height={20} index={i} />)}</VStack></Card>
      </Grid>
    </VStack>
  );
}
