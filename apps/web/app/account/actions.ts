"use server";

import { refresh } from "next/cache";
import { db, requireMe } from "@/lib/auth";

// The consents trigger hides the profile at once and queues deletion of personal data.
export async function withdrawConsent(form: FormData): Promise<string | void> {
  await requireMe(["player", "guardian"]);
  if (form.get("confirm") !== "on") return "Tick the box to confirm you want to withdraw consent.";
  const rows = await db((tx) => tx`update consents set revoked_at = now() where id = ${String(form.get("consent") ?? "")} and revoked_at is null returning id`);
  if (!rows.length) return "This consent can be withdrawn only once the profile is linked to your account.";
  refresh();
}
