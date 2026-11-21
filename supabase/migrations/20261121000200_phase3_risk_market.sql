-- Phase 3: risk and market. Per-match index, age-band percentiles, starters for the StatsBomb export.
alter table lineups add column started boolean not null default false;

create table player_match_index (
  player_id uuid references players on delete cascade,
  match_id uuid references matches on delete cascade,
  competition_id uuid not null references competitions,
  role text not null,
  minutes int not null,
  index int not null check (index between 0 and 100),
  opponent_team_id uuid not null references teams,
  opponent_stronger boolean not null,
  primary key (player_id, match_id)
);

alter table player_season_metrics add column age_band text check (age_band in ('U17', 'U19', 'U21', 'senior')),
  add column band_percentiles jsonb not null default '{}',
  add column band_peers int not null default 0;
