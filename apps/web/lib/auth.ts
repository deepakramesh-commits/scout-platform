// Accounts and the per-request database role. Every page reads through `db()`, which runs its queries as role
// `authenticated` (or `anon`) with the user's id in request.jwt.claims, exactly as Supabase does, so row-level
// security decides what each user sees. `serviceSql` (superuser) is used only here, for sign-in and sign-up, the
// work Supabase's auth service does, and by webhooks; app/no-service-sql.test.ts keeps it out of pages.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type postgres from "postgres";
import { serviceSql } from "./db";
import { SESSION_DAYS, signSession, verifySession } from "./session-token.ts";
import { SCOUTING_ROLES } from "./nav.ts";
import { planSignup, type SignupInput } from "./signup.ts";

export type Q = postgres.TransactionSql;
export const SESSION_COOKIE = "scout_session";
const DEV_SECRET = "scout-dev-session-secret-change-me";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return DEV_SECRET;
}

export const currentUserId = cache(async (): Promise<string | null> =>
  verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret()));

export type Me = {
  id: string; role: string; display_name: string | null; email: string | null; active: boolean;
  org_id: string | null; org_name: string | null; org_kind: string | null; is_partner_agency: boolean;
};

/** The signed-in user, read through RLS (a user may always read his own row). */
export const me = cache(async (): Promise<Me | null> => {
  const uid = await currentUserId();
  if (!uid) return null;
  const [row] = await db((q) => q<Me[]>`
    select u.id, u.role, u.display_name, u.email, u.active, u.org_id, o.name as org_name, o.kind as org_kind,
           coalesce(o.is_partner_agency, false) as is_partner_agency
    from app_users u left join orgs o on o.id = u.org_id where u.id = ${uid}`);
  return row ?? null;
});

/** The page needs a signed-in, active user (optionally of certain roles); otherwise to sign-in. */
export async function requireMe(roles?: string[]): Promise<Me> {
  const user = await me();
  if (!user) redirect("/login");
  if (!user.active) redirect("/account?inactive=1");
  if (roles && !roles.includes(user.role)) redirect("/account");
  return user;
}

export const requireScouting = () => requireMe(SCOUTING_ROLES);

/** Run queries as the signed-in user (or anon), inside one transaction so the role and claims hold for all of them. */
export async function db<T>(fn: (q: Q) => Promise<T>, asUser?: string | null): Promise<T> {
  const uid = asUser === undefined ? await currentUserId() : asUser;
  return serviceSql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" })}, true)`;
    await tx.unsafe(uid ? "set local role authenticated" : "set local role anon");
    return fn(tx);
  }) as Promise<T>;
}

async function startSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, signSession(userId, secret()), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Checks the password with pgcrypto, as Supabase's auth.users does. Null for a wrong email or password. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const [row] = await serviceSql<{ id: string }[]>`
    select u.id from auth.users u join app_users a on a.id = u.id
    where lower(u.email) = lower(${email.trim()}) and u.encrypted_password = crypt(${password}, u.encrypted_password)`;
  if (!row) return null;
  await startSession(row.id);
  return row.id;
}

export type SignupOutcome = { ok: true } | { ok: false; errors: Record<string, string> };
class ClaimTaken extends Error {}

/** Creates the login, the organisation, and for players the profile, identity and consent, in one transaction. */
export async function signUp(input: SignupInput): Promise<SignupOutcome> {
  const planned = planSignup(input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const email = input.email.trim().toLowerCase();
  const [taken] = await serviceSql`select 1 from auth.users where lower(email) = ${email}`;
  if (taken) return { ok: false, errors: { email: "An account with this email already exists. Sign in instead." } };

  const userId = await serviceSql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, encrypted_password) values (gen_random_uuid(), ${email}, crypt(${input.password}, gen_salt('bf')))
      returning id`;
    let orgId: string | null = null;
    if (plan.orgKind) {
      const [org] = await tx<{ id: string }[]>`insert into orgs (name, kind) values (${input.org!.trim()}, ${plan.orgKind}) returning id`;
      orgId = org.id;
    }
    await tx`insert into app_users (id, org_id, role, display_name, email, active)
             values (${user.id}, ${orgId}, ${plan.role}, ${input.name.trim()}, ${email}, ${plan.active})`;
    if (plan.player) {
      const isPlayer = plan.type === "player";
      const guardianName = isPlayer ? input.guardianName?.trim() || null : input.name.trim();
      let playerId = plan.claimPlayerId;
      if (playerId) {
        // Claiming a profile built from match data: an admin links it after checking (app.decide_claim).
        const [open] = await tx`select 1 from players where id = ${playerId} and origin = 'match_data' and claimed_by is null`;
        if (!open) throw new ClaimTaken();
        await tx`insert into profile_claims (player_id, user_id) values (${playerId}, ${user.id})`;
      } else {
        // Under 18 waits for an admin. Set here because the age trigger counts birth years and would let a 17-year-old born
        // late in the year through as 18.
        const [player] = await tx<{ id: string }[]>`
          insert into players (display_name, birth_year, nationality, primary_position, origin, claimed_by, guardian_id, status)
          values (${plan.player.name}, ${plan.player.birthYear}, ${input.nationality?.trim() || null}, ${input.position || null}, 'sign_up',
                  ${isPlayer ? user.id : null}, ${isPlayer ? null : user.id}, ${plan.player.underEighteen ? "pending_approval" : "live"})
          returning id`;
        playerId = player.id;
        await tx`insert into player_identity (player_id, legal_name, date_of_birth) values (${playerId}, ${plan.player.name}, ${plan.player.dateOfBirth})`;
      }
      await tx`insert into consents (player_id, signed_by, scope, guardian_name, guardian_contact)
               values (${playerId}, ${user.id}, '{share_with_clubs}', ${guardianName}, ${input.guardianContact?.trim() || null})`;
    }
    return user.id;
  }).catch((e: unknown) => { if (e instanceof ClaimTaken) return e; throw e; });
  if (userId instanceof ClaimTaken) return { ok: false, errors: { claimPlayerId: "That profile has just been claimed. Choose another, or create a new profile." } };
  await startSession(userId);
  return { ok: true };
}
