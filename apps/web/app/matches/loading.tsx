import { Card } from "@astryxdesign/core/Card";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

export default function Loading() {
  return (
    <VStack gap={6} aria-busy aria-label="Loading">
      <VStack gap={2}><Skeleton width={240} height={36} /><Skeleton width="60%" height={18} /></VStack>
      <Card><VStack gap={3}>{[...Array(6)].map((_, i) => <Skeleton key={i} height={44} index={i} />)}</VStack></Card>
    </VStack>
  );
}
