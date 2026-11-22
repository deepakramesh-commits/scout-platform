import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { db } from "@/lib/auth";
import { apiUser, exportDir, json, STAFF } from "@/lib/engine";

export async function GET(_: Request, { params }: { params: Promise<{ match: string; path: string[] }> }) {
  const user = await apiUser(STAFF);
  if (user instanceof Response) return user;
  const { match, path } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(match)) return json({ error: "No such match." }, 404);
  const [seen] = await db((tx) => tx`select 1 from matches where id = ${match}`);
  if (!seen) return json({ error: "No such match." }, 404);
  const root = exportDir(match);
  const file = resolve(root, ...path);
  if (!file.startsWith(root + sep) || !file.endsWith(".json")) return json({ error: "No such file." }, 404);
  const body = await readFile(file).catch(() => null);
  if (!body) return json({ error: "Not exported yet." }, 404);
  return new Response(body, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${path.join("_")}"` },
  });
}
