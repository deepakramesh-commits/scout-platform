import { notFound } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/VStack";
import { requireScouting } from "@/lib/auth";
import { ProfilePicker } from "../../../../profile-picker";
import { UUID } from "../../player";
import { loadReport, ScoutingReport } from "../../report-doc";
import { createShareLink } from "./actions";
import { ReportTools } from "./tools";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireScouting();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const asked = typeof q.profile === "string" && UUID.test(q.profile) ? q.profile : null;
  const askedComp = typeof q.comp === "string" && UUID.test(q.comp) ? q.comp : null;
  if (!UUID.test(id)) notFound();
  const data = await loadReport(id, asked, user.id, askedComp);
  if (!data) notFound();
  const { profile, profiles, p } = data;
  const comp = p.role == null ? null : p.competition_id;

  return (
    <VStack gap={4}>
      <HStack className="no-print">
        <Button variant="ghost" size="sm" label="Back to profile" href={comp ? `/players/${id}?comp=${comp}` : `/players/${id}`} icon={<Icon icon="chevronLeft" />} />
      </HStack>
      <ScoutingReport
        data={data}
        tools={
          <ReportTools share={createShareLink.bind(null, id, profile?.id ?? null, comp)}>
            {profile && (
              <ProfilePicker key={profile.id} action={`/players/${id}/report/print`} name="profile" value={profile.id} label="Fit against" keep={{ comp }}
                options={profiles.map((r) => ({ value: r.id, label: r.name, description: r.club ?? undefined }))} />
            )}
          </ReportTools>
        }
        footnote={`Produced in Scout for ${user.org_name ?? "your organisation"}. Scout ratings are visible only to its members; a value marked Demo is demo data, not measured.`}
      />
    </VStack>
  );
}
