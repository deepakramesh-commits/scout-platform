import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";

// Scout ratings and match percentiles disagree "explicitly" from this many points apart on the 0-100 scale.
export const DISAGREE_GAP = 25;

// 1..10 (or 0..100) onto 3%..97% of the track, so end markers are not clipped.
const at = (v: number, lo: number, hi: number) => `${3 + ((v - lo) / (hi - lo)) * 94}%`;

export type MentalRow = { key: string; label: string; avg: number | null; ratings: { value: number; who: string }[] };

/** One row per mental quality: a dot per report on a 1-10 track, the average as the larger blue mark. */
export function MentalityChart({ rows }: { rows: MentalRow[] }) {
  return (
    <VStack gap={2}>
      <HStack gap={4} wrap="wrap" vAlign="center">
        <Legend mark="report" label="One scout's rating" />
        <Legend mark="avg" label="Average of the reports" />
        <Text type="supporting">Scale 1 (poor) to 10 (outstanding)</Text>
      </HStack>
      {rows.map((r) => (
        <Grid key={r.key} className="drow" gap={2}>
          <Text maxLines={1}>{r.label}</Text>
          <svg className="track" role="img" aria-label={r.avg == null ? `${r.label}: not rated` : `${r.label}: average ${r.avg.toFixed(1)} from ${r.ratings.length} ratings`}>
            <line x1="3%" x2="97%" y1="50%" y2="50%" className="track-line" />
            {[1, 5.5, 10].map((t) => <line key={t} x1={at(t, 1, 10)} x2={at(t, 1, 10)} y1="30%" y2="70%" className="track-tick" />)}
            {r.ratings.map((x, i) => (
              <circle key={i} cx={at(x.value, 1, 10)} cy="50%" r="4" className="mk-report"><title>{`${x.who}: ${x.value}`}</title></circle>
            ))}
            {r.avg != null && <circle cx={at(r.avg, 1, 10)} cy="50%" r="7" className="mk-avg"><title>{`Average ${r.avg.toFixed(1)}`}</title></circle>}
          </svg>
          <Text weight="bold" display="block" justify="end" hasTabularNumbers>{r.avg == null ? "–" : r.avg.toFixed(1)}</Text>
        </Grid>
      ))}
    </VStack>
  );
}

export type EyeRow = { key: string; label: string; match: number; scout: number; demo: boolean };

/** Match percentile (blue circle) beside the scouts' average x 10 (orange diamond); a gap of 25+ is named in words. */
export function NumbersBesideEye({ rows }: { rows: EyeRow[] }) {
  return (
    <VStack gap={3}>
      <HStack gap={4} wrap="wrap">
        <Legend mark="match" label="Match data percentile" />
        <Legend mark="scout" label="Scouts' average × 10" />
      </HStack>
      {rows.map((r) => {
        const gap = r.scout - r.match;
        const split = Math.abs(gap) >= DISAGREE_GAP;
        const [mx, sx] = [at(r.match, 0, 100), at(r.scout, 0, 100)];
        return (
          <VStack key={r.key} gap={0}>
            <Grid className="drow" gap={2}>
              <Text maxLines={1}>{r.label}</Text>
              <svg className="track" role="img" aria-label={`${r.label}: match data ${r.match}, scouts ${r.scout}`}>
                <line x1="3%" x2="97%" y1="50%" y2="50%" className="track-line" />
                <line x1={mx} x2={sx} y1="50%" y2="50%" className="track-gap" />
                <circle cx={mx} cy="50%" r="6" className="mk-match"><title>{`Match data: ${r.match}`}</title></circle>
                <svg x={sx} y="50%" overflow="visible"><rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" className="mk-scout"><title>{`Scouts: ${r.scout}`}</title></rect></svg>
              </svg>
              <Text type="supporting" display="block" justify="end" hasTabularNumbers>{r.match} · {r.scout}</Text>
            </Grid>
            {split && (
              <HStack gap={1} wrap="wrap" vAlign="center">
                <Token size="sm" color="orange" label={`They disagree by ${Math.abs(gap)}`} />
                <Text type="supporting">
                  {gap > 0 ? "Scouts rate him higher than the match data shows." : "The match data rates him higher than the scouts do."}
                  {r.demo ? " Some ratings are demo." : ""}
                </Text>
              </HStack>
            )}
          </VStack>
        );
      })}
    </VStack>
  );
}

function Legend({ mark, label }: { mark: "report" | "avg" | "match" | "scout"; label: string }) {
  return (
    <HStack gap={1} vAlign="center">
      <svg viewBox="-8 -8 16 16" className="legend-mk" aria-hidden>
        {mark === "scout" ? <rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" className="mk-scout" />
          : <circle r={mark === "report" ? 4 : 7} className={`mk-${mark}`} />}
      </svg>
      <Text type="supporting">{label}</Text>
    </HStack>
  );
}
