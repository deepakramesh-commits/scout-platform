// The player search: one parse of the URL's filters, used by the search page and by saved-search alerts.
import type { ISODateString } from "@astryxdesign/core/Calendar";

export type SearchParams = Record<string, string | string[] | undefined>;
export type SearchOptions = { keys: string[]; roles: string[]; countries: string[] };
export type SearchFilters = {
  role: string | null; sort: string | null; minPct: number | null; name: string | null; minMinutes: number | null;
  country: string | null; ageMin: number | null; ageMax: number | null; contractBy: ISODateString | null;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const int = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);
const isIsoDate = (v: string | undefined): v is ISODateString => v !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Unknown positions, metrics and countries are dropped, so a stale or hand-edited URL never errors. */
export function parseSearch(q: SearchParams, { keys, roles, countries }: SearchOptions): SearchFilters {
  const requested = first(q.sort);
  const c = first(q.country);
  const by = first(q.contractBy);
  const role = first(q.role);
  return {
    role: role && roles.includes(role) ? role : null,
    sort: requested && keys.includes(requested) ? requested : keys.includes("cut_ins") ? "cut_ins" : keys[0] ?? null,
    minPct: int(first(q.minPct)),
    name: first(q.name) ?? null,
    minMinutes: int(first(q.minMinutes)) || null,
    country: c && countries.includes(c) ? c : null,
    ageMin: int(first(q.ageMin)),
    ageMax: int(first(q.ageMax)),
    contractBy: isIsoDate(by) ? by : null,
  };
}

/** The canonical query string for a set of filters: what a saved search stores and links back to. */
export function searchQuery(f: SearchFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== null && v !== "") params.set(k, String(v));
  return params.toString();
}

const LABELS: Record<keyof SearchFilters, string> = {
  role: "Position", sort: "Ranked by", minPct: "Min percentile", name: "Name", minMinutes: "Min minutes",
  country: "Country", ageMin: "Age from", ageMax: "Age to", contractBy: "Contract ends by",
};

/** "Position LW · Min percentile 80": a saved search described in words. */
export const describeSearch = (f: SearchFilters, metric: (key: string) => string = (k) => k) =>
  (Object.keys(LABELS) as (keyof SearchFilters)[]).filter((k) => f[k] !== null)
    .map((k) => `${LABELS[k]} ${k === "sort" ? metric(String(f[k])) : f[k]}`).join(" · ");

/** Players that match now and were not seen when the search was saved or last marked as seen. */
export const newMatches = (current: string[], seen: string[]) => {
  const old = new Set(seen);
  return [...new Set(current)].filter((id) => !old.has(id));
};
