// node --test ignores tsconfig paths and needs file extensions: import only relative `.ts` files here.

export const RECOMMENDATIONS = ["sign", "follow", "pass"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = { sign: "Sign", follow: "Follow", pass: "Pass" };

export const REPORT_ROLES = ["scout", "agent", "admin"];

export const TEXT_MAX = 4000;
export const SEEN_MAX = 200;

export type ReportInput = {
  seenIn: string; recommendation: Recommendation; strengths: string; weaknesses: string; comments: string;
  ratings: Record<string, number>;
};
export type ReportField = "seenIn" | "recommendation" | "strengths" | "weaknesses" | "comments" | "ratings" | "content";
export type ParsedReport = { ok: true; value: ReportInput } | { ok: false; errors: Partial<Record<ReportField, string>> };

const RATING_PREFIX = "rating.";
export const ratingField = (attribute: string) => `${RATING_PREFIX}${attribute}`;

const isRecommendation = (v: string): v is Recommendation => (RECOMMENDATIONS as readonly string[]).includes(v);
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export function parseReport(form: FormData, attributes: Set<string>): ParsedReport {
  const errors: Partial<Record<ReportField, string>> = {};
  const seenIn = text(form.get("seenIn"));
  if (!seenIn) errors.seenIn = "Say where you saw him: a match, a training session or an interview.";
  else if (seenIn.length > SEEN_MAX) errors.seenIn = `Keep this under ${SEEN_MAX} characters.`;

  const rec = text(form.get("recommendation"));
  if (!isRecommendation(rec)) errors.recommendation = "Choose sign, follow or pass.";

  const [strengths, weaknesses, comments] = (["strengths", "weaknesses", "comments"] as const).map((k) => {
    const v = text(form.get(k));
    if (v.length > TEXT_MAX) errors[k] = `Keep this under ${TEXT_MAX} characters.`;
    return v;
  });

  const ratings: Record<string, number> = {};
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith(RATING_PREFIX)) continue;
    const attribute = key.slice(RATING_PREFIX.length);
    const v = text(raw);
    if (!attributes.has(attribute)) { errors.ratings = "Rate only the attributes on the form."; continue; }
    if (!v) continue;
    if (!/^\d+$/.test(v) || +v < 1 || +v > 10) { errors.ratings ??= "Ratings are whole numbers from 1 to 10."; continue; }
    ratings[attribute] = +v;
  }

  if (!Object.keys(ratings).length && !strengths && !weaknesses && !comments && !errors.ratings) {
    errors.content = "Give at least one rating or write a strength, weakness or comment.";
  }
  if (Object.keys(errors).length || !isRecommendation(rec)) return { ok: false, errors };
  return { ok: true, value: { seenIn, recommendation: rec, strengths, weaknesses, comments, ratings } };
}
