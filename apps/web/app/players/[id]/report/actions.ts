"use server";

import { redirect } from "next/navigation";
import { db, requireMe } from "@/lib/auth";
import { parseReport, REPORT_ROLES, type ParsedReport } from "@/lib/report-form";

export type ReportState = { errors: Extract<ParsedReport, { ok: false }>["errors"] } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveReport(_: ReportState, form: FormData): Promise<ReportState> {
  const user = await requireMe(REPORT_ROLES);
  if (!user.org_id) return { errors: { content: "Your account belongs to no organisation, so it cannot own a report." } };
  const playerId = String(form.get("playerId") ?? "");
  const reportId = String(form.get("reportId") ?? "") || null;
  if (!UUID.test(playerId) || (reportId && !UUID.test(reportId))) return { errors: { content: "This report form is out of date. Reload the page." } };

  const attributes = await db((tx) => tx<{ key: string }[]>`select key from attributes`);
  const parsed = parseReport(form, new Set(attributes.map((a) => a.key)));
  if (!parsed.ok) return { errors: parsed.errors };
  const r = parsed.value;

  const id = await db(async (tx) => {
    const [row] = reportId
      ? await tx<{ id: string }[]>`
          update scout_reports set seen_in = ${r.seenIn}, recommendation = ${r.recommendation}, strengths = ${r.strengths},
                 weaknesses = ${r.weaknesses}, comments = ${r.comments}, updated_at = now()
          where id = ${reportId} and player_id = ${playerId} and author_id = ${user.id} returning id`
      : await tx<{ id: string }[]>`
          insert into scout_reports (player_id, org_id, author_id, seen_in, recommendation, strengths, weaknesses, comments)
          values (${playerId}, ${user.org_id}, ${user.id}, ${r.seenIn}, ${r.recommendation}, ${r.strengths}, ${r.weaknesses}, ${r.comments})
          returning id`;
    if (!row) return null;
    await tx`delete from scout_ratings where report_id = ${row.id}`;
    const rows = Object.entries(r.ratings).map(([attribute, rating]) => ({ report_id: row.id, attribute, rating }));
    if (rows.length) await tx`insert into scout_ratings ${tx(rows)}`;
    return row.id;
  });
  if (!id) return { errors: { content: "This report could not be saved: only its author can edit it." } };
  redirect(`/players/${playerId}?tab=scout#report-${id}`);
}
