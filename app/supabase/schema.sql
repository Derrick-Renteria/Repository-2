-- =====================================================================
-- Ninja Competition Manager — database setup (Supabase)
-- Paste this whole file into Supabase ▸ SQL Editor ▸ New query ▸ Run.
-- BEFORE running: replace YOUR-EMAIL@example.com (bottom) with the
-- email of the first person who should be able to edit.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.editors (
  email text primary key,
  added_at timestamptz default now()
);

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create table if not exists public.events (
  id uuid primary key,
  name text default '',
  date date,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create table if not exists public.levels (
  id uuid primary key,
  event_id uuid references public.events(id) on delete cascade,
  name text default '',
  color text default '#999999',
  sort int default 0
);
create table if not exists public.flights (
  id uuid primary key,
  event_id uuid references public.events(id) on delete cascade,
  level_id uuid references public.levels(id) on delete cascade,
  number int default 1,
  start_min int,
  notes text default '',
  changed_at timestamptz
);
create table if not exists public.athletes (
  id uuid primary key,
  event_id uuid references public.events(id) on delete cascade,
  name text default '',
  age int,
  level_id uuid references public.levels(id) on delete set null,
  flight_id uuid references public.flights(id) on delete set null,
  override_min int,
  status text default 'Pending' check (status in ('Confirmed','Pending','Changed','Scratched')),
  notes text default '',
  changed_at timestamptz,
  src_row int
);
create table if not exists public.changes (
  id uuid primary key,
  event_id uuid references public.events(id) on delete cascade,
  at timestamptz default now(),
  actor text default '',
  target text default '',
  field text default '',
  old_value text default '',
  new_value text default '',
  undo jsonb,
  undone boolean default false
);
create index if not exists athletes_event on public.athletes(event_id);
create index if not exists flights_event on public.flights(event_id);
create index if not exists changes_event on public.changes(event_id);

-- ---------- security: anyone can READ the schedule, only editors can CHANGE it ----------
-- Table permissions (newer Supabase projects don't grant these automatically).
-- Row-level security below still decides exactly which rows each person can see or change.
grant usage on schema public to anon, authenticated;
grant select on public.events, public.levels, public.flights to anon;
grant select, insert, update, delete on public.events, public.levels, public.flights,
  public.athletes, public.changes, public.editors to authenticated;
grant execute on function public.is_editor() to anon, authenticated;

alter table public.editors  enable row level security;
alter table public.events   enable row level security;
alter table public.levels   enable row level security;
alter table public.flights  enable row level security;
alter table public.athletes enable row level security;
alter table public.changes  enable row level security;

do $$
declare t text;
begin
  -- public read: events, levels, flights
  foreach t in array array['events','levels','flights'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
  -- editors only read athletes (notes stay private) and the change log
  foreach t in array array['athletes','changes'] loop
    execute format('drop policy if exists "editor read" on public.%I', t);
    execute format('create policy "editor read" on public.%I for select to authenticated using (public.is_editor())', t);
  end loop;
  -- editors only write everything
  foreach t in array array['events','levels','flights','athletes','changes'] loop
    execute format('drop policy if exists "editor insert" on public.%I', t);
    execute format('drop policy if exists "editor update" on public.%I', t);
    execute format('drop policy if exists "editor delete" on public.%I', t);
    execute format('create policy "editor insert" on public.%I for insert to authenticated with check (public.is_editor())', t);
    execute format('create policy "editor update" on public.%I for update to authenticated using (public.is_editor()) with check (public.is_editor())', t);
    execute format('create policy "editor delete" on public.%I for delete to authenticated using (public.is_editor())', t);
  end loop;
end $$;

drop policy if exists "see editors" on public.editors;
create policy "see editors" on public.editors for select to authenticated
  using (public.is_editor() or email = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "add editors" on public.editors;
create policy "add editors" on public.editors for insert to authenticated with check (public.is_editor());
drop policy if exists "remove editors" on public.editors;
create policy "remove editors" on public.editors for delete to authenticated using (public.is_editor());

-- (The public view of athletes is defined in the results section below.)

-- ---------- results (same as migrations/002_results.sql) ----------
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

-- What the public page sees: no notes, no scratched athletes, ages only if the event allows,
-- nothing at all while the event's schedule is hidden. Includes competition results.
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

-- live updates
do $$
declare t text;
begin
  foreach t in array array['events','levels','flights','athletes','changes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- first editor (CHANGE THIS EMAIL) ----------
insert into public.editors (email) values (lower('YOUR-EMAIL@example.com')) on conflict do nothing;
