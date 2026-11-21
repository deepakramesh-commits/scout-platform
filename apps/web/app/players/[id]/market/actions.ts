"use server";

import { redirect } from "next/navigation";
import { db, requireMe } from "@/lib/auth";
import { parseMarket, parseTest, type ParsedMarket, type ParsedTest } from "@/lib/market-form";
import { getEditRights } from "@/lib/scouting";

export type MarketState = { errors: Extract<ParsedMarket, { ok: false }>["errors"] & { form?: string } } | null;
export type TestState = { errors: Extract<ParsedTest, { ok: false }>["errors"] & { form?: string } } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const playerOf = (form: FormData) => { const id = String(form.get("playerId") ?? ""); return UUID.test(id) ? id : null; };

export async function saveMarket(_: MarketState, form: FormData): Promise<MarketState> {
  await requireMe();
  const id = playerOf(form);
  if (!id) return { errors: { form: "This form is out of date. Reload the page." } };
  const parsed = parseMarket(form);
  if (!parsed.ok) return { errors: parsed.errors };
  const m = parsed.value;
  const saved = await db(async (tx) => {
    const can = await getEditRights(tx, id);
    if (!can.market && !can.player) return false;
    // A value a person enters is no longer demo, so its demo mark goes.
    if (can.player) {
      await tx`update players set height_cm = ${m.heightCm}, preferred_foot = ${m.preferredFoot},
                 demo_fields = array_remove(array_remove(demo_fields, 'height_cm'), 'preferred_foot')
               where id = ${id}`;
    }
    if (can.market) {
      await tx`insert into player_market (player_id, contract_end, availability, transfer_conditions, representative, is_demo, updated_at)
               values (${id}, ${m.contractEnd}, ${m.availability}, ${m.transferConditions}, ${m.representative}, false, now())
               on conflict (player_id) do update set contract_end = excluded.contract_end, availability = excluded.availability,
                 transfer_conditions = excluded.transfer_conditions, representative = excluded.representative, is_demo = false, updated_at = now()`;
    }
    return true;
  });
  if (!saved) return { errors: { form: "You cannot edit this player's market details." } };
  redirect(`/players/${id}?tab=market`);
}

export async function addTest(_: TestState, form: FormData): Promise<TestState> {
  await requireMe();
  const id = playerOf(form);
  if (!id) return { errors: { form: "This form is out of date. Reload the page." } };
  const kinds = await db((tx) => tx<{ key: string; unit: string }[]>`select key, unit from physical_test_kinds`);
  const parsed = parseTest(form, new Set(kinds.map((k) => k.key)), new Date());
  if (!parsed.ok) return { errors: parsed.errors };
  const t = parsed.value;
  const unit = kinds.find((k) => k.key === t.test)!.unit;
  const saved = await db(async (tx) => {
    const can = await getEditRights(tx, id);
    if (!can.addTest) return false;
    await tx`insert into physical_tests (player_id, test, value, unit, tested_at, verified)
             values (${id}, ${t.test}, ${t.value}, ${unit}, ${t.testedAt}, ${t.verified && can.verifyTest})`;
    return true;
  });
  if (!saved) return { errors: { form: "You cannot add tests for this player." } };
  redirect(`/players/${id}?tab=market#tests`);
}

export async function verifyTest(form: FormData): Promise<void> {
  await requireMe(["admin", "federation"]);
  const id = playerOf(form);
  const testId = String(form.get("testId") ?? "");
  if (!id || !UUID.test(testId)) return;
  // RLS lets only an admin, or a federation that sees the player, update a test.
  await db((tx) => tx`update physical_tests set verified = true where id = ${testId} and player_id = ${id}`);
  redirect(`/players/${id}/market#tests`);
}
