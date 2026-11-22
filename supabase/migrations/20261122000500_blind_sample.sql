-- The second analyst logs the sample blind, so the match's analyst never reads the sample window or the reviewer's events:
-- only the reviewer and admins do, through their "reviewer" policies. The analyst keeps the results in qc_runs, but not
-- their details, which copy the sample window.
drop policy assigned_read on review_events;
drop policy assigned_read on qc_samples;
revoke select on qc_runs from authenticated;
grant select (id, match_id, analyst_id, reviewer_id, primary_count, review_count, agreed, agreement, passed, flags, run_at, inputs_seen)
  on qc_runs to authenticated;
