import { db, me } from "./auth";

const VIEWER_ROLES = new Set(["scout", "agent", "federation", "coach"]);

export async function recordProfileView(playerId: string): Promise<void> {
  const user = await me();
  if (!user || !user.org_id || !VIEWER_ROLES.has(user.role)) return;
  await db((tx) => tx`insert into profile_views (viewer_id, player_id, org_id) values (${user.id}, ${playerId}, ${user.org_id})`)
    .catch((e: unknown) => console.error("profile view not recorded", { playerId, error: e }));
}
