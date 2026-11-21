-- Phase 2: the scout's eye. Ratings 1..10 per registry attribute; the mental group is the personal profile.
create table scout_reports (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players on delete cascade,
  org_id uuid not null references orgs,
  author_id uuid not null references app_users,
  seen_in text not null default '',
  recommendation text not null check (recommendation in ('sign', 'follow', 'pass')),
  strengths text not null default '',
  weaknesses text not null default '',
  comments text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_demo boolean not null default false
);
create index on scout_reports (player_id, org_id);
create table scout_ratings (
  report_id uuid references scout_reports on delete cascade,
  attribute text references attributes,
  rating int not null check (rating between 1 and 10),
  primary key (report_id, attribute)
);
