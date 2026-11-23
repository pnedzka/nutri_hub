-- Contract generator (moduł centrum /contracts): tabele i warstwa API w bazie nutri-central-db (blbcudymvackpudywdyy).
-- Uruchom raz w Supabase SQL Editor projektu nutri-central-db. Niczego nie zmienia w istniejących danych: tworzy
-- schemat contracts (tabele) i contracts_api (funkcje, które woła serwer centrum kluczem secret) oraz prywatny
-- bucket Storage "contracts" (skany podpisanych kontraktów, OWS/OWZ, podpisy).
--
-- Po uruchomieniu: Supabase → nutri-central-db → Project Settings → Data API → Exposed schemas: dopisać contracts_api.
-- Funkcje może wołać tylko service_role; anon i authenticated nie mają dostępu ani do funkcji, ani do tabel.
--
-- Obieg (decyzje Pawła z 23.11.2026): handlowiec generuje → administracja (Jadwiga) akceptuje po wprowadzeniu
-- zamówienia w enova → podpis Marcina Niećko (do 100 000 EUR netto) albo jego akceptacja i podpis członka zarządu
-- (powyżej) → podpisany: handlowiec pobiera kontrakt + OWS/OWZ, wysyła klientowi i wgrywa skan podpisany przez klienta.
-- Kto może wykonać krok, sprawdza serwer centrum (uprawnienia z profiles.apps); baza pilnuje kolejności statusów.
-- Numer: {nr}-{S|P}-{inicjały}-{rok}, kolejny dla typu, inicjałów i roku, od nowa co rok, kontynuuje numery intranetu.

create schema if not exists contracts;
revoke all on schema contracts from public, anon, authenticated;
grant usage on schema contracts to service_role;

create table if not exists contracts.contracts (
  id text primary key,                                   -- numer kontraktu, np. 151-S-MN-2026
  type char(1) not null check (type in ('S', 'P')),
  seq int not null,
  initials text not null,
  year int not null,
  status text not null check (status in ('admin_review', 'signature', 'board', 'signed', 'client_signed', 'returned', 'cancelled')),
  owner_email text not null,
  owner_name text not null,
  created_by_email text not null,
  submission_date date not null,
  company_id bigint references core.companies(id),
  company_name text not null,
  currency text not null,
  amount_net numeric not null,
  fx_eur_per_unit numeric not null,
  amount_eur numeric not null,
  board_required boolean not null,
  factoring boolean not null default false,
  data jsonb not null,                                   -- party, products, delivery, payment, documents (shared/contractsApi.ts)
  version int not null default 1,
  enova_order text,
  accepted_by jsonb,                                     -- {email, name, at}
  approved_by jsonb,                                     -- akceptacja Marcina przed zarządem
  signed_by jsonb,                                       -- {email, name, title, at}: podpis w PDF
  client_scan jsonb,                                     -- {path, fileName, at, email}
  return_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, initials, year, seq)
);
create index if not exists contracts_owner_idx on contracts.contracts (owner_email, created_at desc);
create index if not exists contracts_status_idx on contracts.contracts (status, created_at desc);

create table if not exists contracts.events (
  id bigserial primary key,
  contract_id text not null references contracts.contracts(id),
  at timestamptz not null default now(),
  actor_email text not null,
  actor_name text not null,
  action text not null,
  from_status text,
  to_status text,
  comment text,
  snapshot jsonb                                         -- treść kontraktu przy utworzeniu i przy każdej poprawce
);
create index if not exists contracts_events_idx on contracts.events (contract_id, at);

alter table contracts.contracts enable row level security;
alter table contracts.events enable row level security;
revoke all on all tables in schema contracts from public, anon, authenticated;
grant all on all tables in schema contracts to service_role;
grant usage on all sequences in schema contracts to service_role;

insert into storage.buckets (id, name, public) values ('contracts', 'contracts', false) on conflict (id) do nothing;

create schema if not exists contracts_api;
revoke all on schema contracts_api from public, anon, authenticated;
grant usage on schema contracts_api to service_role;

-- 1. Następny numer dla typu, inicjałów i roku: najwyższy z nowych kontraktów i z intranetu (raw.intranet_records,
--    także archived_…) plus 1.
create or replace function contracts_api.next_seq(p_type text, p_initials text, p_year int)
returns int language sql stable security definer set search_path = contracts, raw, public as $$
  select greatest(
    coalesce((select max(seq) from contracts.contracts where type = p_type and initials = p_initials and year = p_year), 0),
    coalesce((select max(split_part(regexp_replace(doc_id, '^archived_', ''), '-', 1)::int)
              from raw.intranet_records
              where collection = 'contracts'
                and regexp_replace(doc_id, '^archived_', '') ~ ('^\d+-' || p_type || '-' || p_initials || '-' || p_year || '$')), 0)
  ) + 1;
$$;

-- Kurs EUR za jednostkę waluty z dnia (albo ostatni wcześniejszy).
create or replace function contracts_api.eur_rate(p_currency text, p_date date)
returns numeric language sql stable security definer set search_path = core, public as $$
  select case when upper(p_currency) = 'EUR' then 1 else
    (select eur_per_unit from core.fx_rates where currency = upper(p_currency) and rate_date <= p_date order by rate_date desc limit 1) end;
$$;

-- Wspólne pola wiersza z treści formularza (p_data) i kwoty netto wyliczonej przez centrum.
create or replace function contracts_api.money(p_currency text, p_amount numeric, p_date date)
returns jsonb language plpgsql stable security definer set search_path = contracts, public as $$
declare v_rate numeric := contracts_api.eur_rate(p_currency, p_date);
begin
  if v_rate is null then raise exception 'There is no exchange rate for % yet. Try again tomorrow or tell your administrator.', p_currency using errcode = 'P0001'; end if;
  return jsonb_build_object('rate', v_rate, 'eur', round(p_amount * v_rate, 2), 'board', p_amount * v_rate > 100000);
end $$;

-- Jeden kontrakt dla przeglądarki.
create or replace function contracts_api.row_json(c contracts.contracts)
returns jsonb language sql stable security definer set search_path = contracts, public as $$
  select jsonb_build_object(
    'id', c.id, 'type', c.type, 'status', c.status, 'ownerEmail', c.owner_email, 'ownerName', c.owner_name,
    'createdByEmail', c.created_by_email, 'submissionDate', c.submission_date, 'companyId', c.company_id,
    'companyName', c.company_name, 'currency', c.currency, 'amountNet', c.amount_net, 'fxEurPerUnit', c.fx_eur_per_unit,
    'amountEur', c.amount_eur, 'boardRequired', c.board_required, 'factoring', c.factoring, 'data', c.data,
    'version', c.version, 'enovaOrder', c.enova_order, 'acceptedBy', c.accepted_by, 'approvedBy', c.approved_by,
    'signedBy', c.signed_by, 'clientScan', c.client_scan, 'returnComment', c.return_comment,
    'createdAt', c.created_at, 'updatedAt', c.updated_at);
$$;

-- 2. Nowy kontrakt. p_actor = {email, name}; p_owner = {email, name, initials}. Numer nadaje baza pod blokadą.
create or replace function contracts_api.create_contract(p_data jsonb, p_meta jsonb, p_owner jsonb, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = contracts, public as $$
declare
  v_type text := p_meta->>'type';
  v_initials text := upper(p_owner->>'initials');
  v_date date := (p_meta->>'submissionDate')::date;
  v_year int := extract(year from v_date)::int;
  v_seq int;
  v_money jsonb;
  v_row contracts.contracts;
begin
  if v_type not in ('S', 'P') then raise exception 'Contract type must be S or P.' using errcode = 'P0001'; end if;
  if v_initials !~ '^[A-Z]{1,4}$' then raise exception 'The owner''s initials are missing.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('contracts:' || v_type || v_initials || v_year));
  v_seq := contracts_api.next_seq(v_type, v_initials, v_year);
  v_money := contracts_api.money(p_meta->>'currency', (p_meta->>'amountNet')::numeric, v_date);
  insert into contracts.contracts (id, type, seq, initials, year, status, owner_email, owner_name, created_by_email,
    submission_date, company_id, company_name, currency, amount_net, fx_eur_per_unit, amount_eur, board_required, factoring, data)
  values (v_seq || '-' || v_type || '-' || v_initials || '-' || v_year, v_type, v_seq, v_initials, v_year, 'admin_review',
    lower(p_owner->>'email'), p_owner->>'name', lower(p_actor->>'email'), v_date, nullif(p_meta->>'companyId', '')::bigint,
    p_meta->>'companyName', p_meta->>'currency', (p_meta->>'amountNet')::numeric, (v_money->>'rate')::numeric,
    (v_money->>'eur')::numeric, (v_money->>'board')::boolean, coalesce((p_meta->>'factoring')::boolean, false), p_data)
  returning * into v_row;
  insert into contracts.events (contract_id, actor_email, actor_name, action, to_status, snapshot)
  values (v_row.id, lower(p_actor->>'email'), p_actor->>'name', 'created', v_row.status, p_data);
  return contracts_api.row_json(v_row);
end $$;

-- 3. Poprawka kontraktu zwróconego do handlowca: nowa wersja, obieg od początku. Numer, typ i właściciel zostają.
create or replace function contracts_api.update_contract(p_id text, p_data jsonb, p_meta jsonb, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = contracts, public as $$
declare v_row contracts.contracts; v_money jsonb;
begin
  select * into v_row from contracts.contracts where id = p_id for update;
  if not found then raise exception 'Contract % does not exist.', p_id using errcode = 'P0001'; end if;
  if v_row.status <> 'returned' then raise exception 'Only a contract returned for corrections can be edited.' using errcode = 'P0001'; end if;
  v_money := contracts_api.money(p_meta->>'currency', (p_meta->>'amountNet')::numeric, v_row.submission_date);
  update contracts.contracts set data = p_data, status = 'admin_review', version = version + 1,
    company_id = nullif(p_meta->>'companyId', '')::bigint, company_name = p_meta->>'companyName', currency = p_meta->>'currency',
    amount_net = (p_meta->>'amountNet')::numeric, fx_eur_per_unit = (v_money->>'rate')::numeric, amount_eur = (v_money->>'eur')::numeric,
    board_required = (v_money->>'board')::boolean, factoring = coalesce((p_meta->>'factoring')::boolean, false),
    accepted_by = null, approved_by = null, signed_by = null, enova_order = null, return_comment = null, updated_at = now()
  where id = p_id returning * into v_row;
  insert into contracts.events (contract_id, actor_email, actor_name, action, from_status, to_status, snapshot)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', 'corrected', 'returned', 'admin_review', p_data);
  return contracts_api.row_json(v_row);
end $$;

-- 4. Krok obiegu. p_action: accept | approve | sign | return | cancel | client_scan.
--    p_extra: accept {enovaOrder}; sign {title}; client_scan {path, fileName}.
create or replace function contracts_api.act(p_id text, p_action text, p_actor jsonb, p_comment text default null, p_extra jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path = contracts, public as $$
declare
  v_row contracts.contracts;
  v_from text;
  v_to text;
  v_who jsonb := jsonb_build_object('email', lower(p_actor->>'email'), 'name', p_actor->>'name', 'at', now());
begin
  select * into v_row from contracts.contracts where id = p_id for update;
  if not found then raise exception 'Contract % does not exist.', p_id using errcode = 'P0001'; end if;
  v_from := v_row.status;
  v_to := case
    when p_action = 'accept' and v_from = 'admin_review' then 'signature'
    when p_action = 'approve' and v_from = 'signature' and v_row.board_required then 'board'
    when p_action = 'sign' and ((v_from = 'signature' and not v_row.board_required) or v_from = 'board') then 'signed'
    when p_action = 'return' and v_from in ('admin_review', 'signature', 'board') then 'returned'
    when p_action = 'cancel' and v_from in ('admin_review', 'signature', 'board', 'returned') then 'cancelled'
    when p_action = 'client_scan' and v_from in ('signed', 'client_signed') then 'client_signed'
  end;
  if v_to is null then raise exception 'This step is not possible: the contract is already at another stage. Refresh the page.' using errcode = 'P0001'; end if;
  if p_action = 'return' and nullif(trim(p_comment), '') is null then raise exception 'Write what needs to be corrected.' using errcode = 'P0001'; end if;
  update contracts.contracts set status = v_to, updated_at = now(),
    accepted_by = case when p_action = 'accept' then v_who else accepted_by end,
    enova_order = case when p_action = 'accept' then nullif(trim(p_extra->>'enovaOrder'), '') else enova_order end,
    approved_by = case when p_action = 'approve' then v_who else approved_by end,
    signed_by = case when p_action = 'sign' then v_who || jsonb_build_object('title', coalesce(p_extra->>'title', '')) else signed_by end,
    return_comment = case when p_action = 'return' then trim(p_comment) else return_comment end,
    client_scan = case when p_action = 'client_scan'
      then jsonb_build_object('path', p_extra->>'path', 'fileName', p_extra->>'fileName', 'email', v_who->>'email', 'at', now()) else client_scan end
  where id = p_id returning * into v_row;
  insert into contracts.events (contract_id, actor_email, actor_name, action, from_status, to_status, comment)
  values (p_id, v_who->>'email', v_who->>'name', p_action, v_from, v_to, nullif(trim(p_comment), ''));
  return contracts_api.row_json(v_row);
end $$;

-- 5. Lista. p_owner: tylko kontrakty tej osoby (handlowiec); p_statuses: filtr; p_q: numer albo kontrahent.
create or replace function contracts_api.list(p_owner text default null, p_statuses text[] default null, p_q text default null,
  p_limit int default 50, p_offset int default 0)
returns jsonb language sql stable security definer set search_path = contracts, public as $$
  with f as (
    select * from contracts.contracts c
    where (p_owner is null or c.owner_email = lower(p_owner))
      and (p_statuses is null or c.status = any(p_statuses))
      and (nullif(trim(p_q), '') is null or c.id ilike '%' || trim(p_q) || '%' or c.company_name ilike '%' || trim(p_q) || '%' or c.owner_name ilike '%' || trim(p_q) || '%')
  )
  select jsonb_build_object('total', (select count(*) from f), 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'type', type, 'status', status, 'ownerEmail', owner_email, 'ownerName', owner_name,
      'companyName', company_name, 'currency', currency, 'amountNet', amount_net, 'amountEur', amount_eur,
      'boardRequired', board_required, 'submissionDate', submission_date, 'updatedAt', updated_at) order by created_at desc)
    from (select * from f order by created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) p), '[]'::jsonb));
$$;

-- 6. Jeden kontrakt z historią.
create or replace function contracts_api.get(p_id text)
returns jsonb language sql stable security definer set search_path = contracts, public as $$
  select contracts_api.row_json(c) || jsonb_build_object('events', coalesce((
    select jsonb_agg(jsonb_build_object('at', e.at, 'actorEmail', e.actor_email, 'actorName', e.actor_name, 'action', e.action,
      'fromStatus', e.from_status, 'toStatus', e.to_status, 'comment', e.comment) order by e.at)
    from contracts.events e where e.contract_id = c.id), '[]'::jsonb))
  from contracts.contracts c where c.id = p_id;
$$;

-- 7. Podpowiedzi kontrahentów: firmy z core.companies z danymi z intranetu (karta klienta, zapisane adresy dostaw)
--    i z ostatniego kontraktu w tym module. Wpisanie nowej nazwy też jest możliwe (bez companyId).
create or replace function contracts_api.company_search(p_q text, p_limit int default 10)
returns jsonb language sql stable security definer set search_path = contracts, core, raw, public as $$
  with hits as (
    select co.id, co.name, co.vat_id, co.country, co.intranet_client_id
    from core.companies co
    where length(trim(p_q)) >= 2 and co.status is distinct from 'merged'
      and (co.name ilike '%' || trim(p_q) || '%' or co.vat_id ilike '%' || trim(p_q) || '%')
    order by (co.intranet_client_id is null), (co.name ilike trim(p_q) || '%') desc, co.name
    limit least(greatest(p_limit, 1), 25)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'companyId', h.id, 'name', h.name, 'vatId', h.vat_id, 'country', h.country,
    'intranet', (select r.payload - '_id' - '_name' - '_createTime' - '_updateTime' - 'contractIds' - 'ownerId' - 'totalContracts'
                 from raw.intranet_records r where r.collection = 'clients' and r.doc_id = h.intranet_client_id),
    'last', (select jsonb_build_object('party', c.data->'party', 'delivery', c.data->'delivery')
             from contracts.contracts c where c.company_id = h.id order by c.created_at desc limit 1)
  )), '[]'::jsonb) from hits h;
$$;

-- 8. Podpowiedzi produktów (nazwy kanoniczne).
create or replace function contracts_api.product_search(p_q text, p_limit int default 15)
returns jsonb language sql stable security definer set search_path = core, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.canonical_name, 'enovaCode', p.enova_code)), '[]'::jsonb)
  from (select * from core.products
        where length(trim(p_q)) >= 2 and coalesce(is_active, true) and merged_into_id is null
          and canonical_name ilike '%' || trim(p_q) || '%'
        order by (canonical_name ilike trim(p_q) || '%') desc, canonical_name
        limit least(greatest(p_limit, 1), 30)) p;
$$;

-- 9. Podgląd numeru dla formularza (bez rezerwacji: ostateczny nadaje create_contract).
create or replace function contracts_api.preview_number(p_type text, p_initials text, p_year int)
returns text language sql stable security definer set search_path = contracts, public as $$
  select contracts_api.next_seq(p_type, upper(p_initials), p_year) || '-' || p_type || '-' || upper(p_initials) || '-' || p_year;
$$;

revoke all on all functions in schema contracts_api from public, anon, authenticated;
grant execute on all functions in schema contracts_api to service_role;
