// node --test ignores tsconfig paths and needs file extensions: import only relative `.ts` files here.
import type { Availability, Foot } from "./market-form.ts";

export type RiskStatus = "good" | "caution" | "unknown";
export type RiskKey = "stronger" | "consistency" | "roles" | "sample" | "age" | "transfer";
export type RiskItem = { key: RiskKey; label: string; status: RiskStatus; reason: string; demo: boolean };

export type RiskInput = {
  matches: { index: number; stronger: boolean }[];
  roles: string[];
  minutes: number; matchesPlayed: number; minMinutes: number;
  birthYear: number | null; birthYearDemo: boolean; idVerified: boolean;
  market: { contractEnd: string | null; availability: Availability | null; transferConditions: string | null; demo: boolean } | null;
  today: Date;
};

// A drop of more than this many index points against stronger sides is a caution.
export const STRONGER_DROP = 10;
// A standard deviation of the 0-100 match index above this is a caution (an even spread would be about 29).
export const SPREAD_MAX = 20;
export const MIN_MATCHES = 3;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function stronger(m: RiskInput["matches"]): Omit<RiskItem, "key" | "label" | "demo"> {
  const s = m.filter((x) => x.stronger).map((x) => x.index);
  const w = m.filter((x) => !x.stronger).map((x) => x.index);
  if (s.length < 2 || w.length < 2) {
    return { status: "unknown", reason: `${plural(s.length, "match", "matches")} against stronger sides and ${w.length} against weaker; too few to compare.` };
  }
  const [ms, mw] = [Math.round(mean(s)), Math.round(mean(w))];
  return ms >= mw - STRONGER_DROP
    ? { status: "good", reason: `Index ${ms} against stronger sides (${plural(s.length, "match", "matches")}) and ${mw} against weaker (${w.length}): he holds his level.` }
    : { status: "caution", reason: `Drops from ${mw} against weaker sides (${plural(w.length, "match", "matches")}) to ${ms} against stronger (${s.length}).` };
}

function consistency(m: RiskInput["matches"]): Omit<RiskItem, "key" | "label" | "demo"> {
  if (m.length < MIN_MATCHES) return { status: "unknown", reason: `Only ${plural(m.length, "rated match", "rated matches")}; at least ${MIN_MATCHES} are needed.` };
  const xs = m.map((x) => x.index);
  const mu = mean(xs);
  const sd = Math.round(Math.sqrt(mean(xs.map((x) => (x - mu) ** 2))));
  return sd <= SPREAD_MAX
    ? { status: "good", reason: `The match index moves about ${sd} points either side of ${Math.round(mu)} over ${m.length} matches: steady.` }
    : { status: "caution", reason: `The match index swings about ${sd} points either side of ${Math.round(mu)} over ${m.length} matches.` };
}

function roles(r: string[]): Omit<RiskItem, "key" | "label" | "demo"> {
  const names = r.map((x) => x.toLowerCase());
  if (!names.length) return { status: "unknown", reason: "No position recorded in any match." };
  if (names.length === 1) return { status: "caution", reason: `Seen only as ${names[0]}; no evidence yet in another role.` };
  return { status: "good", reason: `Played as ${names.slice(0, -1).join(", ")} and ${names.at(-1)}.` };
}

function sample(i: RiskInput): Omit<RiskItem, "key" | "label" | "demo"> {
  if (!i.matchesPlayed) return { status: "unknown", reason: "No minutes recorded." };
  const what = `${i.minutes} minutes over ${plural(i.matchesPlayed, "match", "matches")}`;
  if (i.minutes < i.minMinutes) return { status: "caution", reason: `${what}, under the ${i.minMinutes} needed for percentiles in this competition.` };
  if (i.matchesPlayed < MIN_MATCHES) return { status: "caution", reason: `${what}; fewer than ${MIN_MATCHES} matches is a thin sample.` };
  return { status: "good", reason: `${what}, above the ${i.minMinutes} needed for percentiles.` };
}

function age(i: RiskInput): Omit<RiskItem, "key" | "label"> {
  if (i.birthYear == null) return { status: "unknown", reason: "Age not recorded.", demo: false };
  if (i.birthYearDemo) return { status: "caution", reason: `Birth year ${i.birthYear} is a demo value, not a documented one.`, demo: true };
  if (!i.idVerified) return { status: "caution", reason: `Birth year ${i.birthYear} has not been checked against an ID document.`, demo: false };
  return { status: "good", reason: `Birth year ${i.birthYear}, checked against an ID document.`, demo: false };
}

function transfer(i: RiskInput): Omit<RiskItem, "key" | "label"> {
  const m = i.market;
  if (!m || (!m.contractEnd && !m.availability && !m.transferConditions)) {
    return { status: "unknown", reason: "No contract end, availability or transfer conditions recorded.", demo: false };
  }
  const today = i.today.toISOString().slice(0, 10);
  const inAYear = new Date(i.today.getTime() + 365 * 86400_000).toISOString().slice(0, 10);
  const contract = m.contractEnd ? (m.contractEnd < today ? `contract ended ${fmtDate(m.contractEnd)}` : `contract until ${fmtDate(m.contractEnd)}`) : "contract end not recorded";
  const conditions = m.transferConditions ? ` Conditions: ${m.transferConditions}.` : "";
  const out = (status: RiskStatus, lead: string) => ({ status, reason: `${lead}; ${contract}.${conditions}`, demo: m.demo });
  if (m.availability === "not_available") return out("caution", "Not available");
  if (m.availability === "available") return out("good", "Available");
  if (m.availability === "open_to_offers") return out("good", "Open to offers");
  if (m.contractEnd && m.contractEnd <= inAYear) return out("good", "Availability not stated, but the contract ends within a year");
  return out(m.contractEnd ? "caution" : "unknown", "Availability not stated");
}

export function assessRisk(i: RiskInput): RiskItem[] {
  return [
    { key: "stronger", label: "Against stronger teams", demo: false, ...stronger(i.matches) },
    { key: "consistency", label: "Consistency across matches", demo: false, ...consistency(i.matches) },
    { key: "roles", label: "Roles played", demo: false, ...roles(i.roles) },
    { key: "sample", label: "Sample size", demo: false, ...sample(i) },
    { key: "age", label: "Age documented", ...age(i) },
    { key: "transfer", label: "Transfer realistic", ...transfer(i) },
  ];
}

// Under this many foot touches (passes and shots) the match data does not name a foot.
export const FOOT_MIN_TOUCHES = 30;
// The weaker foot at this share or more of touches counts as two-footed.
export const BOTH_FEET_SHARE = 40;

export type MatchFoot = { foot: Foot; weakShare: number; touches: number };

export function matchFoot({ right, left }: { right: number; left: number }): MatchFoot | null {
  const touches = right + left;
  if (touches < FOOT_MIN_TOUCHES) return null;
  const weakShare = Math.round((100 * Math.min(right, left)) / touches);
  return { foot: weakShare >= BOTH_FEET_SHARE ? "both" : right >= left ? "right" : "left", weakShare, touches };
}
