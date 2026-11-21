// node --test ignores tsconfig paths and needs file extensions: import only relative `.ts` files here.

export type Priority = "very_high" | "high" | "medium";
export const PRIORITY_WEIGHT: Record<Priority, number> = { very_high: 3, high: 2, medium: 1 };
export const PRIORITY_LABEL: Record<Priority, string> = { very_high: "Very high", high: "High", medium: "Medium" };

export type Evidence = {
  match?: number;
  scout?: number;
  test?: number;
};

export type FitItem = { attribute: string; priority: Priority };
export type AttributeFit = FitItem & { weight: number; value: number | null; evidence: Evidence };
export type Fit = {
  items: AttributeFit[];
  measured: number;
  total: number;
  coverage: number;
  score: number | null;
};

export const MIN_COVERAGE = 0.5;

export function attributeValue(ev: Evidence): number | null {
  const present = [ev.match, ev.scout, ev.test].filter((v): v is number => v != null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export function fitScore(items: FitItem[], evidence: Record<string, Evidence>): Fit {
  const rows = items.map((it): AttributeFit => {
    const ev = evidence[it.attribute] ?? {};
    return { ...it, weight: PRIORITY_WEIGHT[it.priority], value: attributeValue(ev), evidence: ev };
  });
  const measured = rows.filter((r) => r.value != null);
  const totalWeight = rows.reduce((n, r) => n + r.weight, 0);
  const measuredWeight = measured.reduce((n, r) => n + r.weight, 0);
  const coverage = totalWeight ? measuredWeight / totalWeight : 0;
  const score =
    totalWeight && coverage >= MIN_COVERAGE
      ? Math.round(measured.reduce((n, r) => n + r.value! * r.weight, 0) / measuredWeight)
      : null;
  return { items: rows, measured: measured.length, total: rows.length, coverage, score };
}

export const STANDOUT_PERCENTILE = 85;

export function standouts(attrPercentiles: Record<string, number>, max = 2): string[] {
  return Object.entries(attrPercentiles)
    .filter(([, p]) => p > STANDOUT_PERCENTILE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k);
}
