# Event definitions standard

The full list of event types, outcomes and their definitions lives in the app at **Standards, Event definitions**,
generated from `apps/web/lib/event-spec.ts`, the same file the event log tool, the import and the quality check
read. This page states the rules that apply to every event.

- **One action, one event.** Log what the player did with the ball or to the opponent, at the moment he did it.
- **Location** is where the action started, clicked on the 2D pitch beside the video, never on the video frame.
  The pitch is 120 by 80 and always shows the acting team attacking to the right (toward x = 120), whatever the half.
- **End location** is required for passes and carries: where the ball arrived.
- **Time** is saved from the video, so every number links to its clip (5 seconds before to 8 seconds after).
- **Under pressure** is set when an opponent is close enough to affect the action.
- **Each event saves on entry.** If the tool or the connection fails, at most one action is lost.
- **The format stays StatsBomb-style**, so an export reads unchanged in kloppy and socceraction.
