// node --test ignores tsconfig paths and needs file extensions: import only relative `.ts` files here.
import { randomBytes } from "node:crypto";
import type { Evidence } from "./fit.ts";
import { GROUP_ORDER, type Attribute, type AttributeGroup } from "./scouting.ts";

export type GroupAverage = { group: AttributeGroup; avg: number | null; rated: { key: string; label: string; value: number }[] };

/** The organisation's scout ratings averaged per attribute group, on the 1 to 10 scale the scouts use. */
export function scoutGroupAverages(attributes: Pick<Attribute, "key" | "label" | "grp">[], evidence: Record<string, Evidence>): GroupAverage[] {
  return GROUP_ORDER.map((group) => {
    const rated = attributes.flatMap((a) => {
      const scout = evidence[a.key]?.scout;
      return a.grp === group && scout != null ? [{ key: a.key, label: a.label, value: scout / 10 }] : [];
    });
    return { group, avg: rated.length ? rated.reduce((n, r) => n + r.value, 0) / rated.length : null, rated };
  });
}

export const SHARE_DAYS = 14;
const TOKEN_BYTES = 32;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const isShareToken = (s: string) => TOKEN.test(s);

export const newShareLink = (now: Date) => ({
  token: randomBytes(TOKEN_BYTES).toString("base64url"),
  expiresAt: new Date(now.getTime() + SHARE_DAYS * 86400_000),
});
