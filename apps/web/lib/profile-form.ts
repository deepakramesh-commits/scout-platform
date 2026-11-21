// Pure: parses the requirement-profile form on the server. Relative `.ts` imports so `node --test` runs it.
import { PRIORITY_WEIGHT, type FitItem, type Priority } from "./fit.ts";

export const AGE_MIN = 14;
export const AGE_MAX = 45;

export type ProfileInput = {
  name: string; club: string | null; positions: string[]; ageMin: number | null; ageMax: number | null; items: FitItem[];
};
export type ProfileField = "name" | "club" | "positions" | "ages" | "items";
export type ParsedProfile = { ok: true; value: ProfileInput } | { ok: false; errors: Partial<Record<ProfileField, string>> };

/** Form field carrying the priority of a chosen attribute. */
export const priorityField = (attribute: string) => `priority.${attribute}`;

const isPriority = (v: unknown): v is Priority => typeof v === "string" && Object.hasOwn(PRIORITY_WEIGHT, v);
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function age(v: FormDataEntryValue | null): number | null | "bad" {
  const s = text(v);
  if (!s) return null;
  if (!/^\d+$/.test(s)) return "bad";
  const n = Number(s);
  return n >= AGE_MIN && n <= AGE_MAX ? n : "bad";
}

export function parseProfile(form: FormData, known: { positions: Set<string>; attributes: Set<string> }): ParsedProfile {
  const errors: Partial<Record<ProfileField, string>> = {};
  const name = text(form.get("name"));
  if (!name) errors.name = "Give the profile a name.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  const club = text(form.get("club")) || null;
  if (club && club.length > 80) errors.club = "Keep the club under 80 characters.";

  const positions = [...new Set(form.getAll("positions").map(text))];
  if (!positions.length) errors.positions = "Choose at least one position.";
  else if (positions.some((p) => !known.positions.has(p))) errors.positions = "Choose positions from the list.";

  const [ageMin, ageMax] = [age(form.get("ageMin")), age(form.get("ageMax"))];
  if (ageMin === "bad" || ageMax === "bad") errors.ages = `Ages are whole numbers from ${AGE_MIN} to ${AGE_MAX}.`;
  else if (ageMin != null && ageMax != null && ageMin > ageMax) errors.ages = "“Age from” must not be above “Age to”.";

  const attributes = [...new Set(form.getAll("attributes").map(text))];
  const items: FitItem[] = [];
  for (const attribute of attributes) {
    const priority = form.get(priorityField(attribute));
    if (!known.attributes.has(attribute)) errors.items = "Choose attributes from the list.";
    else if (!isPriority(priority)) errors.items = "Every attribute needs a priority: very high, high or medium.";
    else items.push({ attribute, priority });
  }
  if (!attributes.length) errors.items = "Choose at least one attribute.";

  if (Object.keys(errors).length || ageMin === "bad" || ageMax === "bad") return { ok: false, errors };
  return { ok: true, value: { name, club, positions, ageMin, ageMax, items } };
}
