"use server";

import { refresh } from "next/cache";
import { db, isDenied, requireMe } from "@/lib/auth";
import { isVerified, parseVerification } from "@/lib/workflow";

export async function saveVerification(form: FormData): Promise<string | void> {
  const user = await requireMe(["admin", "federation"]);
  const parsed = parseVerification(form);
  if (!parsed.ok) return parsed.error;
  const v = parsed.value;
  const player = String(form.get("player") ?? "");
  const done = isVerified(v);
  const saved = await db(async (tx) => {
    const rows = await tx`
      insert into verifications (player_id, federation_registration, id_checked, photo_checked, contract_status, note, verified_by, verified_at)
      values (${player}, ${v.registration}, ${v.idChecked}, ${v.photoChecked}, ${v.contract}, ${v.note}, ${user.id}, ${done ? new Date() : null})
      on conflict (player_id) do update set federation_registration = excluded.federation_registration, id_checked = excluded.id_checked,
        photo_checked = excluded.photo_checked, contract_status = excluded.contract_status, note = excluded.note,
        verified_by = excluded.verified_by, verified_at = excluded.verified_at
      returning player_id`;
    if (v.identity) {
      await tx`
        insert into player_identity (player_id, legal_name, date_of_birth, verified_by, verified_at)
        values (${player}, ${v.identity.legalName}, ${v.identity.dateOfBirth}, ${user.display_name ?? user.email}, ${done ? new Date() : null})
        on conflict (player_id) do update set legal_name = excluded.legal_name, date_of_birth = excluded.date_of_birth,
          verified_by = excluded.verified_by, verified_at = excluded.verified_at`;
    }
    return rows.length > 0;
  }).catch((e: unknown) => {
    if (isDenied(e)) return false;
    throw e;
  });
  if (!saved) return "You cannot verify this player.";
  refresh();
}
