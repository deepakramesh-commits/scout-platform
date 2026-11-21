import { Card } from "@astryxdesign/core/Card";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";

export default function Loading() {
  return (
    <VStack gap={6} aria-busy aria-label="Ranking players">
      <VStack gap={2}><Skeleton width={240} height={36} /><Skeleton width="60%" height={18} /></VStack>
      <Card><VStack gap={3}><Skeleton width={320} height={40} /><Skeleton width="40%" height={28} /><Skeleton height={24} /></VStack></Card>
      <Card><VStack gap={3}>{[...Array(8)].map((_, i) => <Skeleton key={i} height={40} index={i} />)}</VStack></Card>
    </VStack>
  );
}
