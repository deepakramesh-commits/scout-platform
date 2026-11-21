import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_TYPES, ageOn, planSignup } from "./signup.ts";

const today = new Date("2026-11-21T12:00:00Z");
const base = { name: "Sara Lind", email: "sara@club.se", password: "long-enough-1", org: "Öresund FC" };

test("every user type in the brief can sign up", () => {
  assert.equal(Object.keys(ACCOUNT_TYPES).length, 8);
  for (const type of ["scout", "agent", "federation", "coach", "coordinator", "analyst"]) {
    const r = planSignup({ ...base, type }, today);
    assert.ok(r.ok, type);
  }
});

test("an analyst account waits for an admin; others are active", () => {
  const a = planSignup({ ...base, type: "analyst" }, today);
  const s = planSignup({ ...base, type: "scout" }, today);
  assert.ok(a.ok && s.ok);
  assert.equal(a.plan.active, false);
  assert.equal(s.plan.active, true);
});

test("an adult player goes live on consent; under 18 needs a guardian and waits", () => {
  const adult = planSignup({ ...base, type: "player", dateOfBirth: "2007-11-20", consent: true }, today);
  assert.ok(adult.ok && adult.plan.player && !adult.plan.player.underEighteen);
  const minor = planSignup({ ...base, type: "player", dateOfBirth: "2008-11-22", consent: true }, today);
  assert.ok(!minor.ok);
  assert.deepEqual(Object.keys(minor.errors).sort(), ["guardianContact", "guardianName"]);
  const withGuardian = planSignup({ ...base, type: "player", dateOfBirth: "2008-11-22", consent: true, guardianName: "Ama", guardianContact: "+233" }, today);
  assert.ok(withGuardian.ok && withGuardian.plan.player!.underEighteen);
});

test("a guardian signs up a child under 18, never an adult", () => {
  const ok = planSignup({ ...base, type: "guardian", playerName: "Yaw", dateOfBirth: "2010-03-14", guardianContact: "+233", consent: true }, today);
  assert.ok(ok.ok && ok.plan.player!.underEighteen);
  const adult = planSignup({ ...base, type: "guardian", playerName: "Yaw", dateOfBirth: "2000-03-14", guardianContact: "+233", consent: true }, today);
  assert.ok(!adult.ok && adult.errors.dateOfBirth);
});

test("consent, email, password and organisation are checked", () => {
  const r = planSignup({ type: "player", name: "K", email: "nope", password: "short", dateOfBirth: "2000-01-01" }, today);
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.errors).sort(), ["consent", "email", "name", "password"]);
  const noOrg = planSignup({ ...base, org: "", type: "scout" }, today);
  assert.ok(!noOrg.ok && noOrg.errors.org);
});

test("age counts the birthday", () => {
  assert.equal(ageOn("2008-11-21", today), 18);
  assert.equal(ageOn("2008-11-22", today), 17);
});
