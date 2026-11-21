"use server";

import { redirect } from "next/navigation";
import { db, signUp } from "@/lib/auth";
import { SCOUTING_ROLES } from "@/lib/nav";
import { ACCOUNT_TYPES, type SignupInput } from "@/lib/signup";

export type SignupErrors = Record<string, string> | null;
export type Claimable = { id: string; display_name: string; primary_position: string | null; nationality: string | null };

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The form posts plain values; planSignup (inside signUp) validates every one of them. */
export async function signup(raw: Record<string, unknown>): Promise<SignupErrors> {
  const input: SignupInput = {
    type: text(raw.type), name: text(raw.name), email: text(raw.email), password: text(raw.password), org: text(raw.org),
    playerName: text(raw.playerName), dateOfBirth: text(raw.dateOfBirth), position: text(raw.position) || undefined,
    nationality: text(raw.nationality), guardianName: text(raw.guardianName), guardianContact: text(raw.guardianContact),
    consent: raw.consent === true, claimPlayerId: text(raw.claimPlayerId) || undefined,
  };
  const outcome = await signUp(input);
  if (!outcome.ok) return outcome.errors;
  const role = Object.entries(ACCOUNT_TYPES).find(([key]) => key === input.type)?.[1].role ?? "";
  redirect(SCOUTING_ROLES.includes(role) ? "/" : "/account?welcome=1");
}

// Runs before an account exists, so as anon. app.claimable_players exposes only name, position and nationality.
export async function findClaimable(q: string): Promise<Claimable[]> {
  const query = text(q).trim();
  if (query.length < 3) return [];
  return db((tx) => tx<Claimable[]>`select id, display_name, primary_position, nationality from app.claimable_players(${query})`, null);
}
