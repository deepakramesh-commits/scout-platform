import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { smallGroupNote } from "@/lib/metrics";
import { PitchPlayer } from "./pitch-player";

// Team names as StatsBomb spells them. Player nationality is unreliable (dual nationals show as France/Spain), so flags follow the team.
const ISO: Record<string, string> = {
  Algeria: "DZ", Angola: "AO", "Burkina Faso": "BF", Cameroon: "CM", "Cape Verde Islands": "CV", "Congo DR": "CD",
  "Côte d'Ivoire": "CI", Egypt: "EG", "Equatorial Guinea": "GQ", Gambia: "GM", Ghana: "GH", Guinea: "GN",
  "Guinea-Bissau": "GW", Mali: "ML", Mauritania: "MR", Morocco: "MA", Mozambique: "MZ", Namibia: "NA",
  Nigeria: "NG", Senegal: "SN", "South Africa": "ZA", Tanzania: "TZ", Tunisia: "TN", Zambia: "ZM",
};

export const flag = (team: string | null) =>
  team && ISO[team] ? String.fromCodePoint(...[...ISO[team]].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "";

export const tier = (pct: number | null | undefined) =>
  pct == null ? "none" : pct >= 80 ? "elite" : pct >= 60 ? "good" : pct >= 40 ? "avg" : "low";

const BADGE = { elite: "green", good: "teal", avg: "yellow", low: "red", none: "neutral" } as const;

// No photo: a generic silhouette, never a stand-in face, so nobody is shown as a player they are not.
const SILHOUETTE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1f2632"/><circle cx="20" cy="15" r="7" fill="#6b7686"/><path d="M6 40c1-9 7-14 14-14s13 5 14 14z" fill="#6b7686"/></svg>',
)}`;

type Size = 40 | 48 | 72 | 96 | 144;

export function PlayerAvatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: Size }) {
  return <Avatar src={photo ?? SILHOUETTE} name={name} alt="" size={size} tooltip={false} />;
}

export function PctBadge({ pct }: { pct: number | null | undefined }) {
  return <Badge variant={BADGE[tier(pct)]} label={pct ?? "–"} />;
}

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

// `i` is the stagger slot; bars and counts with the same slot animate together.
// `lowerIsBetter`: the bar still measures the percentile, but its colour says how good that is.
export function PctBar({ pct, flip = false, i = 0, lowerIsBetter = false }: { pct: number | null | undefined; flip?: boolean; i?: number; lowerIsBetter?: boolean }) {
  return (
    <span className={`pbar${flip ? " flip" : ""}`}>
      <span className={tier(pct == null || !lowerIsBetter ? pct : 100 - pct)} style={{ transform: `scaleX(${(pct ?? 0) / 100})`, "--i": i } as Vars} />
    </span>
  );
}

export function Count({ value, i = 0, suffix }: { value: number | null | undefined; i?: number; suffix?: string }) {
  return value == null ? <>–</> : (
    <span className="count" data-suffix={suffix} style={{ "--v": value, "--i": i } as Vars} aria-label={`${value}${suffix ?? ""}`} />
  );
}

/** Next to any value that comes from demo data. Never present demo as real. */
export function Demo() {
  return <Token size="sm" label="Demo" color="orange" description="Demo value, not measured" />;
}

/** Standout qualities as attribute labels, with the small-group caveat when the ranking rests on few peers. */
export function Standouts({ keys, labels, peers, role }: { keys: string[]; labels: Record<string, string>; peers: number; role: string }) {
  if (!keys.length) return <Text type="supporting">–</Text>;
  const note = smallGroupNote(peers, role);
  return (
    <HStack gap={1} wrap="wrap" vAlign="center">
      {keys.map((k) => <Token key={k} size="sm" color="green" label={labels[k] ?? k} />)}
      {note && <Text type="supporting" size="xsm">{note}</Text>}
    </HStack>
  );
}

type Pt = { x: number; y: number; end_x?: number | null; end_y?: number | null; xg?: number | null };

const ms = (n: number) => `${Math.round(n)}ms`;

const LEGEND = [
  ["--c-cut", "Cut-ins"],
  ["--c-rec", "Ball recoveries"],
  ["--c-shot", "Shots, sized by xG"],
] as const;

// StatsBomb pitch: 120 x 80, attacking left to right, y grows downward, so the right wing is the bottom edge.
// Playback order: cut-ins draw, then shots pop, then recoveries fade. Stagger slots are capped so busy players stay short.
export function Pitch({ title, cutIns, recoveries, shots }: { title: React.ReactNode; cutIns: Pt[]; recoveries: Pt[]; shots: Pt[] }) {
  const line = { fill: "none", stroke: "var(--pitch-line)", strokeWidth: 0.4 };
  const cutAt = (i: number) => 150 + Math.min(i, 15) * 80;
  const shotsFrom = cutIns.length ? cutAt(cutIns.length - 1) + 450 : 150;
  const shotAt = (i: number) => shotsFrom + Math.min(i, 15) * 50;
  const recFrom = shots.length ? shotAt(shots.length - 1) + 250 : shotsFrom;
  const counts = [cutIns.length, recoveries.length, shots.length];
  return (
    <PitchPlayer title={title} label="pitch map">
      <svg viewBox="-2 -2 124 84" role="img" aria-label="Pitch map of cut-ins, ball recoveries and shots">
        <rect x="0" y="0" width="120" height="80" fill="var(--pitch)" />
        {[...Array(6)].map((_, i) => <rect key={i} x={i * 20} y="0" width="10" height="80" fill="var(--pitch-stripe)" />)}
        <rect x="0" y="0" width="120" height="80" {...line} />
        <line x1="60" y1="0" x2="60" y2="80" {...line} />
        <circle cx="60" cy="40" r="10" {...line} />
        <rect x="0" y="18" width="18" height="44" {...line} />
        <rect x="102" y="18" width="18" height="44" {...line} />
        <rect x="0" y="30" width="6" height="20" {...line} />
        <rect x="114" y="30" width="6" height="20" {...line} />
        {recoveries.map((p, i) => (
          <circle key={`r${i}`} className="mk mk-rec" cx={p.x} cy={p.y} r="0.9" fill="var(--c-rec)" opacity="0.75"
            style={{ "--d": ms(recFrom + Math.min(i, 30) * 12) } as Vars} />
        ))}
        {cutIns.map((p, i) => {
          const [ex, ey] = [p.end_x!, p.end_y!];
          const len = Math.hypot(ex - p.x, ey - p.y) || 1;
          const [ux, uy] = [(ex - p.x) / len, (ey - p.y) / len];
          const [bx, by] = [ex - ux * 2.2, ey - uy * 2.2];
          const head = `${ex},${ey} ${bx - uy * 1.1},${by + ux * 1.1} ${bx + uy * 1.1},${by - ux * 1.1}`;
          return (
            <g key={`c${i}`}>
              <line className="mk mk-cut" pathLength={1} x1={p.x} y1={p.y} x2={bx} y2={by} stroke="var(--c-cut)" strokeWidth="0.6"
                style={{ "--d": ms(cutAt(i)) } as Vars} />
              <polygon className="mk mk-head" points={head} fill="var(--c-cut)" style={{ "--d": ms(cutAt(i) + 400) } as Vars} />
            </g>
          );
        })}
        {shots.map((p, i) => (
          <circle key={`s${i}`} className="mk mk-shot" cx={p.x} cy={p.y} r={1 + Math.sqrt(p.xg ?? 0) * 4} fill="var(--c-shot)" fillOpacity="0.35"
            stroke="var(--c-shot)" strokeWidth="0.3" style={{ "--d": ms(shotAt(i)) } as Vars} />
        ))}
        <text x="118" y="-0.4" textAnchor="end" className="pitch-dir">Attacking →</text>
      </svg>
      <HStack as="figcaption" gap={3} wrap="wrap">
        {LEGEND.map(([c, name], i) => (
          <HStack key={c} gap={1} vAlign="center">
            <svg viewBox="0 0 10 10" className="dot" aria-hidden><circle cx="5" cy="5" r="5" fill={`var(${c})`} /></svg>
            <Text type="supporting">{name} ({counts[i]})</Text>
          </HStack>
        ))}
      </HStack>
    </PitchPlayer>
  );
}
