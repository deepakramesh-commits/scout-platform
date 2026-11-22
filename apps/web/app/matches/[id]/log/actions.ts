"use server";

import { revalidatePath } from "next/cache";
import { db, requireMe } from "@/lib/auth";
import { parsePeriods } from "@/lib/log-tool";
import type { Period } from "@/lib/qc";

export type ActionResult = { ok: true } | { ok: false; error: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function savePeriods(matchId: string, periods: Period[]): Promise<ActionResult> {
  await requireMe(["tagger", "admin"]);
  const parsed = parsePeriods(periods);
  if (!parsed.ok) return { ok: false, error: parsed.errors.join("; ") };
  return db(async (tx) => {
    const [row] = await tx<{ ok: boolean }[]>`select app.assigned(id, 'analyst') as ok from matches where id = ${matchId} and status <> 'published'`;
    if (!row?.ok) return { ok: false, error: "Only the match's analyst can mark periods, and not after publishing." };
    await tx`update matches set periods = ${tx.json(parsed.value)} where id = ${matchId}`;
    return { ok: true } as const;
  });
}

export async function moveMatch(matchId: string, next: "tagging" | "review"): Promise<ActionResult> {
  await requireMe(["tagger", "admin"]);
  try {
    await db(async (tx) => {
      const [m] = await tx<{ status: string }[]>`select status from matches where id = ${matchId}`;
      if (m?.status === "uploaded" && next === "review") await tx`select app.advance_match(${matchId}, 'tagging')`;
      await tx`select app.advance_match(${matchId}, ${next})`;
    });
  } catch (e) {
    return { ok: false, error: message(e) };
  }
  revalidatePath(`/matches/${matchId}`, "layout");
  return { ok: true };
}
