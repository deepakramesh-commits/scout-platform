// The event spec: every type an analyst logs, its outcomes, location fields, extra fields and keyboard key.
// One source for the event log tool, the import validator, the quality check and the event-definitions page.
// Outcome values are the stored slugs, which worker/export_statsbomb.py maps to StatsBomb names and ids.
// Pure: no imports, so `node --test` runs it.

export type Choice = { value: string; label: string };
export type Flag = { key: string; label: string; definition: string };
export type EventType = {
  type: string;
  label: string;
  key: string;
  statsbomb: string;
  /** Empty when the type has no outcome. The first is the default. */
  outcomes: Choice[];
  /** Where the action ends: required for passes and carries. */
  end: "required" | "none";
  bodyPart: boolean;
  flags: Flag[];
  /** Extra fixed choices stored in `extra`, e.g. the goalkeeper action or a card. */
  choices?: { key: string; label: string; options: Choice[] }[];
  onBall: boolean;
  definition: string;
};

const c = (value: string, label: string): Choice => ({ value, label });
const UNDER_PRESSURE: Flag = { key: "under_pressure", label: "Under pressure", definition: "An opponent was close enough to affect the action." };

export const BODY_PARTS: Choice[] = [c("Right Foot", "Right foot"), c("Left Foot", "Left foot"), c("Head", "Head"), c("Other", "Other")];
export const SET_PIECES: Choice[] = [
  c("corner", "Corner"), c("free_kick", "Free kick"), c("throw_in", "Throw-in"), c("goal_kick", "Goal kick"),
  c("kick_off", "Kick-off"), c("penalty", "Penalty"),
];

export const EVENT_SPEC: EventType[] = [
  {
    type: "pass", label: "Pass", key: "p", statsbomb: "Pass", end: "required", bodyPart: true, onBall: true,
    outcomes: [c("complete", "Complete"), c("incomplete", "Incomplete"), c("out", "Out of play")],
    flags: [
      UNDER_PRESSURE,
      { key: "cross", label: "Cross", definition: "Played from a wide area into the box." },
      { key: "through_ball", label: "Through ball", definition: "Played into space behind the defensive line." },
      { key: "shot_assist", label: "Key pass", definition: "The receiver's next action is a shot." },
      { key: "goal_assist", label: "Assist", definition: "The receiver's next action is a goal." },
    ],
    choices: [{ key: "set_piece", label: "Set piece", options: SET_PIECES.filter((s) => s.value !== "penalty") }],
    definition: "The player intentionally moves the ball to a team-mate with any part of the body except the arms. Complete when a team-mate receives it.",
  },
  {
    type: "carry", label: "Carry", key: "c", statsbomb: "Carry", end: "required", bodyPart: false, onBall: true, outcomes: [],
    flags: [UNDER_PRESSURE],
    definition: "The player moves with the ball at his feet, from where he received it to where he next plays it. Log only carries of 3 m or more.",
  },
  {
    type: "shot", label: "Shot", key: "s", statsbomb: "Shot", end: "none", bodyPart: true, onBall: true,
    outcomes: [c("off_t", "Off target"), c("saved", "Saved"), c("blocked", "Blocked"), c("goal", "Goal"), c("post", "Hit the woodwork")],
    flags: [UNDER_PRESSURE, { key: "first_time", label: "First time", definition: "Struck without a controlling touch first." }],
    choices: [{ key: "set_piece", label: "Set piece", options: SET_PIECES.filter((s) => ["penalty", "free_kick", "corner", "kick_off"].includes(s.value)) }],
    definition: "An attempt to score with any legal part of the body. Location is where the ball was struck.",
  },
  {
    type: "dribble", label: "Dribble", key: "d", statsbomb: "Dribble", end: "none", bodyPart: false, onBall: true,
    outcomes: [c("complete", "Beat the man"), c("incomplete", "Lost it")],
    flags: [UNDER_PRESSURE],
    definition: "The player tries to get past an opponent with the ball. Complete when he keeps the ball after passing him.",
  },
  {
    type: "duel", label: "Aerial duel", key: "a", statsbomb: "Duel", end: "none", bodyPart: false, onBall: false,
    outcomes: [c("won", "Won"), c("lost", "Lost")],
    flags: [],
    definition: "Two players contest a ball in the air. Log one event for each player, won or lost.",
  },
  {
    type: "tackle", label: "Tackle", key: "t", statsbomb: "Duel", end: "none", bodyPart: false, onBall: false,
    outcomes: [c("won", "Won the ball"), c("lost_in_play", "Missed")],
    flags: [],
    definition: "The player challenges the ball carrier on the ground. Won when he takes the ball or knocks it away.",
  },
  {
    type: "ball_recovery", label: "Ball recovery", key: "r", statsbomb: "Ball Recovery", end: "none", bodyPart: false, onBall: true,
    outcomes: [], flags: [UNDER_PRESSURE],
    definition: "The player wins a loose ball that neither team controlled.",
  },
  {
    type: "interception", label: "Interception", key: "i", statsbomb: "Interception", end: "none", bodyPart: false, onBall: true,
    outcomes: [c("won", "Kept it"), c("lost_in_play", "Lost it")],
    flags: [],
    definition: "The player reads an opponent's pass and cuts it out.",
  },
  {
    type: "clearance", label: "Clearance", key: "l", statsbomb: "Clearance", end: "none", bodyPart: true, onBall: true,
    outcomes: [], flags: [UNDER_PRESSURE, { key: "aerial_won", label: "Won in the air", definition: "Cleared with a header that beat an opponent." }],
    definition: "The player kicks or heads the ball away from danger without aiming at a team-mate.",
  },
  {
    type: "block", label: "Block", key: "k", statsbomb: "Block", end: "none", bodyPart: false, onBall: false, outcomes: [], flags: [],
    definition: "The player stands in the path of a shot or pass and stops it.",
  },
  {
    type: "pressure", label: "Pressure", key: "x", statsbomb: "Pressure", end: "none", bodyPart: false, onBall: false, outcomes: [], flags: [],
    definition: "The player closes down the ball carrier, receiver or a ball about to be received, within about 5 m.",
  },
  {
    type: "ball_receipt", label: "Ball receipt", key: "e", statsbomb: "Ball Receipt*", end: "none", bodyPart: false, onBall: true,
    outcomes: [c("complete", "Controlled"), c("incomplete", "Not controlled")],
    flags: [UNDER_PRESSURE, { key: "through_ball", label: "From a through ball", definition: "The pass received was a through ball." }],
    definition: "The player receives a pass. Controlled when he takes the ball, whatever happens next.",
  },
  {
    type: "miscontrol", label: "Miscontrol", key: "m", statsbomb: "Miscontrol", end: "none", bodyPart: false, onBall: true, outcomes: [],
    flags: [UNDER_PRESSURE],
    definition: "A heavy or poor touch loses the ball.",
  },
  {
    type: "dispossessed", label: "Dispossessed", key: "o", statsbomb: "Dispossessed", end: "none", bodyPart: false, onBall: true, outcomes: [],
    flags: [UNDER_PRESSURE],
    definition: "The ball carrier loses the ball to a tackle without trying to dribble past the opponent.",
  },
  {
    type: "dribbled_past", label: "Dribbled past", key: "b", statsbomb: "Dribbled Past", end: "none", bodyPart: false, onBall: false, outcomes: [],
    flags: [],
    definition: "The player is beaten by an opponent's dribble.",
  },
  {
    type: "foul_committed", label: "Foul committed", key: "f", statsbomb: "Foul Committed", end: "none", bodyPart: false, onBall: false,
    outcomes: [], flags: [],
    choices: [{ key: "card", label: "Card", options: [c("yellow_card", "Yellow"), c("second_yellow", "Second yellow"), c("red_card", "Red")] }],
    definition: "The referee gives a free kick or penalty against the player.",
  },
  {
    type: "foul_won", label: "Foul won", key: "w", statsbomb: "Foul Won", end: "none", bodyPart: false, onBall: false, outcomes: [], flags: [],
    definition: "The referee gives a free kick or penalty for a foul on the player.",
  },
  {
    type: "goalkeeper", label: "Goalkeeper action", key: "g", statsbomb: "Goal Keeper", end: "none", bodyPart: false, onBall: false,
    outcomes: [c("success", "Success"), c("in_play_safe", "Safe"), c("in_play_danger", "Danger"), c("claim", "Claimed"), c("fail", "Failed")],
    flags: [],
    choices: [{ key: "gk_type", label: "Action", options: [
      c("shot_saved", "Save"), c("collected", "Cross claimed"), c("punch", "Punch"), c("keeper_sweeper", "Sweeper"), c("goal_conceded", "Goal conceded"),
    ] }],
    definition: "A save, a claimed cross, a punch, or the keeper leaving his line to deal with the ball. Distribution is logged as a pass.",
  },
];

export const SPEC_BY_TYPE: Record<string, EventType> = Object.fromEntries(EVENT_SPEC.map((e) => [e.type, e]));
export const SPEC_BY_KEY: Record<string, EventType> = Object.fromEntries(EVENT_SPEC.map((e) => [e.key, e]));

export type LoggedEvent = {
  type: string;
  outcome: string | null;
  x: number | null;
  y: number | null;
  end_x: number | null;
  end_y: number | null;
  body_part: string | null;
  extra: Record<string, unknown>;
};

/** Problems with one event against the spec; empty means it can be saved. Coordinates are the 120 x 80 pitch. */
export function checkEvent(e: LoggedEvent): string[] {
  const spec = SPEC_BY_TYPE[e.type];
  if (!spec) return [`unknown event type "${e.type}"`];
  const errors: string[] = [];
  const onPitch = (x: number | null, y: number | null) => x != null && y != null && x >= 0 && x <= 120 && y >= 0 && y <= 80;
  if (!onPitch(e.x, e.y)) errors.push("location must be on the pitch (x 0 to 120, y 0 to 80)");
  if (spec.end === "required" && !onPitch(e.end_x, e.end_y)) errors.push(`${spec.label.toLowerCase()} needs an end location on the pitch`);
  if (spec.outcomes.length && !spec.outcomes.some((o) => o.value === e.outcome)) {
    errors.push(`outcome must be one of ${spec.outcomes.map((o) => o.value).join(", ")}`);
  }
  if (!spec.outcomes.length && e.outcome != null) errors.push(`${spec.label.toLowerCase()} has no outcome`);
  if (e.body_part != null && !(spec.bodyPart && BODY_PARTS.some((b) => b.value === e.body_part))) errors.push("body part not allowed here");
  const allowed = new Set([...spec.flags.map((f) => f.key), ...(spec.choices ?? []).map((ch) => ch.key), "aerial_won", "duel_type"]);
  for (const [k, v] of Object.entries(e.extra)) {
    if (!allowed.has(k)) errors.push(`"${k}" does not apply to a ${spec.label.toLowerCase()}`);
    const choice = spec.choices?.find((ch) => ch.key === k);
    if (choice && !choice.options.some((o) => o.value === v)) errors.push(`${choice.label.toLowerCase()} must be one of ${choice.options.map((o) => o.value).join(", ")}`);
  }
  if (e.type === "goalkeeper" && !e.extra.gk_type) errors.push("goalkeeper action needs its type");
  return errors;
}

/** The spec's aerial duel is stored as StatsBomb does: a lost duel is type Aerial Lost, a won one a flag. */
export function normalise(e: LoggedEvent): LoggedEvent {
  if (e.type !== "duel") return e;
  return e.outcome === "won"
    ? { ...e, outcome: "won", extra: { ...e.extra, duel_type: "aerial", aerial_won: true } }
    : { ...e, outcome: null, extra: { ...e.extra, duel_type: "aerial_lost" } };
}
