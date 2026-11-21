"use server";

import { refresh } from "next/cache";
import { db, requireMe } from "@/lib/auth";
import { str } from "@/lib/input";

const DECISIONS = ["approved", "declined"];

function decision(form: FormData): { decision: string; note: string } | string {
  const d = str(form, "decision");
  const note = str(form, "note");
  if (!DECISIONS.includes(d)) return "Choose approve or decline.";
  if (d === "declined" && note.length < 5) return "Write a short note on why: the player and guardian see it.";
  return { decision: d, note };
}

export async function decideApproval(form: FormData): Promise<string | void> {
  await requireMe(["admin"]);
  const d = decision(form);
  if (typeof d === "string") return d;
  await db((tx) => tx`select app.decide_approval(${str(form, "player")}::uuid, ${d.decision}, ${d.note})`);
  refresh();
}

export async function decideClaim(form: FormData): Promise<string | void> {
  await requireMe(["admin"]);
  const d = decision(form);
  if (typeof d === "string") return d;
  try {
    await db((tx) => tx`select app.decide_claim(${str(form, "claim")}::uuid, ${d.decision}, ${d.note})`);
  } catch (e) {
    console.error("decide_claim failed", e);
    return `The claim was not decided: ${e instanceof Error ? e.message : "database error"}.`;
  }
  refresh();
}

export async function activateUser(form: FormData): Promise<string | void> {
  await requireMe(["admin"]);
  await db((tx) => tx`update app_users set active = true where id = ${str(form, "user")}`);
  refresh();
}

export async function setCoverage(form: FormData): Promise<string | void> {
  await requireMe(["admin"]);
  const [org, competition, change] = [str(form, "org"), str(form, "competition"), str(form, "change")];
  await db((tx) => {
    switch (change) {
      case "grant": return tx`insert into org_coverage (org_id, competition_id) values (${org}, ${competition}) on conflict do nothing`;
      case "remove": return tx`delete from org_coverage where org_id = ${org} and competition_id = ${competition}`;
      case "owner": return tx`update org_coverage set owner = true where org_id = ${org} and competition_id = ${competition}`;
      case "not_owner": return tx`update org_coverage set owner = false where org_id = ${org} and competition_id = ${competition}`;
      default: throw new Error(`unknown coverage change ${change}`);
    }
  });
  refresh();
}
