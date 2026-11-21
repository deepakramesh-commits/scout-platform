Exported from the Tech plan document on 2026-11-21. Diagrams are not included.
# African Scouting Platform — Tech Plan
 · 
We film African youth and league matches through federation partners, turn the footage into tagged data, and sell scouts and agents searchable, ID-verified player profiles. The first target is a 90-day pilot in one country's U20 competition.

## How it works
Federations bring the matches and the IDs, we turn the footage into data, and scouts pay for the search. Steps 1 to 3 are where our costs sit; step 5 is where the revenue comes from.
Data collection in four stages
We start with people and add AI in stages, because accuracy comes first. The timings are estimates, and the first season sets the real ones.
Stage
 | When
 | What people do
 | What the system or AI does
 | 
1. People enter everything
 | Launch
 | Club coordinator fills the match sheet. A trained analyst logs every event with its outcome and pitch position. Our verifier enters identity. A second analyst logs a sample again
 | Event times, clips, per-90 numbers and percentiles, rule-based error flags
 | 
2. AI follows the players
 | About mid season 1
 | Say what happened and how it ended
 | Player tracking tells the analyst who the player is and where he is
 | 
3. AI suggests events
 | Season 2
 | Accept or correct every suggestion
 | Suggests events, learned from the season 1 logs
 | 
4. AI logs the easy events
 | Later
 | The hard calls and the sample check
 | Logs simple events alone, plus running data where the footage allows
 | 
The match sheet and the sample check stay manual at every stage.
Forms, not spreadsheets. Players are picked from the squad list, choices are fixed, entries are checked as they are typed, and both forms work offline on a phone.
Form
 | Who fills it
 | Time per match
 | 
Match sheet
 | Club coordinator
 | About 10 minutes
 | 
Event log
 | Trained analyst
 | Several hours (estimate)
 | 

## Users
Scouts and agents pay. Federations and academies supply the matches. Players and guardians own their profiles.
User
 | What they do on the platform
 | Device
 | Pays?
 | 
Club scout (Europe, Gulf, North Africa)
 | Searches players by role and metric, watches clips, builds shortlists, exports reports
 | Laptop
 | Yes, club subscription
 | 
Agent
 | Same search, plus tracks own clients and sends profiles to clubs
 | Laptop and phone
 | Yes, per seat
 | 
Federation or league
 | Schedules matches for filming, sees its competition's data, verifies player IDs
 | Laptop
 | No, gets data and analytics back in exchange
 | 
Academy or club coach
 | Uploads training and test results, sees own players' reports
 | Phone
 | Free tier
 | 
Player and guardian
 | Claims profile, gives consent, adds physical test results, sees own stats
 | Phone
 | Free
 | 
Tagger (our staff)
 | Tags events on match video in the tagging tool
 | Desktop
 | Paid per match
 | 

## Analytics
Every metric comes from one of three sources: event data (tagged on-ball actions with x,y), tracking data (every player's position over time), or physical tests. Each number shows as a per-90 value and a percentile against players of the same role, age band and league.
Scout question
 | Metric
 | Source
 | Pilot?
 | 
How much does he run?
 | Total distance, high-speed running (>19.8 km/h), sprints (>25 km/h), top speed
 | Tracking from video; sprint test as fallback
 | Test only; video tracking in Phase 2
 | 
How many touches?
 | Touches per 90, touches in final third and box, progressive carries
 | Event data
 | Yes
 | 
How is his recovery? (on the ball)
 | Ball recoveries, tackles and interceptions per 90, recoveries in opponent half
 | Event data
 | Yes
 | 
How is his recovery? (physical)
 | Repeat-sprint ability: speed drop across sprints, Yo-Yo test level
 | Tracking, physical test
 | Test only
 | 
A right winger who cuts inside
 | Carries from the right channel into the half-space, ending in a shot or key pass; share with left foot
 | Event data pattern query
 | Yes
 | 
Is he actually good on the ball?
 | Possession value per action (xT or VAEP), xG and xA
 | Event data, socceraction models
 | Yes
 | 
Who plays like a player we already like?
 | Similarity score on a role-specific metric vector
 | All of the above, vector search
 | Yes
 | 
Each profile shows the clips behind every number, so a scout can click a metric and see the actions it counts.

## MVP scope
The pilot proves one thing: a scout abroad can find, watch and shortlist a player they would never have seen otherwise. Everything else waits.
In the pilot
Match upload: footage from partner cameras lands in cloud storage, even over weak connections (resumable uploads)

Event log: trained analysts log passes, shots, carries, duels and recoveries with outcome and pitch position. The first 10 test matches use an existing independent tagging tool, then our own tool for the season

Player profile: verified ID and age, position, stats with percentiles, clip reel, physical test results

Scout search: filter by role, age, country and any metric; save filters as alerts

Shortlists and PDF reports a scout can send to their club

Consent flow for players and guardians, stored with the profile

Match sheet form: the club coordinator enters line-ups, shirt numbers, substitutions, goals and cards on a phone, offline if needed

After the pilot
AI player tracking that tells the analyst who and where, about mid season 1 (stage 2). Running data later, where the footage allows

AI-suggested events, learned from the season 1 logs, in season 2 (stage 3)

Similarity search across countries, Phase 2

Messaging between scouts, agents and academies, Phase 3

Transfer and trial tracking, revenue share, Phase 3

## Stack
Buy everything that is a solved problem, and use existing tools before building. Build the scout platform, the tagging workflow and the data model, because those are the product. We never put our matches into a competitor's product.
Layer
 | Choice
 | Build or buy
 | Why
 | 
Cameras
 | An independent auto-follow camera vendor (to be confirmed), phone rigs for small venues
 | Buy
 | Solved problem; the vendor is chosen once prices, terms and footage ownership are checked
 | 
Video storage and playback
 | Mux or Cloudflare Stream
 | Buy
 | Adaptive streaming and clipping without running a video team
 | 
Tagging tool
 | Pilot: an existing independent tagging tool (to be confirmed) for the first 10 test matches. Season: our own web app on the video player, keyboard-first, with pick-from-squad forms
 | Buy for the test, then build
 | The test measures hours per match before we build. Our own tool avoids per-seat cost and gives us our format and the second-analyst check
 | 
Event data standard
 | StatsBomb-style event spec
 | Adopt
 | Clubs already trust the definitions
 | 
Database
 | Postgres with PostGIS and pgvector
 | Buy (managed)
 | One database for events, pitch geometry and similarity search
 | 
Analytics
 | Python: kloppy, socceraction, mplsoccer
 | Open source
 | xT, VAEP and pitch charts already built
 | 
AI tracking (stage 2 onward)
 | YOLO, ByteTrack, Roboflow sports pitch mapping, SoccerNet models
 | Open source, fine-tuned
 | Running data from our own footage
 | 
Scout and player apps
 | Next.js web app, mobile-first
 | Build
 | The product
 | 
Reports
 | Claude API writes scouting summaries from the stats
 | Buy
 | Hours of analyst writing per player, automated
 | 
Identity and age
 | Government ID check through partners
 | Build with partners
 | The trust layer competitors cannot copy
 | 
Prototype on free data before our own footage arrives: StatsBomb Open Data, and Metrica and SkillCorner tracking samples.
No competitor products. Hudl is a competitor, so Sportscode, Wyscout and Hudl's cameras are excluded. For every vendor we check who owns the footage and whether we may resell data made from it. Vendor names above are to be confirmed, because prices, terms and ownership are being checked separately.

## Architecture
The web app and the worker never call each other directly. The app writes rows and jobs to Postgres, and the worker picks them up, so either side can go down without losing work.

## Data model
One Postgres database holds everything except raw video (Mux) and tracking frames (Parquet files in object storage). Coordinates use the StatsBomb pitch, 120 × 80 with the attack toward x = 120, so open data and open-source tools read ours unchanged.
Clips need no table: a clip is the match video played from video_seconds minus 5 to plus 8 seconds.

## Event spec
Twelve event types cover every pilot metric. Each one maps one-to-one to a StatsBomb type, so an exporter can write StatsBomb JSON and kloppy and socceraction read it unchanged.
Type
 | Outcome values
 | Location fields
 | Extra fields
 | Feeds
 | 
pass
 | complete, incomplete, out
 | x, y, end_x, end_y
 | body_part, cross, through_ball, key_pass
 | Passing, xA, progression
 | 
carry
 | none
 | x, y, end_x, end_y
 | none
 | Progressive carries, cut-ins
 | 
shot
 | goal, saved, off_target, blocked
 | x, y
 | body_part, xg
 | xG, shots
 | 
dribble
 | complete, failed
 | x, y
 | none
 | Take-ons
 | 
duel
 | won, lost
 | x, y
 | aerial or ground
 | Duels
 | 
ball_recovery
 | none
 | x, y
 | none
 | Recoveries
 | 
interception
 | won, lost
 | x, y
 | none
 | Defensive actions
 | 
tackle
 | won, lost
 | x, y
 | none
 | Defensive actions
 | 
clearance
 | none
 | x, y
 | body_part
 | Defensive actions
 | 
foul_committed
 | none
 | x, y
 | card
 | Discipline
 | 
foul_won
 | none
 | x, y
 | none
 | Discipline
 | 
ball_receipt
 | complete, failed
 | x, y
 | none
 | Touches, receiving zones
 | 
Touches = every event above that the player performs with the ball. Taggers enter location by clicking a 2D pitch beside the video, not the video frame itself.

## Pipelines
A match moves through four statuses (uploaded, tagging, review, published). Only published matches feed profiles.
Match to profile (pilot)
Upload. The uploader page asks an API route for a Mux direct-upload URL, then sends the file with Mux UpChunk, which resumes after a dropped connection.

Register. Mux calls the video.asset.ready webhook. The handler verifies the signature, saves mux_asset_id and sets status tagging.

Lineups. The club coordinator fills in the match sheet form: line-ups, shirt numbers, positions, substitutions, goals and cards. Players are picked from the squad list, and the form works offline on a phone.

Tag. For the first 10 test matches the analyst works in an existing independent tagging tool, and we import its export. In our own tool the analyst plays the HLS stream (hls.js), uses keyboard shortcuts for event types and clicks a 2D pitch for location. Each event saves on entry, so a crash loses at most one action.

Review. A second analyst logs a sample of every match again. Publish only when event counts and locations agree within a set tolerance.

Publish. Status published inserts a compute_match_metrics job.

Compute. The Python worker exports the match as StatsBomb JSON, converts it to SPADL with socceraction, scores actions with xT and VAEP, and upserts per-90 values, percentiles and the style vector.

Report. A write_report job sends the player's metrics as JSON to the Claude API and stores the summary text on the profile.

The worker takes jobs with select … for update skip locked, so you can run more than one worker without double-processing, and a failed job retries with attempts + 1.
At launch (stage 1) this pipeline has no AI judgment. The system records event times, cuts clips, computes the numbers and flags entries that break a rule, such as an event by a player who was already substituted. AI tracking and event suggestions join in stages 2 and 3.
Tracking from video (stage 2 onward)
A Modal GPU job pulls the match video from Mux.

A YOLO model, fine-tuned on SoccerNet, detects players, referees and the ball in each frame.

ByteTrack links detections into tracks across frames.

Jersey-colour clustering assigns each track to a team.

Pitch keypoint detection gives a homography from pixels to pitch metres (the Roboflow sports repo has this).

Tracks are matched to lineup players by shirt number, with manual fixes in the tagging tool.

Positions are smoothed and saved as Parquet. Distance, high-speed running and sprints go to Postgres.

Validate video tracking against GPS vests on a few matches before showing running numbers to scouts.

## Metrics and search
Every number on a profile is a per-90 value with a percentile. A player needs 450 minutes before percentiles show, so a single good match can't top a list.
Per 90: event count ÷ minutes played × 90.

Role: the position the player played most in that competition, taken from lineups.

Percentiles: percent_rank() within role × age band (U17, U19, U21, senior) × competition. Until enough leagues are covered to rate league strength, the app labels any comparison across leagues.

xT and VAEP: use socceraction models trained on StatsBomb open data. Retrain on our own matches once there are enough of them.

Style vector: 16 per-90 metrics, z-scored within role, stored in pgvector. "Players like X" = order by style <=> $1 limit 20.

Filters: the search UI builds SQL over player_season_metrics, for example (percentiles->>'sprints')::int >= 80. Promote a metric to its own indexed column once it is filtered often.

The right winger who cuts inside, as a query (tested on Postgres 16 with pgvector):
= 62                    -- starts in the right wide channel
    and end_y between 30 and 62    -- ends in the half-space or centre
    and end_x >= 80                -- ends in the final third
),
mins as (
  select player_id, sum(minutes_played) as minutes
  from lineups
  group by player_id
)
select p.display_name,
       count(*) as cut_ins,
       round(count(*) * 90.0 / m.minutes, 2) as cut_ins_per90
from cut_ins c
join players p on p.id = c.player_id
join mins m on m.player_id = c.player_id
where p.primary_position = 'RW'
  and p.visible_to_scouts
  and m.minutes >= 450
group by p.id, p.display_name, m.minutes
order by cut_ins_per90 desc
limit 50;
Next refinement: keep only cut-ins whose next action by the same player is a shot or key pass. Use lead() over events ordered by video_seconds.

## Security and privacy
Most players are minors, so the database enforces access rules itself rather than trusting the app code.
Row-level security on every table. Scouts and agents read only players with visible_to_scouts = true. Taggers read only the matches assigned to them.

Consent gates visibility. A player becomes visible only with a signed, unrevoked consent whose scope includes share_with_clubs, signed by a guardian if they are under 18. Revoking consent hides the profile immediately and queues deletion of personal data.

Identity stays private. player_identity and ID document images have no scout-facing policy. Scouts see only id_verified and birth_year.

Private storage. ID documents go in a private bucket, served only through short-lived signed URLs to admins.

Audit trail. profile_views records who viewed which player. It doubles as a feature ("12 clubs viewed you").

Video access. Mux signed playback tokens, so match footage can't be shared outside the app.

Data residency. Check each pilot country's rules on moving personal data abroad (Nigeria NDPA, Kenya DPA, South Africa POPIA) before choosing the database region.

## Build order
Building solo, use one repo, one database and managed services, and build the scout search first on open data so the analytics are proven before our own footage arrives.
Weeks 1–2: foundation and open-data search. Set up Supabase, the schema migrations, auth with roles and a Vercel deploy. Load StatsBomb open data into events with statsbombpy, compute per-90 values and percentiles, and build the search page. You now have a working scout search before any filming.

Weeks 3–4: video and the match sheet form. Mux direct upload, the webhook, match pages and a player that jumps to any event's timestamp. Build the match sheet form: players picked from the squad list, fixed choices, checks on entry, offline on a phone.

Weeks 5–6: test with an existing tagging tool. Log 10 test matches in an existing independent tagging tool (to be confirmed, never a competitor's) and import the result. Time every match: that number drives the tagging budget. Fix the event definitions with our scout advisor.

Weeks 7–8: worker. Job queue, metrics compute, percentiles, style vector, all triggered on publish.

Weeks 9–10: profiles and trust. Player profiles with clips, consent flow, the admin screen for ID verification.

Weeks 11–12: scout workflow. Shortlists, PDF export, Claude-written summaries, an RLS audit, then onboard the pilot scouts.

After the test: our own tagging tool. Keyboard shortcuts, pitch-click location, autosave and the second-analyst check, built from what the 10 test matches taught us and ready before the full season.

Start filming in week 3 so there are test matches waiting in week 5. Add Sentry for errors and Playwright tests for the forms and the import, because a data-entry bug corrupts data silently.

## Roadmap
If the pilot misses its gate by month 4, we fix the product in the same country before adding another.
The diagram predates two changes: AI now arrives in four stages (see How it works), and the first 10 test matches are logged in an existing tool before we build our own.

## Risks
Risk
 | What it breaks
 | Mitigation
 | 
Scouts don't trust our numbers
 | Nobody pays
 | Adopt an existing event standard; show the clip behind every metric; publish tagger accuracy
 | 
Tagging is too slow or costly per match
 | Unit economics
 | Measure hours per match on 10 test matches in an existing tool before building ours; keyboard-first forms; AI added in stages
 | 
Federation deal gives us hosting but not data rights
 | No moat
 | Data ownership and resale terms signed before any filming
 | 
Minors' data handled badly
 | Legal exposure, clubs walk away
 | Guardian consent in the product, comply with NDPA, Kenya DPA and POPIA per country
 | 
Age or identity fraud on profiles
 | Trust collapses
 | ID verification with government partners; flag unverified profiles clearly
 | 
Footage quality or connectivity at venues
 | Missing matches
 | Fixed cameras at partner venues, offline capture with later upload
 | 
A vendor's terms claim our footage or data
 | No moat
 | Never use a competitor's product (Hudl is excluded); check footage ownership and data resale terms for every vendor
 | 

## Decisions to vet
Set each row to Approve, Change or Discuss; I'll revise the plan from your picks and comments.
Decision
 | My recommendation
 | Your call
 | 
Pilot market
 | One country, one U20 competition, where partner access is strongest
 | 
 | 
First paying customer
 | Club scouts and agents abroad, not academies
 | 
 | 
How data is made
 | People enter everything first, in our forms; AI added in four stages
 | 
 | 
Cameras
 | Buy from an independent auto-follow vendor (to be confirmed); never build, never a competitor's
 | 
 | 
Event definitions
 | Adopt a StatsBomb-style standard
 | 
 | 
Core stack
 | Next.js, managed Postgres with pgvector, Mux for video
 | 
 | 
Federation deals
 | Data ownership and resale rights in every contract
 | 
 | 
Pricing
 | Club subscription, agent seats, free for players and guardians
 | 
 | 
Identity
 | Government-backed ID and age check from day one
 | 
 | 
Pilot success measure
 | Weekly active scouts and trials arranged, not signups
 | 
 |
