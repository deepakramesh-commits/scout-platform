// node --test ignores tsconfig paths and needs file extensions: import only relative `.ts` files here.

export const FEET = ["right", "left", "both"] as const;
export type Foot = (typeof FEET)[number];
export const AVAILABILITY = ["available", "open_to_offers", "not_available"] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available", open_to_offers: "Open to offers", not_available: "Not available",
};
export const HEIGHT_MIN = 140;
export const HEIGHT_MAX = 215;

export type MarketInput = {
  heightCm: number | null; preferredFoot: Foot | null; contractEnd: string | null; availability: Availability | null;
  transferConditions: string | null; representative: string | null;
};
export type MarketField = keyof MarketInput;
export type ParsedMarket = { ok: true; value: MarketInput } | { ok: false; errors: Partial<Record<MarketField, string>> };

export const TEST_RANGE: Record<string, { min: number; max: number; unit: string; name: string }> = {
  sprint_10m: { min: 1, max: 4, unit: "s", name: "A 10 m sprint" },
  sprint_30m: { min: 3, max: 8, unit: "s", name: "A 30 m sprint" },
  endurance: { min: 5, max: 24, unit: "", name: "A Yo-Yo IR1 level" },
  jump: { min: 10, max: 100, unit: "cm", name: "A countermovement jump" },
};

export type TestInput = { test: string; value: number; testedAt: string; verified: boolean };
export type TestField = keyof TestInput;
export type ParsedTest = { ok: true; value: TestInput } | { ok: false; errors: Partial<Record<TestField, string>> };

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const oneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

function isoDate(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

export function parseMarket(form: FormData): ParsedMarket {
  const errors: Partial<Record<MarketField, string>> = {};
  const h = text(form.get("heightCm"));
  const heightCm = h ? Number(h) : null;
  if (heightCm != null && !(Number.isInteger(heightCm) && heightCm >= HEIGHT_MIN && heightCm <= HEIGHT_MAX)) {
    errors.heightCm = `Height is a whole number of centimetres from ${HEIGHT_MIN} to ${HEIGHT_MAX}.`;
  }
  const foot = text(form.get("preferredFoot"));
  if (foot && !oneOf(FEET, foot)) errors.preferredFoot = "Choose right, left or both.";
  const end = text(form.get("contractEnd"));
  const contractEnd = end ? isoDate(end) : null;
  if (end && !contractEnd) errors.contractEnd = "Enter the contract end as a real date.";
  const avail = text(form.get("availability"));
  if (avail && !oneOf(AVAILABILITY, avail)) errors.availability = "Choose available, open to offers or not available.";
  const transferConditions = text(form.get("transferConditions")) || null;
  if (transferConditions && transferConditions.length > 500) errors.transferConditions = "Keep this under 500 characters.";
  const representative = text(form.get("representative")) || null;
  if (representative && representative.length > 120) errors.representative = "Keep this under 120 characters.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      heightCm, preferredFoot: oneOf(FEET, foot) ? foot : null, contractEnd,
      availability: oneOf(AVAILABILITY, avail) ? avail : null, transferConditions, representative,
    },
  };
}

export function parseTest(form: FormData, kinds: Set<string>, today: Date): ParsedTest {
  const errors: Partial<Record<TestField, string>> = {};
  const test = text(form.get("test"));
  const range = kinds.has(test) ? TEST_RANGE[test] : undefined;
  if (!kinds.has(test)) errors.test = "Choose a test from the list.";
  const raw = text(form.get("value")).replace(",", ".");
  const value = raw ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) errors.value = "Enter the result as a number.";
  else if (range && (value < range.min || value > range.max)) {
    errors.value = `${range.name} is between ${range.min} and ${range.max}${range.unit ? ` ${range.unit}` : ""}.`;
  }
  const testedAt = isoDate(text(form.get("testedAt")));
  if (!testedAt) errors.testedAt = "Enter the date of the test.";
  else if (testedAt > today.toISOString().slice(0, 10)) errors.testedAt = "The test date cannot be in the future.";

  if (Object.keys(errors).length || !testedAt) return { ok: false, errors };
  return { ok: true, value: { test, value, testedAt, verified: form.get("verified") === "on" } };
}
