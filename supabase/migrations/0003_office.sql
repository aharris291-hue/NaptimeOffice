-- Naptime Office: expenses, time-space, and documents with expiry dates.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  spent_on date not null default current_date,
  amount numeric(10,2) not null check (amount >= 0),
  category text not null default 'Supplies',
  vendor text not null default '',
  note text not null default '',
  -- true for whole-home costs (rent, utilities, home insurance) that get the time-space percentage
  home_expense boolean not null default false,
  -- for things only partly used for the daycare, e.g. a family grocery run
  business_pct numeric(5,2) not null default 100,
  receipt_path text,
  created_at timestamptz not null default now()
);

-- One row per year: inputs to the time-space percentage.
create table if not exists public.time_space (
  provider_id uuid not null references public.providers (id) on delete cascade,
  year int not null,
  extra_hours numeric(8,2) not null default 0, -- prep, cleaning and paperwork with no children present
  total_sqft numeric(8,1) not null default 0,
  daycare_sqft numeric(8,1) not null default 0, -- areas used regularly for the daycare
  primary key (provider_id, year)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  child_id uuid references public.children (id) on delete cascade, -- empty for business documents
  title text not null,
  kind text not null default 'Other',
  expires_on date,
  file_path text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (provider_id, spent_on);
create index if not exists documents_expiry_idx on public.documents (provider_id, expires_on);

alter table public.expenses enable row level security;
alter table public.time_space enable row level security;
alter table public.documents enable row level security;

drop policy if exists "own rows" on public.expenses;
create policy "own rows" on public.expenses for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());
drop policy if exists "own rows" on public.time_space;
create policy "own rows" on public.time_space for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());
drop policy if exists "own rows" on public.documents;
create policy "own rows" on public.documents for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());

-- Private storage for receipt photos and document scans, one folder per provider.
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;

drop policy if exists "own files" on storage.objects;
create policy "own files" on storage.objects for all to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
