"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

export type RadarPoint = { metric: string; a: number; b: number };

// Recharts' own tween is off: the CSS draw-in in motion.css runs off the main thread and honours reduced motion.
export function PercentileRadar({ data, colors }: { data: RadarPoint[]; colors: Record<"a" | "b", string> }) {
  return (
    <ResponsiveContainer width="100%" aspect={1} maxHeight={440}>
      <RadarChart data={data} outerRadius="66%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="var(--color-border-emphasized)" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--color-text-secondary)", fontSize: 11, width: 72 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        {(["a", "b"] as const).map((k) => (
          <Radar key={k} className={`radar-${k}`} dataKey={k} stroke={colors[k]} strokeWidth={2} fill={colors[k]} fillOpacity={0.15} isAnimationActive={false} />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}
