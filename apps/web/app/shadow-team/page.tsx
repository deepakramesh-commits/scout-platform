import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireMe, type Q } from "@/lib/auth";
import { ROLE_NAMES } from "@/lib/metrics";
import { shadowTeam, SLOT_XY, SLOTS, type Slot } from "@/lib/workflow";
import { PageHead, PlayerCell } from "../page-kit";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; position: string | null; rank: number; id_verified: boolean; is_demo: boolean; note: string | null };

export default async function ShadowTeam({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  await requireMe(["scout", "agent", "admin"]);
  const { list } = await searchParams;
  return db((tx) => ShadowTeamPage(tx, list));
}

async function ShadowTeamPage(tx: Q, wanted: string | undefined) {
  const lists = await tx<{ id: string; name: string }[]>`select id, name from shortlists order by created_at`;
  const current = lists.find((l) => l.id === wanted) ?? lists[0];
  const rows = current
    ? await tx<Row[]>`
        select p.id, p.display_name as name, p.primary_position as position, sp.rank, p.id_verified, p.is_demo, sp.note
        from shortlist_players sp join players p on p.id = sp.player_id where sp.shortlist_id = ${current.id}`
    : [];
  const { slots, unplaced } = shadowTeam(rows);

  return (
    <VStack gap={6}>
      <PageHead title="Shadow team" intro="Your shortlist on the pitch: in each position, the players you have ranked, best first. Set ranks on the shortlist." />
      {!current ? (
        <Card><EmptyState title="No shortlist to lay out" description="Create a shortlist and add players; they appear here by position." actions={<Button variant="primary" label="Go to shortlists" href="/shortlists" />} /></Card>
      ) : (
        <>
          <HStack gap={3} wrap="wrap" vAlign="center">
            <Text type="supporting">Shortlist</Text>
            {lists.map((l) => l.id === current.id
              ? <Text key={l.id} weight="semibold">{l.name}</Text>
              : <Link key={l.id} href={`/shadow-team?list=${l.id}`}>{l.name}</Link>)}
            <Button size="sm" variant="ghost" label="Edit ranks and notes" href={`/shortlists?list=${current.id}`} />
          </HStack>
          {rows.length === 0 ? (
            <Card><EmptyState title="This shortlist is empty" description="Add players to it; they appear here by position." actions={<Button label="Open shortlist" href={`/shortlists?list=${current.id}`} />} /></Card>
          ) : (
            <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4} align="start">
              <Card>
                <ShadowPitch slots={slots} />
              </Card>
              <Card>
                <VStack gap={4}>
                  {SLOTS.map((s) => (
                    <VStack key={s} gap={1}>
                      <Heading level={4}>{s} · {ROLE_NAMES[s]}</Heading>
                      {slots[s].length === 0
                        ? <Text type="supporting">Nobody shortlisted here yet.</Text>
                        : slots[s].map((p, i) => (
                            <HStack key={p.id} gap={2} vAlign="start">
                              <Text hasTabularNumbers weight="semibold">{i + 1}.</Text>
                              <VStack gap={0}>
                                <PlayerCell p={{ id: p.id, display_name: p.name, id_verified: p.id_verified, is_demo: p.is_demo }} />
                                {p.note && <Text type="supporting" maxLines={2}>{p.note}</Text>}
                              </VStack>
                            </HStack>
                          ))}
                    </VStack>
                  ))}
                  {unplaced.length > 0 && (
                    <VStack gap={1}>
                      <Heading level={4}>Position not recorded</Heading>
                      {unplaced.map((p) => <PlayerCell key={p.id} p={{ id: p.id, display_name: p.name, id_verified: p.id_verified, is_demo: p.is_demo }} />)}
                    </VStack>
                  )}
                </VStack>
              </Card>
            </Grid>
          )}
        </>
      )}
    </VStack>
  );
}

const surname = (name: string) => {
  const last = name.replace(/\s*\(demo\)$/, "").split(" ").at(-1) ?? name;
  return last.length > 12 ? `${last.slice(0, 11)}…` : last;
};

function ShadowPitch({ slots }: { slots: Record<Slot, { id: string; name: string; id_verified: boolean }[]> }) {
  const line = { fill: "none", stroke: "var(--pitch-line)", strokeWidth: 0.4 };
  const filled = SLOTS.filter((s) => slots[s].length).length;
  return (
    <svg viewBox="-2 -2 72 109" role="img" aria-label={`Shadow team: ${filled} of ${SLOTS.length} positions filled`} style={{ width: "100%", display: "block" }}>
      <rect x="0" y="0" width="68" height="105" fill="var(--pitch)" />
      {[...Array(7)].map((_, i) => <rect key={i} x="0" y={i * 15} width="68" height="7.5" fill="var(--pitch-stripe)" />)}
      <rect x="0" y="0" width="68" height="105" {...line} />
      <line x1="0" y1="52.5" x2="68" y2="52.5" {...line} />
      <circle cx="34" cy="52.5" r="9.15" {...line} />
      <rect x="13.85" y="0" width="40.3" height="16.5" {...line} />
      <rect x="13.85" y="88.5" width="40.3" height="16.5" {...line} />
      <rect x="24.85" y="0" width="18.3" height="5.5" {...line} />
      <rect x="24.85" y="99.5" width="18.3" height="5.5" {...line} />
      {SLOTS.map((s) => {
        const cx = (SLOT_XY[s].x / 100) * 68;
        const cy = 105 - (SLOT_XY[s].y / 100) * 105;
        const [top, ...rest] = slots[s];
        return (
          <g key={s}>
            <circle cx={cx} cy={cy} r="3.6" fill={top?.id_verified ? "var(--color-icon-green)" : "none"} stroke={top?.id_verified ? "none" : top ? "var(--color-text-primary)" : "var(--pitch-line)"} strokeWidth={top ? "0.6" : "0.4"} strokeDasharray={top?.id_verified ? undefined : "1 1"} />
            <text x={cx} y={cy + 1} textAnchor="middle" fontSize="2.6" fontWeight="700" fill={top?.id_verified ? "var(--pitch)" : "var(--color-text-primary)"}>{s}</text>
            <text x={cx} y={cy + 7} textAnchor="middle" fontSize="2.8" fill={top ? "var(--color-text-primary)" : "var(--pitch-line)"}>{top ? `${surname(top.name)}${top.id_verified ? "" : " ?"}` : "open"}</text>
            {rest.length > 0 && <text x={cx} y={cy + 9.8} textAnchor="middle" fontSize="2.2" fill="var(--pitch-line)">+{rest.length} more</text>}
          </g>
        );
      })}
    </svg>
  );
}
