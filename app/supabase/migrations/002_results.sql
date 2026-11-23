-- Competition results (times) + per-level advancement settings. Safe to run more than once.
alter table public.athletes add column if not exists result_ms int;
alter table public.athletes add column if not exists result_status text;
alter table public.athletes add column if not exists result_at timestamptz;
alter table public.athletes add column if not exists outcome text;
do $$ begin
  alter table public.athletes add constraint athletes_result_status_check check (result_status in ('Finished','DNF','DNS','DQ'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.athletes add constraint athletes_outcome_check check (outcome in ('advance','done'));
exception when duplicate_object then null; end $$;
alter table public.levels add column if not exists advance_count int default 0;
alter table public.levels add column if not exists results_final boolean default false;

-- public view now includes results
drop view if exists public.public_athletes;
create view public.public_athletes as
  select a.id, a.event_id, a.name,
         case when coalesce((e.settings ->> 'publicShowAge')::boolean, false) then a.age end as age,
         a.level_id, a.flight_id, a.override_min, a.status,
         a.result_ms, a.result_status, a.result_at, a.outcome
  from public.athletes a
  join public.events e on e.id = a.event_id
  where a.status <> 'Scratched'
    and coalesce((e.settings ->> 'published')::boolean, true);
grant select on public.public_athletes to anon, authenticated;
