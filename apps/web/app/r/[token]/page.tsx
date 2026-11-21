import type { Metadata } from "next";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { db } from "@/lib/auth";
import { isShareToken } from "@/lib/report";
import { loadReport, ScoutingReport } from "../../players/[id]/report-doc";
import { ReportTools } from "../../players/[id]/report/print/tools";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Scouting report · Scout", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Link = { player_id: string; profile_id: string | null; created_by: string };

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link] = isShareToken(token)
    ? await db((tx) => tx<Link[]>`select player_id, profile_id, created_by from app.shared_report(${token})`, null)
    : [];
  const data = link ? await loadReport(link.player_id, link.profile_id, link.created_by) : null;
  if (!data) {
    return (
      <Card>
        <EmptyState title="This link has expired or the profile is no longer shared"
          description="Ask the person who sent it for a new link." />
      </Card>
    );
  }
  return (
    <ScoutingReport data={data} tools={<ReportTools />}
      footnote={`Shared read-only from Scout by ${data.author?.name ?? "a scout"}${data.author?.org ? ` of ${data.author.org}` : ""}. Scout ratings are that organisation's; a value marked Demo is demo data, not measured.`} />
  );
}
