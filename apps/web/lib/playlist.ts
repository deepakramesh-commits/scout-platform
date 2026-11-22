// A clip is the match video around one event; there is no clip table.
// Relative `.ts` imports only: node --test loads this.
import { SPEC_BY_TYPE } from "./event-spec.ts";
import { CLIP_AFTER, CLIP_BEFORE } from "./video.ts";

export type ClipWindow = { start: number; end: number };

export const clipWindow = (videoSeconds: number): ClipWindow =>
  ({ start: Math.max(0, videoSeconds - CLIP_BEFORE), end: videoSeconds + CLIP_AFTER });

/** The browser's player starts and stops at a media fragment, so a clip needs no script. */
export const clipSrc = (src: string, w: ClipWindow) => `${src}#t=${w.start},${w.end}`;

/** The playlist order after moving one item a place up or down; null when it is already at that end or not in the list. */
export function moved<T>(order: readonly T[], item: T, by: -1 | 1): T[] | null {
  const from = order.indexOf(item);
  const to = from + by;
  if (from < 0 || to < 0 || to >= order.length) return null;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** "Shot, saved": the spec's names, or the stored slug in words for types the loader keeps but the spec does not log. */
export function actionLabel(type: string, outcome: string | null): string {
  const spec = SPEC_BY_TYPE[type];
  const name = spec?.label ?? type.charAt(0).toUpperCase() + type.slice(1).replaceAll("_", " ");
  const result = outcome && (spec?.outcomes.find((o) => o.value === outcome)?.label.toLowerCase() ?? outcome.replaceAll("_", " "));
  return result ? `${name}, ${result}` : name;
}
