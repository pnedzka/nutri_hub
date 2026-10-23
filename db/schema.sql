-- Tables of the Nutri Partners hub (News, Leave, profiles) in the shared Supabase project
-- (nutri_documentation/db/schema.sql has the rest, including profiles).
-- Apply to nutri-dev first; to production before merging the release into main (CLAUDE.md, "Środowiska").
-- Every table has row level security on and no policies (except reading offices): only the hub's server (secret
-- key) reads and writes them, after checking who is asking (api/_lib/leave.ts, api/_lib/news.ts, api/people.ts).

-- Access: the modules are apps in profiles.apps ('news', 'leave'). Accounts that had the planned intranet get both
-- (run once; harmless to repeat).
update public.profiles
set apps = (select array_agg(distinct a order by a) from unnest(apps || array['news', 'leave']::text[]) as a)
where 'intranet' = any (apps) and not (apps @> array['news', 'leave']::text[]);

-- Leave: per-employee settings, set by administrators in Leave → Employees.
create table if not exists public.leave_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Approves this person's requests (administrators can too).
  manager_id uuid references public.profiles (id) on delete set null,
  -- Days of annual leave for each new year, in half days.
  annual_days numeric(4, 1) not null default 26 check (annual_days >= 0 and annual_days <= 60 and annual_days * 2 = floor(annual_days * 2)),
  -- First year tracked here, and the days carried over into it from before (the old intranet).
  start_year int not null default extract(year from now())::int check (start_year between 2020 and 2100),
  carried_over numeric(5, 1) not null default 0 check (carried_over >= 0 and carried_over * 2 = floor(carried_over * 2)),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  check (manager_id is null or manager_id <> user_id)
);

-- Leave: days of annual leave granted for a year. Written from leave_settings.annual_days when a year is first
-- used, so a later change of annual_days does not rewrite past years; administrators can adjust a year.
create table if not exists public.leave_allowances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  year int not null check (year between 2020 and 2100),
  days numeric(4, 1) not null check (days >= 0 and days <= 60 and days * 2 = floor(days * 2)),
  primary key (user_id, year)
);

-- Leave: requests and leave entered by administrators. Days are counted by the server (working days, without
-- Polish public holidays); a request stays within one calendar year.
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('vacation', 'on_demand', 'occasional', 'childcare', 'unpaid', 'sick')),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  days numeric(4, 1) not null check (days > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (extract(year from start_date) = extract(year from end_date)),
  check (not half_day or start_date = end_date)
);

create index if not exists leave_requests_user_start on public.leave_requests (user_id, start_date);
create index if not exists leave_requests_active_dates on public.leave_requests (start_date, end_date) where status in ('pending', 'approved');
create index if not exists leave_settings_manager on public.leave_settings (manager_id);

alter table public.leave_settings enable row level security;
alter table public.leave_allowances enable row level security;
alter table public.leave_requests enable row level security;

-- News: editors chosen by administrators in News → Editors (administrators always publish).
create table if not exists public.news_editors (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- News: posts. Body is plain text (paragraphs, links); images are paths in the private "intranet" bucket with
-- their size, shown through signed links.
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.news_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.news_posts (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.news_likes (
  post_id uuid not null references public.news_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists news_posts_created on public.news_posts (created_at desc);
create index if not exists news_comments_post on public.news_comments (post_id, created_at);
create index if not exists news_likes_user on public.news_likes (user_id);

alter table public.news_editors enable row level security;
alter table public.news_posts enable row level security;
alter table public.news_comments enable row level security;
alter table public.news_likes enable row level security;

-- Files: private bucket, no storage policies (the server signs uploads and downloads).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('intranet', 'intranet', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Profiles (User management, My profile, Team): company contact details of each account. The login e-mail is the
-- company e-mail. Only the hub's server writes these columns (profiles has no update policy); the person reads
-- their own row (profiles_read), e.g. the signature generator fills the form from it.
create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  -- Full address for e-mail signatures, in English (e.g. "…, 35-021 Rzeszów, Poland").
  address text not null default '' check (char_length(address) <= 200),
  created_at timestamptz not null default now()
);

alter table public.offices enable row level security;
-- The list of offices is not secret: every signed-in person may read it (the signature generator does).
drop policy if exists offices_read on public.offices;
create policy offices_read on public.offices for select to authenticated using (true);

insert into public.offices (name, address)
-- The offices of 21.10.2026 (owner's list); administrators change them in User management → Offices.
values ('Rzeszów', 'Lwowska 114/2, Rzeszów, Poland'), ('Lublin', 'Lubelskich Olimpijczyków 1/8, Lublin, Poland')
on conflict (name) do nothing;

alter table public.profiles add column if not exists job_title text check (char_length(job_title) <= 100);
alter table public.profiles add column if not exists department text check (char_length(department) <= 100);
alter table public.profiles add column if not exists phone text check (char_length(phone) <= 30);
alter table public.profiles add column if not exists mobile text check (char_length(mobile) <= 30);
alter table public.profiles add column if not exists linkedin_url text check (char_length(linkedin_url) <= 300);
alter table public.profiles add column if not exists office_id uuid references public.offices (id) on delete set null;
-- Square photo in the private "intranet" bucket (avatars/<user id>/<random>.jpg), shown through signed links.
alter table public.profiles add column if not exists avatar_path text check (char_length(avatar_path) <= 200);
-- Deactivated accounts cannot sign in (the account is also banned in Supabase Auth) and are hidden from Team and the
-- modules; their documents, leave and posts stay. Reactivating restores access.
alter table public.profiles add column if not exists deactivated_at timestamptz;

-- Who changed an account and when (User management → Edit → History). Written by the hub's server only.
create table if not exists public.profile_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 40),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists profile_events_profile on public.profile_events (profile_id, created_at desc);
alter table public.profile_events enable row level security;

-- Phone calls analyser (/calls, administrators only): monthly usage of the employees' phone numbers from T-Mobile
-- invoices. The browser parses the PDF (shared/tmobile.ts) and the server keeps only the numbers that match an
-- employee's profiles.mobile (api/_lib/calls.ts); other numbers on the invoice are not stored. The person is written
-- into each row at import, so a later change of a number in a profile does not rewrite past months.
-- Usage of phones is personal data (monitoring of work): no policies, only the hub's server reads and writes.
create table if not exists public.phone_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique check (invoice_number ~ '^[0-9]{6,20}$'),
  customer_number text check (char_length(customer_number) <= 30),
  period_start date not null,
  period_end date not null,
  issue_date date not null,
  source_file_name text check (char_length(source_file_name) <= 200),
  uploaded_by uuid references public.profiles (id) on delete set null,
  imported_at timestamptz not null default now(),
  check (period_end >= period_start)
);

-- The employees' numbers on an invoice, also those without any usage (a number without a list of calls made none;
-- a number missing from the invoice is "not on the invoice").
create table if not exists public.phone_invoice_lines (
  invoice_id uuid not null references public.phone_invoices (id) on delete cascade,
  msisdn text not null check (msisdn ~ '^[0-9]{9}$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (invoice_id, msisdn)
);

-- Monthly totals per number and category, as T-Mobile reports them (no single calls on the invoice).
create table if not exists public.phone_usage (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.phone_invoices (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  msisdn text not null check (msisdn ~ '^[0-9]{9}$'),
  kind text not null check (kind in ('voice_out', 'voice_out_roaming', 'voice_in_roaming', 'sms', 'mms', 'sms_roaming', 'data', 'data_roaming', 'premium')),
  category text not null check (char_length(category) <= 200),
  roaming_operator text check (char_length(roaming_operator) <= 200),
  event_count integer not null check (event_count >= 0),
  duration_s integer,
  data_mb numeric(14, 3),
  paid_duration_s integer,
  paid_data_mb numeric(14, 3),
  paid_count integer,
  net_amount numeric(10, 2) not null default 0
);

create unique index if not exists phone_usage_uq on public.phone_usage (invoice_id, msisdn, category, coalesce(roaming_operator, ''));
create index if not exists phone_usage_profile on public.phone_usage (profile_id);
create index if not exists phone_invoice_lines_profile on public.phone_invoice_lines (profile_id);
create index if not exists phone_invoices_period on public.phone_invoices (period_start);

-- Empty for now: single calls, if T-Mobile's itemised billing is imported later.
create table if not exists public.phone_call_records (
  id bigint generated always as identity primary key,
  invoice_id uuid references public.phone_invoices (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  msisdn text not null check (msisdn ~ '^[0-9]{9}$'),
  started_at timestamptz not null,
  direction text not null check (direction in ('out', 'in')),
  counterpart text check (char_length(counterpart) <= 40),
  network text check (char_length(network) <= 100),
  duration_s integer not null default 0 check (duration_s >= 0),
  is_roaming boolean not null default false
);

create index if not exists phone_call_records_profile on public.phone_call_records (profile_id, started_at);

alter table public.phone_invoices enable row level security;
alter table public.phone_invoice_lines enable row level security;
alter table public.phone_usage enable row level security;
alter table public.phone_call_records enable row level security;

-- Imports an invoice in one transaction (supabase-js has none): the invoice, the employees' numbers and their usage.
-- payload: { invoice: { invoice_number, customer_number, period_start, period_end, issue_date, source_file_name,
-- uploaded_by }, lines: [{ msisdn, profile_id }], usage: [{ msisdn, profile_id, kind, category, ... }] }.
-- An invoice already imported stops the import (unique_violation), unless replace_existing: then it is replaced.
create or replace function public.import_phone_invoice(payload jsonb, replace_existing boolean default false)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  head jsonb := payload -> 'invoice';
  existing uuid;
  created uuid;
begin
  select id into existing from public.phone_invoices where invoice_number = head ->> 'invoice_number' for update;
  if existing is not null then
    if not replace_existing then
      raise exception 'Invoice % is already imported.', head ->> 'invoice_number' using errcode = 'unique_violation';
    end if;
    delete from public.phone_invoices where id = existing;
  end if;

  insert into public.phone_invoices (invoice_number, customer_number, period_start, period_end, issue_date, source_file_name, uploaded_by)
  values (
    head ->> 'invoice_number',
    head ->> 'customer_number',
    (head ->> 'period_start')::date,
    (head ->> 'period_end')::date,
    (head ->> 'issue_date')::date,
    head ->> 'source_file_name',
    (head ->> 'uploaded_by')::uuid
  )
  returning id into created;

  insert into public.phone_invoice_lines (invoice_id, msisdn, profile_id)
  select created, l.msisdn, l.profile_id
  from jsonb_to_recordset(coalesce(payload -> 'lines', '[]')) as l (msisdn text, profile_id uuid);

  insert into public.phone_usage (invoice_id, profile_id, msisdn, kind, category, roaming_operator, event_count, duration_s, data_mb, paid_duration_s, paid_data_mb, paid_count, net_amount)
  select created, u.profile_id, u.msisdn, u.kind, u.category, u.roaming_operator, u.event_count, u.duration_s, u.data_mb, u.paid_duration_s, u.paid_data_mb, u.paid_count, u.net_amount
  from jsonb_to_recordset(coalesce(payload -> 'usage', '[]')) as u (
    msisdn text, profile_id uuid, kind text, category text, roaming_operator text, event_count integer, duration_s integer,
    data_mb numeric, paid_duration_s integer, paid_data_mb numeric, paid_count integer, net_amount numeric
  );

  return created;
end;
$$;

revoke execute on function public.import_phone_invoice(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_phone_invoice(jsonb, boolean) to service_role;

-- Monthly KPIs per person, for SQL by hand (the app computes its report in shared/calls.ts). Outgoing calls without
-- "Połączenia inne" (not calls to people; NOT_COUNTED in shared/calls.ts).
create or replace view public.v_phone_monthly_kpi with (security_invoker = on) as
select u.profile_id, p.full_name, p.job_title, i.invoice_number, i.period_start, i.period_end,
       sum(u.event_count) filter (where u.kind = 'voice_out_roaming' or (u.kind = 'voice_out' and u.category <> 'Połączenia inne')) as outgoing_calls,
       round(sum(u.duration_s) filter (where u.kind = 'voice_out_roaming' or (u.kind = 'voice_out' and u.category <> 'Połączenia inne')) / 60.0, 1) as outgoing_minutes,
       round(sum(u.duration_s) filter (where u.kind = 'voice_out_roaming' or (u.kind = 'voice_out' and u.category <> 'Połączenia inne'))
             / nullif(sum(u.event_count) filter (where u.kind = 'voice_out_roaming' or (u.kind = 'voice_out' and u.category <> 'Połączenia inne')), 0), 0) as avg_call_seconds,
       sum(u.event_count) filter (where u.kind in ('sms', 'sms_roaming')) as sms_sent,
       round(sum(u.data_mb) filter (where u.kind in ('data', 'data_roaming')), 0) as data_mb,
       sum(u.net_amount) as variable_cost_net
from public.phone_invoices i
join public.phone_usage u on u.invoice_id = i.id
join public.profiles p on p.id = u.profile_id
group by u.profile_id, p.full_name, p.job_title, i.id;

revoke all on public.v_phone_monthly_kpi from anon, authenticated;
