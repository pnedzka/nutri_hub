-- Skrzynki handlowców podłączane samodzielnie w centrum aplikacji (My profile → Mailbox in the knowledge base).
-- Baza nutri-central-db (projekt blbcudymvackpudywdyy). Uruchom raz w Supabase SQL Editor; można uruchomić ponownie.
--
-- Po uruchomieniu: Supabase → nutri-central-db → Project Settings → Data API → Exposed schemas: dopisać mailbox_api.
-- Funkcje może wołać tylko service_role (klucz secret centrum, CENTRAL_DB_SECRET_KEY); anon i authenticated nie.
--
-- Jak to działa: handlowiec wpisuje w centrum hasło do swojej skrzynki. Serwer centrum sprawdza logowanie IMAP,
-- zakłada w n8n dane logowania (credential) i osobny workflow "Central DB - Mail ingest - <adres>" (Odebrane +
-- Wysłane → raw.emails, tak jak dla j.chrobak@), a tutaj zapisuje tylko stan podłączenia i identyfikatory z n8n.
-- HASŁO NIE TRAFIA DO TEJ BAZY: zna je tylko n8n (szyfruje dane logowania).
--
-- Tabele:
--   core.mailbox_connections      stan podłączenia skrzynki z centrum (jedna na adres)
--   core.mailbox_connect_attempts próby podłączenia (limit nieudanych prób: 5 na 15 minut na skrzynkę)
-- Podłączenie dopisuje skrzynkę do core.mailbox_owners (zespół sales, oferty do core), więc klasyfikacja maili
-- i propozycje sprzedażowe traktują ją jak skrzynkę j.chrobak@.

create schema if not exists mailbox_api;
revoke all on schema mailbox_api from public, anon, authenticated;
grant usage on schema mailbox_api to service_role;

-- ---------------------------------------------------------------------------
-- 1. Rejestr skrzynek: kolumny jak w mail_knowledge_v2.sql (te same definicje, więc kolejność skryptów nie gra roli)
-- ---------------------------------------------------------------------------
alter table core.mailbox_owners add column if not exists offers_via text not null default 'core';
alter table core.mailbox_owners add column if not exists collected_since date;
alter table core.mailbox_owners add column if not exists note text;
do $$ begin
  alter table core.mailbox_owners add constraint mailbox_owners_offers_via_check check (offers_via in ('core', 'airtable', 'none'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Stan podłączenia i próby
-- ---------------------------------------------------------------------------
create table if not exists core.mailbox_connections (
  mailbox text primary key,
  hub_user_id uuid not null,                 -- konto w centrum (profiles.id), które podłączyło skrzynkę
  status text not null check (status in ('connected', 'disconnected')),
  n8n_credential_id text,
  n8n_workflow_id text,
  sent_folder text,                          -- folder Wysłane na serwerze poczty (np. Sent)
  history_since date,                        -- od kiedy pobrano historię przy pierwszym podłączeniu
  connected_at timestamptz,
  connected_by text,
  disconnected_at timestamptz,
  disconnected_by text,
  updated_at timestamptz not null default now()
);
alter table core.mailbox_connections enable row level security;
comment on table core.mailbox_connections is
  'Skrzynki podłączone przez pracowników w centrum aplikacji (mailbox_api). Hasła są tylko w n8n, nie tutaj.';

create table if not exists core.mailbox_connect_attempts (
  id bigint generated always as identity primary key,
  mailbox text not null,
  ok boolean not null,
  reason text,                               -- 'connected' | 'wrong_password' | 'unreachable' | 'n8n' | ...
  at timestamptz not null default now()
);
create index if not exists mailbox_connect_attempts_mailbox_at on core.mailbox_connect_attempts (mailbox, at desc);
alter table core.mailbox_connect_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Funkcje dla serwera centrum
-- ---------------------------------------------------------------------------

-- Stan jednej skrzynki. source: 'hub' (podłączona w centrum), 'manual' (dodana ręcznie w n8n, np. j.chrobak@),
-- 'none'. Liczby maili z raw.emails. Identyfikatory n8n są tylko dla serwera; do przeglądarki nie trafiają.
create or replace function mailbox_api.status(p_mailbox text)
returns jsonb language sql stable security definer set search_path = core, raw, public as $$
  with m as (select lower(trim(p_mailbox)) as mailbox),
  c as (select mc.* from core.mailbox_connections mc, m where mc.mailbox = m.mailbox),
  o as (select mo.* from core.mailbox_owners mo, m where mo.mailbox = m.mailbox),
  e as (
    select count(*) filter (where x.direction = 'in') as mails_in,
           count(*) filter (where x.direction = 'out') as mails_out,
           max(x.sent_at) filter (where x.direction = 'in') as last_in_at,
           max(x.sent_at) filter (where x.direction = 'out') as last_out_at,
           count(*) filter (where x.processed_at is null) as waiting_for_ai
    from raw.emails x, m where x.mailbox = m.mailbox)
  select jsonb_build_object(
    'mailbox', (select mailbox from m),
    'source', case when exists (select 1 from c) then 'hub' when exists (select 1 from o) then 'manual' else 'none' end,
    'status', coalesce((select status from c), case when exists (select 1 from o) then 'connected' else 'disconnected' end),
    'credentialId', (select n8n_credential_id from c),
    'workflowId', (select n8n_workflow_id from c),
    'sentFolder', (select sent_folder from c),
    'historySince', coalesce((select history_since from c), (select collected_since from o)),
    'connectedAt', (select connected_at from c),
    'disconnectedAt', (select disconnected_at from c),
    'mailsIn', e.mails_in, 'mailsOut', e.mails_out,
    'lastInAt', e.last_in_at, 'lastOutAt', e.last_out_at,
    'waitingForAi', e.waiting_for_ai)
  from e
$$;

-- Przed sprawdzeniem hasła: limit nieudanych prób (5 na 15 minut na skrzynkę), potem bieżący stan.
create or replace function mailbox_api.connect_begin(p_mailbox text)
returns jsonb language plpgsql security definer set search_path = core, public as $$
declare v_failed int;
begin
  select count(*) into v_failed from core.mailbox_connect_attempts
  where mailbox = lower(trim(p_mailbox)) and not ok and at > now() - interval '15 minutes'
    and at > coalesce((select max(a.at) from core.mailbox_connect_attempts a
                       where a.mailbox = lower(trim(p_mailbox)) and a.ok), '-infinity');
  if v_failed >= 5 then
    raise exception 'Too many unsuccessful attempts. Wait 15 minutes and try again.' using errcode = 'P0001';
  end if;
  return mailbox_api.status(p_mailbox);
end $$;

-- Nieudana próba (złe hasło, serwer poczty nie odpowiada, błąd n8n). Bez hasła i bez treści błędu z serwera.
create or replace function mailbox_api.connect_failed(p_mailbox text, p_reason text)
returns void language sql security definer set search_path = core, public as $$
  insert into core.mailbox_connect_attempts (mailbox, ok, reason) values (lower(trim(p_mailbox)), false, left(p_reason, 40));
$$;

-- Po udanym podłączeniu w n8n: zapis stanu, pracownik w core.employees (wg adresu) i skrzynka w core.mailbox_owners.
create or replace function mailbox_api.connect_finish(
  p_mailbox text, p_hub_user_id uuid, p_full_name text, p_credential_id text, p_workflow_id text,
  p_sent_folder text, p_history_since date, p_by text)
returns jsonb language plpgsql security definer set search_path = core, public as $$
declare
  v_mailbox text := lower(trim(p_mailbox));
  v_employee bigint;
begin
  select id into v_employee from core.employees where lower(email::text) = v_mailbox limit 1;
  if v_employee is null then
    insert into core.employees (full_name, email, department, is_active)
    values (coalesce(nullif(trim(p_full_name), ''), split_part(v_mailbox, '@', 1)), v_mailbox, 'sales', true)
    returning id into v_employee;
  end if;

  insert into core.mailbox_owners (mailbox, employee_id, team, offers_via, collected_since, note)
  values (v_mailbox, v_employee, 'sales', 'core', p_history_since, 'Podłączona przez pracownika w centrum aplikacji')
  on conflict (mailbox) do update set employee_id = coalesce(core.mailbox_owners.employee_id, excluded.employee_id),
    collected_since = coalesce(core.mailbox_owners.collected_since, excluded.collected_since);

  insert into core.mailbox_connections as mc (mailbox, hub_user_id, status, n8n_credential_id, n8n_workflow_id,
    sent_folder, history_since, connected_at, connected_by, disconnected_at, disconnected_by, updated_at)
  values (v_mailbox, p_hub_user_id, 'connected', p_credential_id, p_workflow_id, p_sent_folder, p_history_since,
    now(), lower(p_by), null, null, now())
  on conflict (mailbox) do update set hub_user_id = excluded.hub_user_id, status = 'connected',
    n8n_credential_id = excluded.n8n_credential_id, n8n_workflow_id = excluded.n8n_workflow_id,
    sent_folder = excluded.sent_folder, history_since = coalesce(mc.history_since, excluded.history_since),
    connected_at = now(), connected_by = excluded.connected_by, disconnected_at = null, disconnected_by = null,
    updated_at = now();

  insert into core.mailbox_connect_attempts (mailbox, ok, reason) values (v_mailbox, true, 'connected');
  return mailbox_api.status(v_mailbox);
end $$;

-- Odłączenie (serwer centrum usuwa wcześniej workflow i dane logowania w n8n). Pobrane maile zostają w bazie.
create or replace function mailbox_api.disconnect(p_mailbox text, p_by text)
returns jsonb language plpgsql security definer set search_path = core, public as $$
begin
  update core.mailbox_connections set status = 'disconnected', n8n_credential_id = null, n8n_workflow_id = null,
    disconnected_at = now(), disconnected_by = lower(p_by), updated_at = now()
  where mailbox = lower(trim(p_mailbox));
  return mailbox_api.status(p_mailbox);
end $$;

-- Przegląd dla adminów centrum: wszystkie skrzynki (z centrum i dodane ręcznie), bez identyfikatorów n8n.
create or replace function mailbox_api.status_all()
returns jsonb language sql stable security definer set search_path = core, raw, public as $$
  with boxes as (
    select mailbox from core.mailbox_owners union select mailbox from core.mailbox_connections
  ), e as (
    select x.mailbox, count(*) filter (where x.direction = 'in') as mails_in,
           count(*) filter (where x.direction = 'out') as mails_out,
           max(x.sent_at) filter (where x.direction = 'in') as last_in_at,
           max(x.sent_at) filter (where x.direction = 'out') as last_out_at
    from raw.emails x join boxes b on b.mailbox = x.mailbox group by x.mailbox)
  select coalesce(jsonb_agg(jsonb_build_object(
    'mailbox', b.mailbox,
    'owner', emp.full_name,
    'team', mo.team,
    'source', case when mc.mailbox is not null then 'hub' else 'manual' end,
    'status', coalesce(mc.status, 'connected'),
    'connectedAt', mc.connected_at,
    'historySince', coalesce(mc.history_since, mo.collected_since),
    'mailsIn', coalesce(e.mails_in, 0), 'mailsOut', coalesce(e.mails_out, 0),
    'lastInAt', e.last_in_at, 'lastOutAt', e.last_out_at) order by b.mailbox), '[]'::jsonb)
  from boxes b
  left join core.mailbox_connections mc on mc.mailbox = b.mailbox
  left join core.mailbox_owners mo on mo.mailbox = b.mailbox
  left join core.employees emp on emp.id = mo.employee_id
  left join e on e.mailbox = b.mailbox
$$;

revoke all on all functions in schema mailbox_api from public, anon, authenticated;
grant execute on all functions in schema mailbox_api to service_role;
revoke all on core.mailbox_connections, core.mailbox_connect_attempts from public, anon, authenticated;

select 'ok' as wynik, (select count(*) from core.mailbox_owners) as skrzynki_w_rejestrze;
