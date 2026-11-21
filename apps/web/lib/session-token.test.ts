import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_DAYS, signSession, verifySession } from "./session-token.ts";

const id = "6f1c2a8e-1d2b-4c3d-9e4f-5a6b7c8d9e0f";

test("a signed token verifies to its user", () => {
  assert.equal(verifySession(signSession(id, "s"), "s"), id);
});

test("a token signed with another secret, edited, or expired is rejected", () => {
  const t = signSession(id, "s");
  assert.equal(verifySession(t, "other"), null);
  assert.equal(verifySession(t.replace(id, "7f1c2a8e-1d2b-4c3d-9e4f-5a6b7c8d9e0f"), "s"), null);
  assert.equal(verifySession(t, "s", Date.now() + (SESSION_DAYS + 1) * 86400_000), null);
  for (const junk of [undefined, "", "a.b", "x.1.y", `${id}.notanumber.sig`]) assert.equal(verifySession(junk, "s"), null);
});
