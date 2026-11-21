import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { standouts } from "@/lib/fit";
import { smallGroupNote } from "@/lib/metrics";
import { SOURCE_LABEL, type Attribute } from "@/lib/scouting";
import { Count } from "../../ui";
import type { Player } from "./player";

/** His best attributes from match data (above the 85th percentile), as on the overview and in the report. */
export function StandoutQualities({ p, attrs, plural }: { p: Player; attrs: Map<string, Attribute>; plural: string }) {
  const best = standouts(p.attr_percentiles);
  const small = smallGroupNote(p.peers, p.role);
  return (
    <VStack gap={2}>
      <Heading level={2}>Standout qualities</Heading>
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={3}>
        {best.map((k) => {
          const a = attrs.get(k);
          return (
            <Card key={k} variant="muted" padding={3}>
              <VStack gap={0}>
                <Heading level={2}><Count value={p.attr_percentiles[k]} /></Heading>
                <Text weight="semibold">{a?.label ?? k}</Text>
                <Text type="supporting">Percentile among {plural} · {a ? SOURCE_LABEL[a.source] : ""}</Text>
              </VStack>
            </Card>
          );
        })}
        {best.length === 0 && (
          <Card variant="muted" padding={3}>
            <Text type="supporting">
              {Object.keys(p.attr_percentiles).length
                ? `No attribute above the 85th percentile among ${plural}.`
                : "Not enough minutes to rank yet."}
            </Text>
          </Card>
        )}
      </Grid>
      {best.length > 0 && small && <Text type="supporting">Treat these as indicative: {small}.</Text>}
    </VStack>
  );
}
