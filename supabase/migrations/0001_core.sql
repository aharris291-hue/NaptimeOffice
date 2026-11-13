-- Naptime Office: core tables (providers, families, contacts, children, attendance).
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Every table is locked so a provider can only ever read and write their own rows.

create extension if not exists "pgcrypto";

-- One row per daycare business. id matches the signed-in user's id.
create table if not exists public.providers (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  provider_name text not null default '',
  business_name text not null default '',
  address text not null default '',
  phone text not null default '',
  country text not null default 'US',
  currency text not null default '$',
  time_zone text not null default 'America/New_York',
  open_time time not null default '07:00',
  close_time time not null default '17:30',
  late_grace_minutes int not null default 5,
  late_fee_amount numeric(10,2) not null default 0,
  late_fee_per_minutes int not null default 15,
  -- Ratio rules the provider sets, e.g. [{"label":"Under 2","max_age_months":24,"max_per_adult":2}]
  ratio_rules jsonb not null default '[]'::jsonb,
  max_children int not null default 12,
  created_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  name text not null,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Parents, guardians and anyone allowed to pick up.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  full_name text not null,
  relationship text not null default 'Parent',
  phone text not null default '',
  email text not null default '',
  is_guardian boolean not null default true,
  can_pickup boolean not null default true,
  billing_share numeric(5,2) not null default 0, -- percent of tuition this person pays (split billing)
  photo_path text,
  id_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  birth_date date,
  schedule_days text[] not null default array['Mon','Tue','Wed','Thu','Fri'],
  rate numeric(10,2) not null default 0,
  rate_type text not null default 'weekly' check (rate_type in ('hourly','daily','weekly','monthly')),
  allergies text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  care_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  in_by text not null default '',
  out_by text not null default '',
  in_signature text, -- small SVG path of the finger signature
  out_signature text,
  late_minutes int not null default 0,
  late_fee numeric(10,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists attendance_provider_date on public.attendance (provider_id, care_date);
create index if not exists attendance_child_date on public.attendance (child_id, care_date);

-- Row-level security: only the owner can see or change their rows.
alter table public.providers enable row level security;
alter table public.families enable row level security;
alter table public.contacts enable row level security;
alter table public.children enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "own provider row" on public.providers;
create policy "own provider row" on public.providers
  for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['families','contacts','children','attendance'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (provider_id = auth.uid()) with check (provider_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- Create the provider row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.providers (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Private storage for pick-up photos: each provider gets a folder named after their id.
insert into storage.buckets (id, name, public) values ('pickup-photos', 'pickup-photos', false)
on conflict (id) do nothing;

drop policy if exists "own pickup photos" on storage.objects;
create policy "own pickup photos" on storage.objects
  for all using (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = auth.uid()::text);
