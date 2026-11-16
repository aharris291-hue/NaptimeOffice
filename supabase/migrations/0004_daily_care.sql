-- Naptime Office: daily logs, naps, supplies, incident reports and medication logs.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

-- One row per thing that happened: a meal, a bottle, a diaper, a nap, a mood, an activity or a note.
create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  care_date date not null,
  kind text not null check (kind in ('meal','bottle','diaper','potty','nap','mood','activity','note')),
  started_at timestamptz not null default now(),
  ended_at timestamptz, -- naps only
  value text not null default '', -- e.g. "Ate most", "Wet", "6 oz", "Happy"
  note text not null default '',
  created_at timestamptz not null default now()
);

-- What each child has left at the daycare (diapers, wipes, formula, spare clothes).
create table if not exists public.supplies (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  item text not null,
  level text not null default 'plenty' check (level in ('plenty','low','out')),
  updated_at timestamptz not null default now(),
  unique (child_id, item)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  happened_at timestamptz not null default now(),
  kind text not null default 'Injury',
  location text not null default '',
  description text not null default '',
  action_taken text not null default '',
  witnessed_by text not null default '',
  provider_signature text,
  parent_notified_at timestamptz,
  parent_name text not null default '',
  parent_signature text,
  created_at timestamptz not null default now()
);

-- A parent's written permission to give a medicine.
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  name text not null,
  dose text not null default '',
  instructions text not null default '', -- when and how, e.g. "Every 6 hours as needed for fever over 101"
  start_date date not null default current_date,
  end_date date,
  authorized_by text not null default '',
  authorized_signature text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.med_doses (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  given_at timestamptz not null default now(),
  dose text not null default '',
  given_by text not null default '',
  note text not null default ''
);

create index if not exists daily_entries_day_idx on public.daily_entries (provider_id, care_date, child_id);
create index if not exists incidents_child_idx on public.incidents (provider_id, child_id, happened_at);
create index if not exists med_doses_idx on public.med_doses (provider_id, medication_id, given_at);

do $$
declare t text;
begin
  foreach t in array array['daily_entries','supplies','incidents','medications','med_doses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (provider_id = auth.uid()) with check (provider_id = auth.uid())', t);
  end loop;
end $$;
