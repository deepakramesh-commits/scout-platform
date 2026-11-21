// Pure: no imports, so `node --test` runs it without the Next.js toolchain.

export type Priority = "very_high" | "high" | "medium";
export const PRIORITY_WEIGHT: Record<Priority, number> = { very_high: 3, high: 2, medium: 1 };
export const PRIORITY_LABEL: Record<Priority, string> = { very_high: "Very high", high: "High", medium: "Medium" };

/** Each piece of evidence on a 0 to 100 scale. */
export type Evidence = {
  /** Position percentile of the attribute from match data. */
  match?: number;
  /** Mean scout rating (1 to 10) times ten. */
  scout?: number;
  /** Percentile of the player's physical test among tested players. */
  test?: number;
};

export type FitItem = { attribute: string; priority: Priority };
export type AttributeFit = FitItem & { weight: number; value: number | null; evidence: Evidence };
export type Fit = {
  items: AttributeFit[];
  measured: number;
  total: number;
  /** Share of the priority weight that has evidence, 0 to 1. */
  coverage: number;
  /** Weighted mean of measured attributes, or null when under half the weighted profile is measured. */
  score: number | null;
};

export const MIN_COVERAGE = 0.5;

export function fitScore(items: FitItem[], evidence: Record<string, Evidence>): Fit {
  const rows = items.map((it): AttributeFit => {
    const ev = evidence[it.attribute] ?? {};
    const present = [ev.match, ev.scout, ev.test].filter((v): v is number => v != null);
    const value = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
    return { ...it, weight: PRIORITY_WEIGHT[it.priority], value, evidence: ev };
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

/** The one or two attributes where the player is above the 85th percentile in his position, best first. */
export function standouts(attrPercentiles: Record<string, number>, max = 2): string[] {
  return Object.entries(attrPercentiles)
    .filter(([, p]) => p > STANDOUT_PERCENTILE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k);
}
