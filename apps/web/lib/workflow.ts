// Pure rules behind the phase 4 workflow screens: the shadow team, the verification form and ID uploads.

export const SLOTS = ["GK", "CB", "FB", "DM", "CM", "AM", "LW", "RW", "ST"] as const;
export type Slot = (typeof SLOTS)[number];
const isSlot = (v: string | null): v is Slot => SLOTS.some((s) => s === v);

/** Where each slot sits on a pitch drawn 0..100 across and 0..100 from our goal line up to theirs. */
export const SLOT_XY: Record<Slot, { x: number; y: number }> = {
  GK: { x: 50, y: 6 }, CB: { x: 50, y: 24 }, FB: { x: 15, y: 30 }, DM: { x: 50, y: 40 }, CM: { x: 28, y: 53 },
  AM: { x: 50, y: 66 }, LW: { x: 15, y: 77 }, RW: { x: 85, y: 77 }, ST: { x: 50, y: 88 },
};

type Ranked = { position: string | null; rank: number; name: string };

/** Shortlisted players by slot: ranked ones first (1, 2, ...), then unranked by name. Unknown positions are listed apart. */
export function shadowTeam<T extends Ranked>(players: T[]): { slots: Record<Slot, T[]>; unplaced: T[] } {
  const order = (a: T, b: T) => (a.rank || Infinity) - (b.rank || Infinity) || a.name.localeCompare(b.name);
  const slots = Object.fromEntries(SLOTS.map((s) => [s, [] as T[]])) as Record<Slot, T[]>;
  const unplaced: T[] = [];
  for (const p of [...players].sort(order)) (isSlot(p.position) ? slots[p.position] : unplaced).push(p);
  return { slots, unplaced };
}

export const CONTRACT_STATUS = { under_contract: "Under contract", free_agent: "Free agent", amateur: "Amateur", unknown: "Unknown" } as const;
export type ContractStatus = keyof typeof CONTRACT_STATUS;
const isContract = (v: string): v is ContractStatus => v in CONTRACT_STATUS;

export type Verification = {
  registration: string | null; idChecked: boolean; photoChecked: boolean; contract: ContractStatus; note: string;
  identity: { legalName: string; dateOfBirth: string } | null;
};

/** Reads the verification form. Identity is optional, but a legal name and a date of birth go together. */
export function parseVerification(form: { get(name: string): unknown }, today = new Date()):
  { ok: true; value: Verification } | { ok: false; error: string } {
  const text = (k: string) => { const v = form.get(k); return typeof v === "string" ? v.trim() : ""; };
  const contract = text("contract") || "unknown";
  if (!isContract(contract)) return { ok: false, error: "Choose a contract status from the list." };
  const legalName = text("legalName");
  const dob = text("dateOfBirth");
  if (Boolean(legalName) !== Boolean(dob)) return { ok: false, error: "Enter both the legal name and the date of birth, or neither." };
  if (dob && (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob)) || Date.parse(dob) > today.getTime()))
    return { ok: false, error: "Enter the date of birth as YYYY-MM-DD." };
  return {
    ok: true,
    value: {
      registration: text("registration") || null, idChecked: text("idChecked") === "on", photoChecked: text("photoChecked") === "on",
      contract, note: text("note"), identity: legalName ? { legalName, dateOfBirth: dob } : null,
    },
  };
}

/** The checks a profile needs before the database marks it verified (the verifications trigger). */
export const isVerified = (v: Pick<Verification, "registration" | "idChecked" | "photoChecked">) =>
  v.idChecked && v.photoChecked && Boolean(v.registration);

export const ID_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const ID_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export const ID_DOCUMENT_TYPES = Object.keys(ID_TYPES);

/** The stored file's extension for an uploaded ID document, or why it is refused. */
export function idDocumentExtension(file: { type: string; size: number }): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = ID_TYPES[file.type];
  if (!ext) return { ok: false, error: "Upload a PDF, JPEG or PNG." };
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > ID_DOCUMENT_MAX_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  return { ok: true, ext };
}
