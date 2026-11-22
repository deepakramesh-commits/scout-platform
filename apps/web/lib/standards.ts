// The written standards, read from docs/ so the app and the repository never disagree.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const STANDARDS = [
  { slug: "filming", title: "Filming", summary: "How a club films a match so it can be logged." },
  { slug: "match-sheet", title: "Match sheet", summary: "Who played, where and for how long, filled in by the club coordinator." },
  { slug: "event-definitions", title: "Event definitions", summary: "Every event type, its key, outcomes and flags, from the event spec." },
  { slug: "quality-check", title: "Quality check", summary: "Rule flags and the second analyst, before a match publishes." },
  { slug: "verification", title: "Verification", summary: "How a player's identity, age and registration are checked." },
] as const;

export const REFERENCE = [{ slug: "import-csv", title: "Event import CSV layout", summary: "The columns another tagging tool's export maps into." }] as const;

const docs = () => resolve(process.env.DOCS_DIR ?? join(process.cwd(), "../../docs"));

export async function readStandard(slug: string): Promise<{ title: string; markdown: string } | null> {
  const s = STANDARDS.find((x) => x.slug === slug);
  const r = REFERENCE.find((x) => x.slug === slug);
  if (!s && !r) return null;
  const file = s ? join(docs(), "standards", `${slug}.md`) : join(docs(), `${slug}.md`);
  const markdown = await readFile(file, "utf8").catch(() => null);
  return markdown == null ? null : { title: (s ?? r)!.title, markdown };
}
