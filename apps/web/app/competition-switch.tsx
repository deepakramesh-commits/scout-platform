import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import type { PlayerCompetition } from "@/lib/competition";

/** Which competition's numbers the page shows. A player ranks within each competition separately, so the scout picks one. */
export function CompetitionSwitch({ current, competitions, href }: {
  current: string; competitions: PlayerCompetition[]; href: (competitionId: string) => string;
}) {
  const shown = competitions.find((c) => c.id === current);
  const others = competitions.filter((c) => c.id !== current);
  return (
    <HStack gap={2} wrap="wrap" vAlign="center">
      <Text type="supporting">Numbers from</Text>
      {shown && <Token color="green" label={`${shown.name} · ${shown.minutes} min`} />}
      {others.length > 0 && <Text type="supporting">· also played in</Text>}
      {others.map((c) => <Link key={c.id} href={href(c.id)}>{`${c.name} · ${c.minutes} min`}</Link>)}
    </HStack>
  );
}
