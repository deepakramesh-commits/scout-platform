import { notFound } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { db, requireScouting } from "@/lib/auth";
import type { MarketInput } from "@/lib/market-form";
import { getEditRights } from "@/lib/scouting";
import { Demo } from "../../../ui";
import { verifyTest } from "./actions";
import { MarketForm, TestForm } from "./forms";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = MarketInput & { display_name: string; market_demo: boolean | null; demo_fields: string[] };
type Unverified = { id: string; label: string; value: number; unit: string; tested_at: string; is_demo: boolean };

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScouting();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const today = new Date().toISOString().slice(0, 10);

  const [[p], can, kinds, unverified] = await db((tx) => Promise.all([
    tx<Row[]>`
      select p.display_name, p.height_cm as "heightCm", p.preferred_foot as "preferredFoot", p.demo_fields,
             to_char(m.contract_end, 'YYYY-MM-DD') as "contractEnd", m.availability, m.transfer_conditions as "transferConditions",
             m.representative, m.is_demo as market_demo
      from players p left join player_market m on m.player_id = p.id
      where p.id = ${id} and p.visible_to_scouts`,
    getEditRights(tx, id),
    tx<{ value: string; label: string }[]>`select key as value, label from physical_test_kinds order by label`,
    tx<Unverified[]>`
      select t.id, k.label, t.value::float8 as value, t.unit, to_char(t.tested_at, 'DD Mon YYYY') as tested_at, t.is_demo
      from physical_tests t join physical_test_kinds k on k.key = t.test
      where t.player_id = ${id} and not t.verified order by t.tested_at desc`,
  ]));
  if (!p) notFound();

  const back = `/players/${id}?tab=market`;
  const initial: MarketInput = {
    heightCm: p.heightCm, preferredFoot: p.preferredFoot, contractEnd: p.contractEnd, availability: p.availability,
    transferConditions: p.transferConditions, representative: p.representative,
  };
  const demoNote = p.market_demo || p.demo_fields.some((f) => f === "height_cm" || f === "preferred_foot");

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <HStack><Button variant="ghost" size="sm" label={`Back to ${p.display_name}`} href={back} icon={<Icon icon="chevronLeft" />} /></HStack>
        <Heading level={1}>Market details and tests for {p.display_name}</Heading>
      </VStack>

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4} align="start">
        <Card>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={2}>Market details</Heading>
              {(can.market || can.player) && (
                <Text type="supporting">
                  {demoNote ? "Some of these values are demo data. Saving marks what you enter as real, so the Demo label goes. " : ""}
                  {!can.player && "Height and preferred foot are changed by the player, his academy or an admin. "}
                  {!can.market && "Contract and availability are changed by the player, his academy, his agent or an admin."}
                </Text>
              )}
            </VStack>
            {can.market || can.player
              ? <MarketForm playerId={id} initial={initial} canPlayer={can.player} canMarket={can.market} />
              : <EmptyState isCompact title="You cannot edit these details"
                  description="Market details are kept by the player, his academy, his agent and our admins, so every club reads the same facts." />}
          </VStack>
        </Card>

        <VStack gap={4}>
          <Card>
            <VStack gap={4}>
              <VStack gap={1}>
                <Heading level={2} id="tests">Add a physical test</Heading>
                {can.addTest && (
                  <Text type="supporting">
                    {can.verifyTest ? "You can mark a test verified." : "A test you add shows as not verified until an admin or the federation checks it."}
                  </Text>
                )}
              </VStack>
              {can.addTest
                ? <TestForm playerId={id} kinds={kinds} canVerify={can.verifyTest} today={today} />
                : <EmptyState isCompact title="You cannot add tests for this player"
                    description="Tests come from the player, his academy, the federation or our admins." />}
            </VStack>
          </Card>
          {can.verifyTest && (
            <Card>
              <VStack gap={3}>
                <Heading level={2}>Waiting for verification</Heading>
                {unverified.length === 0 && <Text type="supporting">Every test for this player is verified.</Text>}
                {unverified.map((t) => (
                  <form key={t.id} action={verifyTest}>
                    <input type="hidden" name="playerId" value={id} />
                    <input type="hidden" name="testId" value={t.id} />
                    <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                      <HStack gap={1} vAlign="center">
                        <Text>{t.label}: {t.value} {t.unit} · {t.tested_at}</Text>
                        {t.is_demo && <Demo />}
                      </HStack>
                      <Button type="submit" size="sm" label="Mark verified" />
                    </HStack>
                  </form>
                ))}
              </VStack>
            </Card>
          )}
        </VStack>
      </Grid>
    </VStack>
  );
}
