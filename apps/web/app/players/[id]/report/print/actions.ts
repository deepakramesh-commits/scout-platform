"use server";

import { headers } from "next/headers";
import { db, requireScouting } from "@/lib/auth";
import { newShareLink } from "@/lib/report";
import { UUID } from "../../player";

export type ShareResult = { ok: true; url: string; expiresAt: string } | { ok: false; error: string };

export async function createShareLink(playerId: string, profileId: string | null, competitionId: string | null): Promise<ShareResult> {
  const user = await requireScouting();
  if (!UUID.test(playerId) || (profileId && !UUID.test(profileId)) || (competitionId && !UUID.test(competitionId))) return { ok: false, error: "This report is out of date. Reload the page." };
  if (!user.org_id) return { ok: false, error: "Your account belongs to no organisation, so it cannot share a report." };
  const { token, expiresAt } = newShareLink(new Date());
  try {
    await db((tx) => tx`
      insert into report_links (token, player_id, profile_id, competition_id, org_id, created_by, expires_at)
      values (${token}, ${playerId}, ${profileId}, ${competitionId}, ${user.org_id}, ${user.id}, ${expiresAt})`);
  } catch (e) {
    console.error("share link not created", { playerId, error: e });
    return { ok: false, error: "The link could not be created. Try again." };
  }
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return { ok: true, url: `${origin}/r/${token}`, expiresAt: expiresAt.toISOString() };
}
