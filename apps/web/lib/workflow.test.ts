import assert from "node:assert/strict";
import { test } from "node:test";
import { idDocumentExtension, isVerified, parseVerification, shadowTeam } from "./workflow.ts";

const p = (name: string, position: string | null, rank = 0) => ({ name, position, rank });

test("shadow team ranks each slot: ranked players first, then unranked by name", () => {
  const { slots, unplaced } = shadowTeam([p("Zola", "ST"), p("Abel", "ST"), p("Mané", "ST", 2), p("Salah", "ST", 1), p("Onana", "GK"), p("Ghost", null), p("Odd", "SW")]);
  assert.deepEqual(slots.ST.map((x) => x.name), ["Salah", "Mané", "Abel", "Zola"]);
  assert.deepEqual(slots.GK.map((x) => x.name), ["Onana"]);
  assert.deepEqual(slots.CB, []);
  assert.deepEqual(unplaced.map((x) => x.name), ["Ghost", "Odd"]);
});

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

test("verification reads checks, contract and optional identity", () => {
  const r = parseVerification(form({ registration: " GFA-123 ", idChecked: "on", photoChecked: "on", contract: "free_agent", legalName: "Kofi Mensah", dateOfBirth: "2007-03-01" }));
  assert.ok(r.ok);
  assert.deepEqual(r.value, { registration: "GFA-123", idChecked: true, photoChecked: true, contract: "free_agent", note: "", identity: { legalName: "Kofi Mensah", dateOfBirth: "2007-03-01" } });
  assert.equal(isVerified(r.value), true);
  const bare = parseVerification(form({}));
  assert.ok(bare.ok);
  assert.equal(bare.value.contract, "unknown");
  assert.equal(bare.value.identity, null);
  assert.equal(isVerified(bare.value), false);
});

test("verification refuses half an identity, a future birth date and an unknown contract", () => {
  const today = new Date("2026-11-21T00:00:00Z");
  assert.deepEqual(parseVerification(form({ legalName: "Kofi" }), today), { ok: false, error: "Enter both the legal name and the date of birth, or neither." });
  assert.equal(parseVerification(form({ legalName: "Kofi", dateOfBirth: "2030-01-01" }), today).ok, false);
  assert.equal(parseVerification(form({ contract: "loan" }), today).ok, false);
});

test("ID documents: PDF, JPEG or PNG up to 5 MB", () => {
  assert.deepEqual(idDocumentExtension({ type: "application/pdf", size: 1000 }), { ok: true, ext: "pdf" });
  assert.deepEqual(idDocumentExtension({ type: "image/png", size: 5 * 1024 * 1024 }), { ok: true, ext: "png" });
  assert.equal(idDocumentExtension({ type: "image/png", size: 5 * 1024 * 1024 + 1 }).ok, false);
  assert.equal(idDocumentExtension({ type: "text/html", size: 10 }).ok, false);
  assert.equal(idDocumentExtension({ type: "image/jpeg", size: 0 }).ok, false);
});
