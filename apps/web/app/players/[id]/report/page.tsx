import { notFound } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe } from "@/lib/auth";
import { REPORT_ROLES } from "@/lib/report-form";
import { getAttributes, GROUP_ORDER, SOURCE_LABEL, type AttributeGroup } from "@/lib/scouting";
import { ReportForm, type RatingGroup, type ReportDraft } from "./report-form";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUP_TITLE: Record<AttributeGroup, [string, string]> = {
  technical: ["Technical", "What he does with the ball."],
  physical: ["Physical", "Tests measure speed and stamina best; rate what you saw."],
  tactical: ["Tactical", "Positions, decisions and movement, on and off the ball."],
  mental: ["Personal profile and mentality", "The eight qualities clubs ask about most and data cannot show. Rate only what you saw or heard."],
};

type Draft = Omit<ReportDraft, "id" | "seenIn"> & { id: string; seen_in: string };

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireMe(REPORT_ROLES);
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const reportId = typeof q.report === "string" ? q.report : null;
  if (!UUID.test(id) || (reportId && !UUID.test(reportId))) notFound();

  const [[player], attributes, [existing]] = await db((tx) => Promise.all([
    tx<{ display_name: string }[]>`select display_name from players where id = ${id} and visible_to_scouts`,
    getAttributes(tx),
    reportId
      ? tx<Draft[]>`
          select r.id, r.seen_in, r.recommendation, r.strengths, r.weaknesses, r.comments,
                 coalesce((select jsonb_object_agg(s.attribute, s.rating) from scout_ratings s where s.report_id = r.id), '{}') as ratings
          from scout_reports r where r.id = ${reportId} and r.player_id = ${id} and r.author_id = ${user.id}`
      : Promise.resolve([] as Draft[]),
  ]));
  if (!player || (reportId && !existing)) notFound();

  const back = `/players/${id}?tab=scout`;
  const header = (
    <VStack gap={2}>
      <HStack><Button variant="ghost" size="sm" label={`Back to ${player.display_name}`} href={back} icon={<Icon icon="chevronLeft" />} /></HStack>
      <Heading level={1}>{existing ? "Edit your report" : "Scout report"} on {player.display_name}</Heading>
    </VStack>
  );

  if (!user.org_id) {
    return (
      <VStack gap={6}>
        {header}
        <Card><EmptyState title="Your account has no organisation" description="Reports belong to a club or agency, and only its members read them. Ask an admin to add you to one." /></Card>
      </VStack>
    );
  }

  const groups: RatingGroup[] = GROUP_ORDER.map((g) => ({
    title: GROUP_TITLE[g][0], note: GROUP_TITLE[g][1],
    attributes: attributes.filter((a) => a.grp === g).map((a) => ({ key: a.key, label: a.label, source: `Usually from: ${SOURCE_LABEL[a.source].toLowerCase()}` })),
  }));
  const draft: ReportDraft = existing
    ? { ...existing, seenIn: existing.seen_in }
    : { id: null, seenIn: "", recommendation: "", strengths: "", weaknesses: "", comments: "", ratings: {} };

  return (
    <VStack gap={6}>
      {header}
      <Text color="secondary">
        Only members of {user.org_name ?? "your organisation"} can read this report. Your ratings count toward the fit scores your colleagues see.
      </Text>
      <ReportForm playerId={id} groups={groups} draft={draft} />
    </VStack>
  );
}
