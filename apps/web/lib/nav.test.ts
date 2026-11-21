import assert from "node:assert/strict";
import { test } from "node:test";
import { NAV, navFor, SCOUTING_ROLES, selected } from "./nav.ts";
import { ACCOUNT_TYPES } from "./signup.ts";

test("every role a sign-up can create, and admin, has a navigation", () => {
  for (const { role } of [...Object.values(ACCOUNT_TYPES), { role: "admin" }]) assert.ok(navFor(role).length > 0, role);
});

test("scouting roles start on search; the others reach their account", () => {
  for (const role of SCOUTING_ROLES) assert.equal(navFor(role)[0].href, "/", role);
  for (const role of ["player", "guardian", "tagger", "coordinator"]) assert.deepEqual(navFor(role).map((i) => i.href), ["/account"], role);
});

test("staff tools stay with the roles that use them", () => {
  const hrefs = (role: string) => navFor(role).map((i) => i.href);
  assert.ok(hrefs("admin").includes("/admin/approvals") && hrefs("admin").includes("/admin/coverage"));
  for (const role of ["scout", "agent", "federation", "coach"]) assert.ok(!hrefs(role).some((h) => h.startsWith("/admin")), role);
  assert.ok(hrefs("federation").includes("/verify") && !hrefs("scout").includes("/verify"));
  assert.ok(hrefs("agent").includes("/agent") && !hrefs("scout").includes("/agent"));
});

test("no one signed in, or an unknown role, gets no items", () => {
  assert.deepEqual(navFor(null), []);
  assert.deepEqual(navFor("nobody"), []);
});

test("selected picks the item that owns the path", () => {
  const scout = NAV.scout;
  assert.equal(selected(scout, "/"), "/");
  assert.equal(selected(scout, "/players/abc"), "/");
  assert.equal(selected(scout, "/shortlists"), "/shortlists");
  assert.equal(selected(scout, "/shortlists/x"), "/shortlists");
  assert.equal(selected(scout, "/teams/t1"), "/competitions");
  assert.equal(selected(scout, "/competitions/c1"), "/competitions");
  assert.equal(selected(scout, "/searchesque"), null);
  assert.equal(selected(scout, "/account"), null);
  assert.equal(selected(NAV.admin, "/admin/coverage"), "/admin/coverage");
});
