import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { db, me } from "@/lib/auth";
import { UUID } from "@/lib/input";
import { idDocumentExtension } from "@/lib/workflow";

const idDir = () => join(resolve(process.env.STORAGE_DIR ?? join(process.cwd(), "../../storage")), "private", "ids");
const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const user = await me();
  if (!user?.active || !["admin", "federation"].includes(user.role)) return fail("Only admins and federations upload ID documents.", 403);
  const player = new URL(request.url).searchParams.get("player") ?? "";
  if (!UUID.test(player)) return fail("Unknown player.", 400);
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return fail("Choose a file.", 400);
  const checked = idDocumentExtension(file);
  if (!checked.ok) return fail(checked.error, 400);

  const name = `${player}-${Date.now()}.${checked.ext}`;
  const [previous] = await db((tx) => tx<{ path: string | null }[]>`
    with old as (select id_document_path as path from player_identity where player_id = ${player} for update)
    update player_identity set id_document_path = ${`private/ids/${name}`} where player_id = ${player} returning (select path from old)`);
  if (!previous) return fail("Save the legal name and date of birth first, then upload the document.", 409);
  await mkdir(idDir(), { recursive: true });
  await writeFile(join(idDir(), name), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
  if (previous.path) await unlink(join(idDir(), basename(previous.path))).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const user = await me();
  if (!user?.active || user.role !== "admin") return new NextResponse("Not found", { status: 404 });
  const player = new URL(request.url).searchParams.get("player") ?? "";
  if (!UUID.test(player)) return new NextResponse("Not found", { status: 404 });
  const [row] = await db((tx) => tx<{ path: string | null }[]>`select id_document_path as path from player_identity where player_id = ${player}`);
  if (!row?.path) return new NextResponse("Not found", { status: 404 });
  const name = basename(row.path);
  const bytes = await readFile(join(idDir(), name)).catch(() => null);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(bytes, {
    headers: {
      "content-type": TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
