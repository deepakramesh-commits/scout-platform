# Quality check standard

No match feeds a player profile until it has passed two checks: rule-based error flags, and a second analyst.

## 1. Error flags

The system flags, and the analyst fixes or explains, every event that:

- falls outside the playing time the analyst marked in the video;
- is by a player who is not on the match sheet, or is logged for the wrong team;
- is by a player after he was substituted or sent off, or by a substitute before he came on.

## 2. The second analyst

- A second analyst logs a sample of the match again, without seeing the first analyst's events: by default
  15 minutes chosen by the reviewer.
- Two events agree when they have the same type and player, are within 3 seconds of each other, and their
  locations are within 10 pitch units (the pitch is 120 by 80).
- Agreement = agreeing events divided by the larger of the two counts, so a missed event and an invented one both
  count against it.
- **Pass mark: 90% agreement.** The three numbers (90%, 10 units, 3 seconds) are settings an admin can change.

## When a match fails

The match goes back to tagging. The first analyst corrects the events the comparison shows as unmatched, and the
second analyst runs the check again. Each analyst's accuracy is their average agreement over every checked match,
and it is shown to admins.

## Publishing

Only a reviewer or an admin can publish, and only when the latest check passed. Publishing queues the metrics job,
which recomputes every player's numbers for the competition.
