-- A match publishes only from review, and only when the latest quality check passed with no rule flags.
create or replace function app.publish_match(mid uuid) returns void language plpgsql security definer set search_path = public as $$
declare cur text; ok boolean; n int;
begin
  if not (app.is_admin() or app.assigned(mid, 'reviewer')) then raise exception 'only a reviewer or admin publishes' using errcode = '42501'; end if;
  select status into cur from matches where id = mid for update;
  if cur is distinct from 'review' then raise exception 'only a match in review can publish (this one is %)', coalesce(cur, 'missing') using errcode = 'P0001'; end if;
  select passed, flags into ok, n from qc_runs where match_id = mid order by run_at desc limit 1;
  if not coalesce(ok, false) then raise exception 'the latest quality check has not passed' using errcode = 'P0001'; end if;
  if n > 0 then raise exception 'the latest quality check found % rule flags: fix them and run the check again', n using errcode = 'P0001'; end if;
  update matches set status = 'published' where id = mid;
  insert into jobs (kind, payload) values ('compute_match_metrics',
    jsonb_build_object('match_id', mid, 'competition_id', (select competition_id from matches where id = mid)));
end $$;
