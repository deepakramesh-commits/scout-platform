"use server";

import { refresh } from "next/cache";
import { db, requireScouting } from "@/lib/auth";
import { str } from "@/lib/input";
import { currentMatches } from "@/lib/queries";
import { searchQuery } from "@/lib/search";

export async function saveSearch(form: FormData): Promise<string | void> {
  const user = await requireScouting();
  const name = str(form, "name");
  if (name.length < 2) return "Give the search a name.";
  await db(async (tx) => {
    const { filters, ids } = await currentMatches(tx, str(form, "query"));
    await tx`insert into saved_searches (owner_id, name, query, seen_player_ids) values (${user.id}, ${name}, ${searchQuery(filters)}, ${ids}::uuid[])`;
  });
  refresh();
}

export async function markSeen(form: FormData): Promise<string | void> {
  await requireScouting();
  await db(async (tx) => {
    const [s] = await tx<{ query: string }[]>`select query from saved_searches where id = ${str(form, "id")}`;
    if (!s) return;
    const { ids } = await currentMatches(tx, s.query);
    await tx`update saved_searches set seen_player_ids = ${ids}::uuid[], checked_at = now() where id = ${str(form, "id")}`;
  });
  refresh();
}

export async function deleteSearch(form: FormData): Promise<string | void> {
  await requireScouting();
  await db((tx) => tx`delete from saved_searches where id = ${str(form, "id")}`);
  refresh();
}
