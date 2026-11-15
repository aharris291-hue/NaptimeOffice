-- Naptime Office: invoices and payments.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

alter table public.providers
  add column if not exists payment_info text not null default '',
  add column if not exists invoice_terms_days int not null default 7,
  add column if not exists next_invoice_number int not null default 1001;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null, -- who this invoice is addressed to (split billing)
  bill_to text not null default '',
  number text not null,
  period_start date not null,
  period_end date not null,
  issue_date date not null default current_date,
  due_date date,
  -- [{"description":"Weekly care: Mia","qty":1,"rate":250}]
  items jsonb not null default '[]'::jsonb,
  share numeric(5,2) not null default 100, -- percent of the family's charges on this invoice
  total numeric(10,2) not null default 0,
  status text not null default 'open' check (status in ('open','void')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  paid_by text not null default '',
  amount numeric(10,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'Cash',
  reference text not null default '',
  created_at timestamptz not null default now()
);

-- Remembers which invoice a late fee went on, so each fee is billed exactly once.
alter table public.attendance
  add column if not exists late_fee_invoice_id uuid references public.invoices (id) on delete set null;

create index if not exists invoices_family_idx on public.invoices (provider_id, family_id, issue_date);
create index if not exists payments_family_idx on public.payments (provider_id, family_id, paid_on);
create index if not exists attendance_date_idx on public.attendance (provider_id, care_date);

alter table public.invoices enable row level security;
alter table public.payments enable row level security;

drop policy if exists "own rows" on public.invoices;
create policy "own rows" on public.invoices for all
  using (provider_id = auth.uid()) with check (provider_id = auth.uid());
drop policy if exists "own rows" on public.payments;
create policy "own rows" on public.payments for all
  using (provider_id = auth.uid()) with check (provider_id = auth.uid());

-- Hands out the next invoice number for the signed-in provider, safely even with two devices.
create or replace function public.take_invoice_numbers(how_many int)
returns int language sql security invoker as $$
  update public.providers
     set next_invoice_number = next_invoice_number + how_many
   where id = auth.uid()
  returning next_invoice_number - how_many;
$$;
