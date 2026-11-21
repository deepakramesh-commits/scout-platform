import { UUID } from "./input.ts";

export const ACCOUNT_TYPES = {
  scout: { label: "Club scout", role: "scout", orgKind: "club", orgLabel: "Club" },
  agent: { label: "Agent", role: "agent", orgKind: "agency", orgLabel: "Agency" },
  federation: { label: "Federation or league", role: "federation", orgKind: "federation", orgLabel: "Federation or league" },
  coach: { label: "Academy or club coach", role: "coach", orgKind: "academy", orgLabel: "Academy or club" },
  coordinator: { label: "Club coordinator", role: "coordinator", orgKind: "club", orgLabel: "Club" },
  analyst: { label: "Analyst (our staff)", role: "tagger", orgKind: null, orgLabel: null },
  player: { label: "Player", role: "player", orgKind: null, orgLabel: null },
  guardian: { label: "Parent or guardian", role: "guardian", orgKind: null, orgLabel: null },
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;

export type SignupInput = {
  type: string; name: string; email: string; password: string; org?: string;
  playerName?: string; dateOfBirth?: string; position?: string; nationality?: string;
  guardianName?: string; guardianContact?: string; consent?: boolean;
  claimPlayerId?: string;
};
export type SignupPlan = {
  type: AccountType; role: string; orgKind: string | null; active: boolean;
  player: null | { name: string; dateOfBirth: string; birthYear: number; underEighteen: boolean };
  claimPlayerId: string | null;
};
export type SignupResult = { ok: true; plan: SignupPlan } | { ok: false; errors: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The roles app.is_staff() trusts with every match and every pending profile.
const STAFF_ROLES: string[] = ["admin", "tagger", "coordinator"];
const POSITIONS = ["GK", "CB", "FB", "DM", "CM", "AM", "LW", "RW", "ST"];

export function ageOn(dateOfBirth: string, today: Date): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export function planSignup(input: SignupInput, today = new Date()): SignupResult {
  const errors: Record<string, string> = {};
  const type = input.type in ACCOUNT_TYPES ? (input.type as AccountType) : null;
  if (!type) return { ok: false, errors: { type: "Choose what kind of account this is" } };
  const spec = ACCOUNT_TYPES[type];
  if (input.name.trim().length < 2) errors.name = "Enter your name";
  if (!EMAIL.test(input.email.trim())) errors.email = "Enter a valid email address";
  if (input.password.length < 10) errors.password = "Use at least 10 characters";
  if (spec.orgKind && (input.org ?? "").trim().length < 2) errors.org = `Enter your ${spec.orgLabel!.toLowerCase()}`;

  let player: SignupPlan["player"] = null;
  if (type === "player" || type === "guardian") {
    const name = (type === "player" ? input.name : input.playerName ?? "").trim();
    if (type === "guardian" && name.length < 2) errors.playerName = "Enter the player's name";
    const dob = input.dateOfBirth ?? "";
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(dob) && !Number.isNaN(Date.parse(dob));
    const age = valid ? ageOn(dob, today) : NaN;
    if (!valid) errors.dateOfBirth = "Enter the date of birth";
    else if (age < 10 || age > 45) errors.dateOfBirth = "Check the date of birth";
    if (input.position && !POSITIONS.includes(input.position)) errors.position = "Choose a position from the list";
    const under = valid && age < 18;
    if (type === "guardian" && valid && !under) errors.dateOfBirth = "A player of 18 or over signs up himself";
    if (under && type === "player" && !(input.guardianName ?? "").trim()) errors.guardianName = "A player under 18 needs a parent or guardian";
    if (under && !(input.guardianContact ?? "").trim()) errors.guardianContact = "Enter a phone number or email for the guardian";
    if (!input.consent) errors.consent = "Consent is needed before a profile can be shown to clubs";
    if (valid) player = { name, dateOfBirth: dob, birthYear: Number(dob.slice(0, 4)), underEighteen: under };
  }
  const claimPlayerId = input.claimPlayerId?.trim() || null;
  if (claimPlayerId && (!(type === "player" || type === "guardian") || !UUID.test(claimPlayerId))) errors.claimPlayerId = "Choose the profile to claim from the list";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, plan: { type, role: spec.role, orgKind: spec.orgKind, active: !STAFF_ROLES.includes(spec.role), player, claimPlayerId } };
}
