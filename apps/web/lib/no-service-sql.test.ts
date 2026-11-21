// Row-level security holds only if pages read through db(). This fails when anything else imports the superuser connection.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
// The only places that act without a user: sign-in and sign-up (Supabase's auth service) and video webhooks.
const ALLOWED = new Set(["lib/db.ts", "lib/auth.ts", "lib/no-service-sql.test.ts", "app/api/mux/webhook/route.ts"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (["node_modules", ".next"].includes(f)) return [];
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

test("only auth and webhooks use the superuser connection", () => {
  const offenders = [...files(join(ROOT, "app")), ...files(join(ROOT, "lib"))]
    .map((p) => relative(ROOT, p))
    .filter((p) => !ALLOWED.has(p) && /\bserviceSql\b|from "@\/lib\/db"|from "\.\/db"|from "\.\.\/db"/.test(readFileSync(join(ROOT, p), "utf8")));
  assert.deepEqual(offenders, []);
});
