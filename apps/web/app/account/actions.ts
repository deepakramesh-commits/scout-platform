"use server";

import { refresh } from "next/cache";
import { db, isDenied, requireMe } from "@/lib/auth";
import { UUID } from "@/lib/input";

export async function confirmAgent(form: FormData): Promise<string | void> {
  await requireMe(["player", "guardian"]);
  const [player, org] = [String(form.get("player") ?? ""), String(form.get("org") ?? "")];
  if (!UUID.test(player) || !UUID.test(org)) return "This page is out of date. Reload it.";
  const denied = await db((tx) => tx`select app.confirm_agent(${org}, ${player})`).then(() => false, (e: unknown) => { if (isDenied(e)) return true; throw e; });
  if (denied) return "A player under 18 needs his guardian or one of our admins to confirm an agency.";
  refresh();
}

export async function withdrawConsent(form: FormData): Promise<string | void> {
  await requireMe(["player", "guardian"]);
  if (form.get("confirm") !== "on") return "Tick the box to confirm you want to withdraw consent.";
  const rows = await db((tx) => tx`update consents set revoked_at = now() where id = ${String(form.get("consent") ?? "")} and revoked_at is null returning id`);
  if (!rows.length) return "This consent can be withdrawn only once the profile is linked to your account.";
  refresh();
}
