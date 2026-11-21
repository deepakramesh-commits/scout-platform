"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ROLE_NAMES } from "@/lib/metrics";
import { parseProfile, type ParsedProfile } from "@/lib/profile-form";

export type SaveState = { errors: Extract<ParsedProfile, { ok: false }>["errors"] } | null;

export async function saveProfile(_: SaveState, form: FormData): Promise<SaveState> {
  const attributes = await sql<{ key: string }[]>`select key from attributes`;
  const parsed = parseProfile(form, { positions: new Set(Object.keys(ROLE_NAMES)), attributes: new Set(attributes.map((a) => a.key)) });
  if (!parsed.ok) return { errors: parsed.errors };
  const p = parsed.value;
  const id = await sql.begin(async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      insert into requirement_profiles (name, club, positions, age_min, age_max)
      values (${p.name}, ${p.club}, ${p.positions}::text[], ${p.ageMin}, ${p.ageMax}) returning id`;
    await tx`insert into requirement_items ${tx(p.items.map((i) => ({ profile_id: id, attribute: i.attribute, priority: i.priority })))}`;
    return id;
  });
  redirect(`/roles?profile=${id}`);
}
