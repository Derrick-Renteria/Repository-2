-- Points scoring (points first, time breaks ties) + optional "hide scores until final". Safe to re-run.
alter table public.athletes add column if not exists result_points numeric;

drop view if exists public.public_athletes;
create view public.public_athletes as
  select a.id, a.event_id, a.name,
         case when coalesce((e.settings ->> 'publicShowAge')::boolean, false) then a.age end as age,
         a.level_id, a.flight_id, a.override_min, a.status,
         r.result_ms, r.result_points, r.result_status, r.result_at, r.outcome
  from public.athletes a
  join public.events e on e.id = a.event_id
  left join public.levels l on l.id = a.level_id
  -- scores are withheld (not just hidden) until the level is final, when the event asks for that
  cross join lateral (
    select case when show then a.result_ms end as result_ms,
           case when show then a.result_points end as result_points,
           case when show then a.result_status end as result_status,
           case when show then a.result_at end as result_at,
           case when show then a.outcome end as outcome
    from (select (not coalesce((e.settings ->> 'hideResultsUntilFinal')::boolean, false))
                 or coalesce(l.results_final, false) as show) s
  ) r
  where a.status <> 'Scratched'
    and coalesce((e.settings ->> 'published')::boolean, true);
grant select on public.public_athletes to anon, authenticated;
