"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db, isDenied, requireMe } from "@/lib/auth";
import { str, UUID } from "@/lib/input";

const SHORTLIST_ROLES = ["scout", "agent", "admin"];
const DENIED = "You do not have access to do that for this player.";
async function ok(write: Promise<unknown>): Promise<string | void> {
  try { await write; } catch (e) { if (isDenied(e)) return DENIED; throw e; }
  refresh();
}

export async function createShortlist(form: FormData): Promise<string | void> {
  const user = await requireMe(SHORTLIST_ROLES);
  const name = str(form, "name");
  if (name.length < 2) return "Give the shortlist a name.";
  const [list] = await db((tx) => tx<{ id: string }[]>`insert into shortlists (owner_id, name) values (${user.id}, ${name}) returning id`);
  redirect(`/shortlists?list=${list.id}`);
}

export async function renameShortlist(form: FormData): Promise<string | void> {
  await requireMe(SHORTLIST_ROLES);
  const name = str(form, "name");
  if (name.length < 2) return "Give the shortlist a name.";
  return ok(db((tx) => tx`update shortlists set name = ${name} where id = ${str(form, "list")}`));
}

export async function deleteShortlist(form: FormData): Promise<string | void> {
  await requireMe(SHORTLIST_ROLES);
  await db((tx) => tx`delete from shortlists where id = ${str(form, "list")}`);
  redirect("/shortlists");
}

export async function addToShortlist(form: FormData): Promise<string | void> {
  await requireMe(SHORTLIST_ROLES);
  const [list, player] = [str(form, "list"), str(form, "player")];
  if (!UUID.test(list)) return "Choose a shortlist.";
  if (!UUID.test(player)) return "Choose a player.";
  return ok(db((tx) => tx`
    insert into shortlist_players (shortlist_id, player_id, rank)
    values (${list}, ${player}, (select coalesce(max(rank), 0) + 1 from shortlist_players where shortlist_id = ${list}))
    on conflict do nothing`));
}

export async function removeFromShortlist(form: FormData): Promise<string | void> {
  await requireMe(SHORTLIST_ROLES);
  return ok(db((tx) => tx`delete from shortlist_players where shortlist_id = ${str(form, "list")} and player_id = ${str(form, "player")}`));
}

export async function updateShortlistEntry(form: FormData): Promise<string | void> {
  await requireMe(SHORTLIST_ROLES);
  const rank = Number(str(form, "rank") || 0);
  if (!Number.isInteger(rank) || rank < 0 || rank > 99) return "Rank is a whole number from 1 to 99, or empty.";
  return ok(db((tx) => tx`
    update shortlist_players set note = ${str(form, "note") || null}, rank = ${rank}
    where shortlist_id = ${str(form, "list")} and player_id = ${str(form, "player")}`));
}

export async function requestIntro(form: FormData): Promise<string | void> {
  const user = await requireMe(["scout"]);
  if (!user.org_id) return "Your account belongs to no club.";
  const player = str(form, "player");
  if (!UUID.test(player)) return "Choose a player.";
  return ok(db((tx) => tx`
    insert into intro_requests (player_id, from_user, from_org, message) values (${player}, ${user.id}, ${user.org_id}, ${str(form, "message")})`));
}

export async function setIntroStatus(form: FormData): Promise<string | void> {
  const user = await requireMe(["agent", "admin"]);
  const status = str(form, "status");
  if (!["new", "in_progress", "closed"].includes(status)) return "Choose a status.";
  const rows = await db((tx) => tx`update intro_requests set status = ${status} where id = ${str(form, "id")} returning id`);
  if (!rows.length) return user.is_partner_agency ? "That request no longer exists." : "Only the partner agency updates introduction requests.";
  refresh();
}

export async function addClient(form: FormData): Promise<string | void> {
  const user = await requireMe(["agent"]);
  const player = str(form, "player");
  if (!UUID.test(player)) return "Choose a player.";
  return ok(db((tx) => tx`insert into agent_clients (org_id, player_id) values (${user.org_id}, ${player}) on conflict do nothing`));
}

export async function removeClient(form: FormData): Promise<string | void> {
  const user = await requireMe(["agent"]);
  return ok(db((tx) => tx`delete from agent_clients where org_id = ${user.org_id} and player_id = ${str(form, "player")}`));
}

export async function sendProfile(form: FormData): Promise<string | void> {
  const user = await requireMe(["agent"]);
  if (!user.org_id) return "Your account belongs to no agency.";
  const [player, club] = [str(form, "player"), str(form, "club")];
  if (!UUID.test(player)) return "Choose a player to send.";
  if (!UUID.test(club)) return "Choose the club to send the profile to.";
  const sent = await db((tx) => tx`
    insert into profile_shares (player_id, from_user, from_org, to_org, message)
    select ${player}, ${user.id}, ${user.org_id}, id, ${str(form, "message")} from orgs where id = ${club} and kind = 'club'
    returning id`).catch((e: unknown) => { if (isDenied(e)) return DENIED; throw e; });
  if (typeof sent === "string") return sent;
  if (!sent.length) return "Profiles go to clubs; choose a club.";
  refresh();
}
