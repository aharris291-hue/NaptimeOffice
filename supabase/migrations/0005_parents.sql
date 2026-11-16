-- Naptime Office: the parent side (parent logins, photos, announcements, messages).
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

-- Parents sign up with role "parent", so they don't get a provider account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'role', '') = 'parent' then
    return new;
  end if;
  insert into public.providers (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

alter table public.contacts
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists invited_at timestamptz,
  add column if not exists pin_hash text;

alter table public.providers
  add column if not exists dnd_start time,
  add column if not exists dnd_end time,
  add column if not exists dnd_note text not null default '';

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  title text not null,
  body text not null default '',
  publish_at timestamptz not null default now(), -- a future time schedules it
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  path text not null unique,
  caption text not null default '',
  child_ids uuid[] not null default '{}',
  taken_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  from_parent boolean not null,
  sender_name text not null default '',
  body text not null check (length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists photos_provider_idx on public.photos (provider_id, taken_on);
create index if not exists messages_family_idx on public.messages (provider_id, family_id, created_at);
create index if not exists contacts_user_idx on public.contacts (user_id);

alter table public.announcements enable row level security;
alter table public.photos enable row level security;
alter table public.messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['announcements','photos','messages'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (provider_id = auth.uid()) with check (provider_id = auth.uid())', t);
  end loop;
end $$;

-- Helpers for parent access. A provider account never counts as a parent.
create or replace function public.my_family_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.family_id from public.contacts c
  where c.user_id = auth.uid()
    and not exists (select 1 from public.providers p where p.id = auth.uid());
$$;

create or replace function public.my_child_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select ch.id from public.children ch where ch.family_id in (select public.my_family_ids());
$$;

create or replace function public.my_provider_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.provider_id from public.families f where f.id in (select public.my_family_ids());
$$;

-- Links a newly signed-in parent to every contact the provider invited with their email.
create or replace function public.claim_parent_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists (select 1 from public.providers p where p.id = auth.uid()) then
    return 0;
  end if;
  update public.contacts
     set user_id = auth.uid()
   where lower(email) = lower(auth.jwt()->>'email')
     and invited_at is not null
     and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Read-only access for parents to their own family's information.
drop policy if exists "parent read" on public.providers;
create policy "parent read" on public.providers for select using (id in (select public.my_provider_ids()));
drop policy if exists "parent read" on public.families;
create policy "parent read" on public.families for select using (id in (select public.my_family_ids()));
drop policy if exists "parent read" on public.contacts;
create policy "parent read" on public.contacts for select using (family_id in (select public.my_family_ids()));
drop policy if exists "parent read" on public.children;
create policy "parent read" on public.children for select using (family_id in (select public.my_family_ids()));
drop policy if exists "parent read" on public.invoices;
create policy "parent read" on public.invoices for select using (family_id in (select public.my_family_ids()) and status = 'open');
drop policy if exists "parent read" on public.payments;
create policy "parent read" on public.payments for select using (family_id in (select public.my_family_ids()));

do $$
declare t text;
begin
  foreach t in array array['attendance','daily_entries','incidents','supplies','medications','med_doses'] loop
    execute format('drop policy if exists "parent read" on public.%I', t);
    execute format('create policy "parent read" on public.%I for select using (child_id in (select public.my_child_ids()))', t);
  end loop;
end $$;

drop policy if exists "parent read" on public.announcements;
create policy "parent read" on public.announcements for select
  using (provider_id in (select public.my_provider_ids()) and publish_at <= now());
drop policy if exists "parent read" on public.photos;
create policy "parent read" on public.photos for select
  using (child_ids && array(select public.my_child_ids()));
drop policy if exists "parent read" on public.messages;
create policy "parent read" on public.messages for select using (family_id in (select public.my_family_ids()));
drop policy if exists "parent send" on public.messages;
create policy "parent send" on public.messages for insert with check (
  from_parent and read_at is null
  and family_id in (select public.my_family_ids())
  and provider_id = (select f.provider_id from public.families f where f.id = family_id)
);

-- Photo storage: providers manage their own folder; parents can view photos of their children.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
drop policy if exists "own photos" on storage.objects;
create policy "own photos" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "parent photos" on storage.objects;
create policy "parent photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p where p.path = storage.objects.name and p.child_ids && array(select public.my_child_ids())
  ));
-- Parents may also see pick-up photos of their own family's contacts.
drop policy if exists "parent pickup photos" on storage.objects;
create policy "parent pickup photos" on storage.objects for select to authenticated
  using (bucket_id = 'pickup-photos' and exists (
    select 1 from public.contacts c where c.photo_path = storage.objects.name and c.family_id in (select public.my_family_ids())
  ));

-- Marks the other side's messages in a family thread as read (works for parents and providers).
create or replace function public.mark_messages_read(fam uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if fam in (select public.my_family_ids()) then
    update public.messages set read_at = now() where family_id = fam and not from_parent and read_at is null;
  elsif exists (select 1 from public.families f where f.id = fam and f.provider_id = auth.uid()) then
    update public.messages set read_at = now() where family_id = fam and from_parent and read_at is null;
  end if;
end $$;
