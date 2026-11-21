-- Phase 1: buyer-first scouting. Attribute registry, requirement profiles, demo-value flags, market details.

-- 33 = len(metrics.KEYS); worker/test_metrics.py checks the two agree. The worker refills the column.
drop index if exists player_season_metrics_style_idx;
alter table player_season_metrics alter column style type vector(33) using null;
create index player_season_metrics_style_idx on player_season_metrics using hnsw (style vector_cosine_ops);

-- Demo values that sit inside a real row are named here, column by column, so one command can strip them.
alter table players add column height_cm int check (height_cm between 140 and 215),
                    add column demo_fields text[] not null default '{}';

create table player_market (
  player_id uuid primary key references players on delete cascade,
  contract_end date,
  availability text check (availability in ('available', 'open_to_offers', 'not_available')),
  transfer_conditions text,
  representative text,
  updated_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create table physical_test_kinds (
  key text primary key,
  label text not null,
  unit text not null,
  lower_is_better boolean not null
);
insert into physical_test_kinds values
  ('sprint_10m', '10 m sprint', 's', true),
  ('sprint_30m', '30 m sprint', 's', true),
  ('endurance', 'Endurance (Yo-Yo IR1 level)', 'level', false),
  ('jump', 'Countermovement jump', 'cm', false);
alter table physical_tests add column is_demo boolean not null default false,
  add constraint physical_tests_test_fkey foreign key (test) references physical_test_kinds;

-- The one attribute registry, in the scout's words. `metrics` are stand-ins from worker/metrics.py KEYS.
create table attributes (
  key text primary key,
  label text not null,
  grp text not null check (grp in ('technical', 'physical', 'tactical', 'mental')),
  source text not null check (source in ('match', 'partly_match', 'scout', 'physical_test')),
  metrics text[] not null default '{}',
  test text references physical_test_kinds,
  description text not null,
  sort int not null
);
insert into attributes (key, label, grp, source, metrics, test, description, sort) values
  ('first_touch', 'First touch under pressure', 'technical', 'partly_match', '{first_touch_under_pressure_pct}', null, 'Share of receptions under pressure kept without a miscontrol', 10),
  ('passing', 'Passing quality', 'technical', 'match', '{pass_accuracy_pct,progressive_passes,key_passes}', null, 'Pass accuracy, progressive passes, key passes', 20),
  ('dribbling', '1v1 dribbling', 'technical', 'match', '{dribbles_completed,dribble_success_pct}', null, 'Dribbles completed and dribble success', 30),
  ('finishing', 'Finishing', 'technical', 'match', '{goals,xg,first_time_shots}', null, 'Goals, xG, first-time shots', 40),
  ('final_pass', 'Final pass', 'technical', 'match', '{key_passes,assists}', null, 'Key passes and assists', 50),
  ('crossing', 'Crossing', 'technical', 'match', '{crosses}', null, 'Crosses', 60),
  ('carrying', 'Carrying the ball forward', 'technical', 'match', '{progressive_carries}', null, 'Progressive carries', 70),
  ('link_up', 'Link-up play', 'technical', 'scout', '{}', null, 'Combining with team-mates, back to goal', 80),
  ('both_feet', 'Using both feet', 'technical', 'scout', '{}', null, 'Comfort on the weaker foot', 90),
  ('acceleration', 'Acceleration', 'physical', 'physical_test', '{}', 'sprint_10m', 'Fast over the first metres', 110),
  ('speed', 'Speed', 'physical', 'physical_test', '{}', 'sprint_30m', 'Top speed', 120),
  ('explosiveness', 'Explosiveness', 'physical', 'physical_test', '{}', 'jump', 'Power off the ground and in the first step', 130),
  ('stamina', 'Stamina', 'physical', 'physical_test', '{}', 'endurance', 'Repeating runs over 90 minutes', 140),
  ('agility', 'Agility', 'physical', 'physical_test', '{}', null, 'Agility and coordination; no test in the battery yet', 150),
  ('strength', 'Strength in duels', 'physical', 'partly_match', '{duels_won,aerial_duels_won}', null, 'Ground and aerial duels won', 160),
  ('runs_in_behind', 'Runs in behind', 'tactical', 'partly_match', '{through_balls_received,receptions_in_box}', null, 'Through balls received, receptions in the box', 210),
  ('pressing', 'Pressing', 'tactical', 'match', '{pressures}', null, 'Pressures on the ball carrier', 220),
  ('ball_winning', 'Ball winning', 'tactical', 'match', '{ball_recoveries,interceptions,tackles_won}', null, 'Recoveries, interceptions, tackles won', 230),
  ('defending_1v1', '1v1 defending', 'tactical', 'match', '{tackles_won,tackle_success_pct}', null, 'Tackles won and tackle success', 240),
  ('positional_play', 'Positional play', 'tactical', 'scout', '{}', null, 'Where he stands with and without the ball', 250),
  ('decision_making', 'Decision-making', 'tactical', 'scout', '{}', null, 'Choosing the right action, quickly, under pressure', 260),
  ('movement', 'Movement off the ball', 'tactical', 'scout', '{}', null, 'Timing and direction of runs', 270),
  ('mental_strength', 'Mental strength', 'mental', 'scout', '{}', null, 'Handling setbacks and pressure', 310),
  ('work_ethic', 'Work ethic', 'mental', 'scout', '{}', null, 'Training discipline and drive to improve', 320),
  ('leadership', 'Leadership', 'mental', 'scout', '{}', null, 'Motivating and influencing team-mates', 330),
  ('self_confidence', 'Self-confidence', 'mental', 'scout', '{}', null, 'Belief on the ball and in big moments', 340),
  ('discipline', 'Discipline', 'mental', 'scout', '{}', null, 'Attitude, responsibility, professional behaviour', 350),
  ('competitive_instinct', 'Competitive instinct', 'mental', 'scout', '{}', null, 'The will to win in decisive moments', 360),
  ('coachability', 'Coachability', 'mental', 'scout', '{}', null, 'How he takes criticism and instructions', 370),
  ('team_player', 'Team player', 'mental', 'scout', '{}', null, 'Puts the team first', 380);

create table requirement_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  club text,
  org_id uuid references orgs,
  positions text[] not null check (cardinality(positions) > 0),
  age_min int check (age_min between 14 and 45),
  age_max int check (age_max between 14 and 45),
  is_draft boolean not null default false,
  note text,
  created_by uuid references app_users,
  created_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);
create table requirement_items (
  profile_id uuid references requirement_profiles on delete cascade,
  attribute text references attributes,
  priority text not null check (priority in ('very_high', 'high', 'medium')),
  primary key (profile_id, attribute)
);

-- Seeded from section 2C and section 5 of the scout notes. Fixed ids so re-runs and links are stable.
insert into requirement_profiles (id, name, club, positions, age_min, age_max, is_draft, note) values
  ('00000000-0000-4000-a000-000000000001', 'Explosive winger', null, '{LW,RW}', null, null, false, 'Can play on both flanks. The notes give no priorities; the first two listed are set very high, the rest high.'),
  ('00000000-0000-4000-a000-000000000002', 'Modern striker', null, '{ST}', null, null, false, 'Finishing with few touches counts first-time shots. Priorities set as for the winger.'),
  ('00000000-0000-4000-a000-000000000003', 'Dynamic central midfielder', null, '{CM,DM}', null, null, false, 'Covering ground is read as stamina. Priorities set as for the winger.'),
  ('00000000-0000-4000-a000-000000000004', 'Modern centre-back', null, '{CB}', null, null, false, 'Defending large spaces needs speed and 1v1 defending. Priorities set as for the winger.'),
  ('00000000-0000-4000-a000-000000000005', 'Attacking full-back', null, '{FB}', null, null, false, 'Work in both directions is read as ball winning plus stamina. Priorities set as for the winger.'),
  ('00000000-0000-4000-a000-000000000006', 'Malmö FF striker (draft)', 'Malmö FF', '{ST}', 18, 22, true, 'Draft until Malmö FF confirms. Priorities from section 5 of the scout notes.'),
  ('00000000-0000-4000-a000-000000000007', 'Malmö FF full-back (draft)', 'Malmö FF', '{FB}', null, null, true, 'Draft until Malmö FF confirms. The notes give no priorities, so every attribute is high.'),
  ('00000000-0000-4000-a000-000000000008', 'Malmö FF wide midfielder (draft)', 'Malmö FF', '{LW,RW}', null, null, true, 'Draft until Malmö FF confirms. The notes give no priorities, so every attribute is high. Check he can play both flanks.');

insert into requirement_items (profile_id, attribute, priority)
select ('00000000-0000-4000-a000-00000000000' || p)::uuid, a, pr from (values
  (1, 'speed', 'very_high'), (1, 'acceleration', 'very_high'), (1, 'dribbling', 'high'), (1, 'final_pass', 'high'), (1, 'finishing', 'high'),
  (2, 'runs_in_behind', 'very_high'), (2, 'movement', 'very_high'), (2, 'strength', 'high'), (2, 'finishing', 'high'), (2, 'pressing', 'high'),
  (3, 'ball_winning', 'very_high'), (3, 'stamina', 'very_high'), (3, 'strength', 'high'), (3, 'passing', 'high'), (3, 'decision_making', 'high'),
  (4, 'speed', 'very_high'), (4, 'strength', 'very_high'), (4, 'positional_play', 'high'), (4, 'passing', 'high'), (4, 'defending_1v1', 'high'),
  (5, 'stamina', 'very_high'), (5, 'speed', 'very_high'), (5, 'dribbling', 'high'), (5, 'crossing', 'high'), (5, 'passing', 'high'), (5, 'ball_winning', 'high'),
  (6, 'runs_in_behind', 'very_high'), (6, 'acceleration', 'very_high'), (6, 'finishing', 'very_high'), (6, 'movement', 'very_high'),
  (6, 'strength', 'high'), (6, 'first_touch', 'high'), (6, 'pressing', 'high'), (6, 'link_up', 'high'),
  (7, 'explosiveness', 'high'), (7, 'speed', 'high'), (7, 'stamina', 'high'), (7, 'movement', 'high'), (7, 'dribbling', 'high'),
  (7, 'crossing', 'high'), (7, 'defending_1v1', 'high'), (7, 'decision_making', 'high'),
  (8, 'acceleration', 'high'), (8, 'dribbling', 'high'), (8, 'final_pass', 'high'), (8, 'finishing', 'high'), (8, 'pressing', 'high'), (8, 'carrying', 'high')
) v(p, a, pr);

-- Fit and standouts read a real percentile per attribute: the worker averages the stand-in metric
-- percentiles and ranks that average within the position, so "above the 85th" means what it says.
alter table player_season_metrics add column attr_percentiles jsonb not null default '{}',
                                  add column peers int not null default 0;
-- The minutes a player needs before percentiles show. The plan's league rule is 450; a tournament gets less.
alter table competitions add column min_minutes int not null default 450 check (min_minutes > 0);
-- Profiles built from match data are live unless the age rule or consent says otherwise (phase 4 replaces this with a status).
alter table players alter column visible_to_scouts set default true;

-- Demo organisations and one user of each type (worker/seed_demo.py). The club coordinator fills the match sheet.
alter table orgs add column is_demo boolean not null default false;
alter table app_users add column display_name text, add column is_demo boolean not null default false,
  drop constraint app_users_role_check,
  add constraint app_users_role_check check (role in ('scout','agent','federation','coach','player','guardian','tagger','coordinator','admin'));
