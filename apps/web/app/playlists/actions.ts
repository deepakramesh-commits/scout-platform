"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db, requireMe } from "@/lib/auth";
import { str, UUID } from "@/lib/input";
import { moved } from "@/lib/playlist";

// Row-level security keeps every playlist with its owner; these only check the input.
const PLAYLIST_ROLES = ["scout"];
const name = (form: FormData) => str(form, "name").slice(0, 120);

export async function createPlaylist(form: FormData): Promise<string | void> {
  const user = await requireMe(PLAYLIST_ROLES);
  if (name(form).length < 2) return "Give the playlist a name.";
  const [list] = await db((tx) => tx<{ id: string }[]>`insert into playlists (owner_id, name) values (${user.id}, ${name(form)}) returning id`);
  const player = str(form, "player");
  redirect(UUID.test(player) ? `/playlists/add?player=${player}&list=${list.id}` : `/playlists?list=${list.id}`);
}

export async function renamePlaylist(form: FormData): Promise<string | void> {
  await requireMe(PLAYLIST_ROLES);
  if (name(form).length < 2) return "Give the playlist a name.";
  await db((tx) => tx`update playlists set name = ${name(form)} where id = ${str(form, "list")}`);
  refresh();
}

export async function deletePlaylist(form: FormData): Promise<string | void> {
  await requireMe(PLAYLIST_ROLES);
  await db((tx) => tx`delete from playlists where id = ${str(form, "list")}`);
  redirect("/playlists");
}

export async function addToPlaylist(form: FormData): Promise<string | void> {
  await requireMe(PLAYLIST_ROLES);
  const [list, event] = [str(form, "list"), str(form, "event")];
  if (!UUID.test(list)) return "Choose a playlist first.";
  if (!UUID.test(event)) return "Choose an action.";
  // Selecting the event under row-level security means only an action the scout can see goes in.
  const added = await db((tx) => tx`
    insert into playlist_items (playlist_id, event_id, position)
    select ${list}, e.id, (select coalesce(max(position), 0) + 1 from playlist_items where playlist_id = ${list})
    from events e where e.id = ${event}
    on conflict do nothing returning event_id`);
  if (!added.length) return "That action is already in the playlist, or no longer available.";
  refresh();
}

export async function removeFromPlaylist(form: FormData): Promise<string | void> {
  await requireMe(PLAYLIST_ROLES);
  await db((tx) => tx`delete from playlist_items where playlist_id = ${str(form, "list")} and event_id = ${str(form, "event")}`);
  refresh();
}

export async function notePlaylistItem(form: FormData): Promise<string | void> {
  await requireMe(PLAYLIST_ROLES);
  await db((tx) => tx`
    update playlist_items set note = ${str(form, "note").slice(0, 1000)}
    where playlist_id = ${str(form, "list")} and event_id = ${str(form, "event")}`);
  refresh();
}

export async function movePlaylistItem(form: FormData): Promise<string | void> {
  await requireMe(PLAYLIST_ROLES);
  const [list, event, by] = [str(form, "list"), str(form, "event"), str(form, "by") === "up" ? -1 : 1] as const;
  if (!UUID.test(list)) return "Choose a playlist.";
  await db(async (tx) => {
    const rows = await tx<{ event_id: string }[]>`
      select event_id from playlist_items where playlist_id = ${list} order by position, event_id for update`;
    const order = moved(rows.map((r) => r.event_id), event, by);
    // Rewriting every position also repairs ties, so the order shown is always the order stored.
    if (order) await tx`
      update playlist_items i set position = v.position
      from (select unnest(${order}::uuid[]) as event_id, generate_series(1, ${order.length}) as position) v
      where i.playlist_id = ${list} and i.event_id = v.event_id`;
  });
  refresh();
}
