# Event import: CSV layout

Any tagging tool's export can be mapped into this layout and imported on the match's **Import** screen. A
StatsBomb-style JSON event file (the open-data format) is accepted as well.

One row per event, with a header row naming these columns. Column order does not matter; names do.

| Column | Required | Values |
|---|---|---|
| `period` | yes | 1, 2, 3 or 4 (3 and 4 are extra time) |
| `clock` | yes | the match clock as `mm:ss`, e.g. `47:12` in the second half |
| `team` | yes | `home`, `away`, or the team's name as on the match |
| `shirt` | yes | the player's shirt number on the match sheet |
| `type` | yes | an event type from the event spec: `pass`, `carry`, `shot`, `dribble`, `duel` (aerial), `tackle`, `ball_recovery`, `interception`, `clearance`, `block`, `pressure`, `ball_receipt`, `miscontrol`, `dispossessed`, `dribbled_past`, `foul_committed`, `foul_won`, `goalkeeper` |
| `outcome` | when the type has one | from the event spec, e.g. pass `complete` / `incomplete` / `out`; shot `goal` / `saved` / `off_t` / `blocked` / `post` |
| `x`, `y` | yes | the StatsBomb pitch, 120 by 80, attacking toward x = 120 |
| `end_x`, `end_y` | pass and carry | where the ball ended |
| `body_part` | optional | `Right Foot`, `Left Foot`, `Head`, `Other` (passes, shots, clearances) |
| `flags` | optional | semicolon list: `under_pressure`, `cross`, `through_ball`, `shot_assist`, `goal_assist`, `first_time`, `aerial_won` |
| `set_piece` | optional | `corner`, `free_kick`, `throw_in`, `goal_kick`, `kick_off`, `penalty` |
| `card` | fouls | `yellow_card`, `second_yellow`, `red_card` |
| `gk_type` | goalkeeper actions | `shot_saved`, `collected`, `punch`, `keeper_sweeper`, `goal_conceded` |

Rules:

- The match sheet must be filled first: players are found by team and shirt number.
- Every row is checked against the event spec. If any row fails, **nothing is imported** and every error is
  listed with its row number, so a half-imported match can never feed a profile.
- Imported events get `source = 'import'`. Their `video_seconds` is the match clock until the analyst marks
  where each period starts in the video.

Example:

```csv
period,clock,team,shirt,type,outcome,x,y,end_x,end_y,body_part,flags,set_piece,card,gk_type
1,12:07,home,9,pass,complete,60,40,80,30,Right Foot,under_pressure;cross,,,
2,67:30,home,9,shot,goal,108,38,,,Left Foot,first_time,,,
2,70:00,away,1,goalkeeper,success,4,40,,,,,,,shot_saved
```
