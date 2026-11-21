"use client";

import { CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export type AgePoint = { age: number; value: number; name: string };

const axis = { fill: "var(--color-text-secondary)", fontSize: 12 };

export function AgeCurve({ others, me }: { others: AgePoint[]; me: AgePoint | null }) {
  return (
    <ResponsiveContainer width="100%" aspect={1.6} maxHeight={360}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
        <CartesianGrid stroke="var(--color-border-emphasized)" strokeOpacity={0.5} vertical={false} />
        <XAxis type="number" dataKey="age" domain={["dataMin - 1", "dataMax + 1"]} allowDecimals={false} tick={axis}
          stroke="var(--color-border-emphasized)" label={{ value: "Age (demo birth years)", position: "insideBottom", offset: -16, ...axis }} />
        <YAxis type="number" dataKey="value" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axis} stroke="var(--color-border-emphasized)" width={36} />
        <Tooltip cursor={{ stroke: "var(--color-border-emphasized)" }} content={({ payload }) => {
          const p = payload?.[0]?.payload as AgePoint | undefined;
          return p ? (
            <Card padding={2}>
              <VStack gap={0}>
                <Text weight="semibold">{p.name}</Text>
                <Text type="supporting">Age {p.age} · mean attribute percentile {p.value}</Text>
              </VStack>
            </Card>
          ) : null;
        }} />
        <ZAxis zAxisId="other" dataKey="value" range={[50, 50]} />
        <ZAxis zAxisId="me" dataKey="value" range={[220, 220]} />
        <Scatter zAxisId="other" data={others} fill="var(--color-data-gray-3)" fillOpacity={0.7} isAnimationActive={false} />
        {me && <Scatter zAxisId="me" data={[me]} fill="var(--color-data-orange-4)" stroke="var(--color-background-surface)" strokeWidth={2} shape="diamond"
          isAnimationActive={false}>
          <LabelList dataKey="name" position="right" fill="var(--color-text-primary)" fontSize={12} />
        </Scatter>}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
