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
