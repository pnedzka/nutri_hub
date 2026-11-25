-- Complaints (moduł centrum /complaints): reklamacje klientów, w bazie nutri-central-db (blbcudymvackpudywdyy).
-- Uruchom raz w Supabase SQL Editor projektu nutri-central-db (można uruchomić ponownie: niczego nie usuwa). Tworzy
-- schemat complaints (tabele), complaints_api (funkcje, które woła serwer centrum kluczem secret) i prywatny bucket
-- Storage "complaints" (zdjęcia, protokoły, raporty).
--
-- Po uruchomieniu: Supabase → nutri-central-db → Project Settings → Data API → Exposed schemas: dopisać complaints_api.
-- Funkcje może wołać tylko service_role; anon i authenticated nie mają dostępu ani do funkcji, ani do tabel.
--
-- Decyzje Pawła z 25.11.2026: reklamację zakłada każdy z uprawnieniem complaints (od numeru kontraktu sprzedaży; klient,
-- produkt i handlowiec z kontraktu: moduł Contracts albo stary intranet), prowadzi administracja (complaints-admin:
-- Jadwiga Woźny). Kto może wykonać krok, sprawdza serwer centrum (shared/complaintsApi.ts); baza pilnuje, żeby status
-- zmieniał się z tego, który widział użytkownik. Numer C-rok-kolejny, od nowa co rok. Kwoty opcjonalne.

create schema if not exists complaints;
revoke all on schema complaints from public, anon, authenticated;
grant usage on schema complaints to service_role;

create table if not exists complaints.complaints (
  id text primary key,                                   -- C-2026-001
  year int not null,
  seq int not null,
  status text not null check (status in ('open', 'investigating', 'with_supplier', 'resolved', 'closed', 'cancelled')),
  type text not null check (type in ('quality', 'foreign_matter', 'packaging', 'quantity', 'documents', 'late_delivery', 'other')),
  sales_contract_id text not null,
  purchase_contract_id text not null default '',
  client_name text not null default '',
  supplier_name text not null default '',
  product_name text not null default '',
  trader_email text,                                     -- właściciel kontraktu sprzedaży (gdy znany e-mail)
  trader_name text,
  purchase_owner_email text,                             -- właściciel kontraktu zakupu
  purchase_owner_name text,
  handler_email text not null,                           -- prowadzący; domyślnie zakładający
  handler_name text not null,
  created_by_email text not null,
  created_by_name text not null,
  batch_number text not null default '',
  quantity_kg numeric,
  description text not null,
  client_response_due date,
  supplier_ref text not null default '',
  supplier_reported_on date,
  client_claimed numeric,
  client_agreed numeric,
  client_currency text not null default 'EUR',
  supplier_claimed numeric,
  supplier_accepted numeric,
  supplier_currency text not null default 'EUR',
  outcome text check (outcome in ('accepted', 'partly_accepted', 'rejected', 'withdrawn')),
  settlement text check (settlement in ('credit_note', 'replacement', 'discount', 'return', 'none')),
  resolution_notes text not null default '',
  resolved_at timestamptz,
  legacy_id text unique,                                 -- numer ze starego intranetu (R/2026/10/015)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, seq)
);
create index if not exists complaints_status_idx on complaints.complaints (status, updated_at desc);
create index if not exists complaints_sales_idx on complaints.complaints (sales_contract_id);

create table if not exists complaints.events (
  id bigserial primary key,
  complaint_id text not null references complaints.complaints(id),
  at timestamptz not null default now(),
  actor_email text not null,
  actor_name text not null,
  action text not null,                                  -- created | status | details | assigned | comment | file_added | file_removed | imported
  from_status text,
  to_status text,
  comment text
);
create index if not exists complaints_events_idx on complaints.events (complaint_id, at);

create table if not exists complaints.files (
  id bigserial primary key,
  complaint_id text not null references complaints.complaints(id),
  category text not null check (category in ('photos', 'delivery_protocol', 'lab_report', 'correspondence', 'final_report', 'other')),
  file_name text not null,
  path text not null unique,
  uploaded_by_email text not null,
  uploaded_by_name text not null,
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz                                 -- usunięty z widoku (plik zostaje w Storage)
);
create index if not exists complaints_files_idx on complaints.files (complaint_id, uploaded_at);

alter table complaints.complaints enable row level security;
alter table complaints.events enable row level security;
alter table complaints.files enable row level security;
revoke all on all tables in schema complaints from public, anon, authenticated;
grant all on all tables in schema complaints to service_role;
grant usage on all sequences in schema complaints to service_role;

insert into storage.buckets (id, name, public) values ('complaints', 'complaints', false) on conflict (id) do nothing;

create schema if not exists complaints_api;
revoke all on schema complaints_api from public, anon, authenticated;
grant usage on schema complaints_api to service_role;

-- 1. Jedna reklamacja dla przeglądarki (bez plików i historii).
create or replace function complaints_api.row_json(c complaints.complaints)
returns jsonb language sql stable security definer set search_path = complaints, public as $$
  select jsonb_build_object(
    'id', c.id, 'status', c.status, 'type', c.type, 'salesContractId', c.sales_contract_id,
    'purchaseContractId', c.purchase_contract_id, 'clientName', c.client_name, 'supplierName', c.supplier_name,
    'productName', c.product_name,
    'trader', case when c.trader_name is null then null else jsonb_build_object('email', coalesce(c.trader_email, ''), 'name', c.trader_name) end,
    'purchaseOwner', case when c.purchase_owner_name is null then null else jsonb_build_object('email', coalesce(c.purchase_owner_email, ''), 'name', c.purchase_owner_name) end,
    'handler', jsonb_build_object('email', c.handler_email, 'name', c.handler_name),
    'createdBy', jsonb_build_object('email', c.created_by_email, 'name', c.created_by_name),
    'batchNumber', c.batch_number, 'quantityKg', c.quantity_kg, 'description', c.description,
    'clientResponseDue', c.client_response_due, 'supplierRef', c.supplier_ref, 'supplierReportedOn', c.supplier_reported_on,
    'clientClaimed', c.client_claimed, 'clientAgreed', c.client_agreed, 'clientCurrency', c.client_currency,
    'supplierClaimed', c.supplier_claimed, 'supplierAccepted', c.supplier_accepted, 'supplierCurrency', c.supplier_currency,
    'outcome', c.outcome, 'settlement', c.settlement, 'resolutionNotes', c.resolution_notes, 'resolvedAt', c.resolved_at,
    'legacyId', c.legacy_id, 'createdAt', c.created_at, 'updatedAt', c.updated_at);
$$;

-- 2. Co wiadomo o kontrakcie z numeru: najpierw moduł Contracts centrum, potem stary intranet (contracts_api.archive_rows,
--    db/central/contracts_archive.sql). Kontrahent to nabywca w S i dostawca w P (w intranecie pole „buyer” w obu).
create or replace function complaints_api.contract_lookup(p_id text)
returns jsonb language plpgsql stable security definer set search_path = complaints, contracts, raw, public as $$
declare v jsonb;
begin
  select jsonb_build_object('id', c.id, 'type', c.type, 'companyName', c.company_name,
      'products', coalesce((select string_agg(l->>'name', ', ') from jsonb_array_elements(coalesce(c.data->'products', '[]')) l), ''),
      'ownerName', c.owner_name, 'ownerEmail', c.owner_email, 'source', 'hub')
    into v from contracts.contracts c where c.id = upper(trim(p_id)) and c.status <> 'cancelled';
  if v is not null then return v; end if;
  select jsonb_build_object('id', a.id, 'type', a.type, 'companyName', a.company_name, 'products', a.products,
      'ownerName', a.owner_name, 'ownerEmail', null, 'source', 'intranet')
    into v from contracts_api.archive_rows() a where a.id = upper(trim(p_id)) limit 1;
  return v;
end $$;

-- 3. Nowa reklamacja. p_data: pola formularza + to, co serwer ustalił z kontraktów (clientName, supplierName,
--    productName, trader {email,name}, purchaseOwner {email,name}); p_actor = {email, name} (też pierwszy prowadzący).
create or replace function complaints_api.create_complaint(p_data jsonb, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare
  v_year int := extract(year from now() at time zone 'Europe/Warsaw')::int;
  v_seq int;
  v_row complaints.complaints;
begin
  perform pg_advisory_xact_lock(hashtext('complaints:' || v_year));
  select coalesce(max(seq), 0) + 1 into v_seq from complaints.complaints where year = v_year;
  insert into complaints.complaints (id, year, seq, status, type, sales_contract_id, purchase_contract_id, client_name, supplier_name,
    product_name, trader_email, trader_name, purchase_owner_email, purchase_owner_name, handler_email, handler_name,
    created_by_email, created_by_name, batch_number, quantity_kg, description, client_response_due)
  values ('C-' || v_year || '-' || lpad(v_seq::text, 3, '0'), v_year, v_seq, 'open', p_data->>'type',
    p_data->>'salesContractId', coalesce(p_data->>'purchaseContractId', ''), coalesce(p_data->>'clientName', ''),
    coalesce(p_data->>'supplierName', ''), coalesce(p_data->>'productName', ''),
    nullif(lower(p_data->'trader'->>'email'), ''), p_data->'trader'->>'name',
    nullif(lower(p_data->'purchaseOwner'->>'email'), ''), p_data->'purchaseOwner'->>'name',
    lower(p_actor->>'email'), p_actor->>'name', lower(p_actor->>'email'), p_actor->>'name',
    coalesce(p_data->>'batchNumber', ''), nullif(p_data->>'quantityKg', '')::numeric, p_data->>'description',
    nullif(p_data->>'clientResponseDue', '')::date)
  returning * into v_row;
  insert into complaints.events (complaint_id, actor_email, actor_name, action, to_status)
  values (v_row.id, lower(p_actor->>'email'), p_actor->>'name', 'created', 'open');
  return complaints_api.row_json(v_row);
end $$;

-- 4. Pola prowadzącego: partia, ilość, terminy, strona dostawcy, kwoty.
create or replace function complaints_api.update_details(p_id text, p_details jsonb, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare v_row complaints.complaints;
begin
  update complaints.complaints set
    batch_number = coalesce(p_details->>'batchNumber', ''),
    quantity_kg = nullif(p_details->>'quantityKg', '')::numeric,
    client_response_due = nullif(p_details->>'clientResponseDue', '')::date,
    supplier_ref = coalesce(p_details->>'supplierRef', ''),
    supplier_reported_on = nullif(p_details->>'supplierReportedOn', '')::date,
    client_claimed = nullif(p_details->>'clientClaimed', '')::numeric,
    client_agreed = nullif(p_details->>'clientAgreed', '')::numeric,
    client_currency = coalesce(nullif(p_details->>'clientCurrency', ''), 'EUR'),
    supplier_claimed = nullif(p_details->>'supplierClaimed', '')::numeric,
    supplier_accepted = nullif(p_details->>'supplierAccepted', '')::numeric,
    supplier_currency = coalesce(nullif(p_details->>'supplierCurrency', ''), 'EUR'),
    updated_at = now()
  where id = p_id and status <> 'cancelled' returning * into v_row;
  if not found then raise exception 'Complaint % does not exist or was cancelled.', p_id using errcode = 'P0001'; end if;
  insert into complaints.events (complaint_id, actor_email, actor_name, action)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', 'details');
  return complaints_api.row_json(v_row);
end $$;

-- 5. Zmiana statusu (także anulowanie). p_from: status, który widział użytkownik (inaczej ktoś zmienił go w międzyczasie).
--    p_change: {comment, outcome, settlement, resolutionNotes}; przy resolved wynik i rozliczenie są zapisywane.
create or replace function complaints_api.set_status(p_id text, p_from text, p_to text, p_change jsonb, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare v_row complaints.complaints;
begin
  select * into v_row from complaints.complaints where id = p_id for update;
  if not found then raise exception 'Complaint % does not exist.', p_id using errcode = 'P0001'; end if;
  if v_row.status <> p_from then raise exception 'Someone has just changed this complaint. Refresh the page.' using errcode = 'P0001'; end if;
  update complaints.complaints set status = p_to, updated_at = now(),
    outcome = case when p_to = 'resolved' then p_change->>'outcome' when p_to = 'investigating' then null else outcome end,
    settlement = case when p_to = 'resolved' then p_change->>'settlement' when p_to = 'investigating' then null else settlement end,
    resolution_notes = case when p_to = 'resolved' then coalesce(p_change->>'resolutionNotes', '') else resolution_notes end,
    resolved_at = case when p_to = 'resolved' then now() when p_to = 'investigating' then null else resolved_at end
  where id = p_id returning * into v_row;
  insert into complaints.events (complaint_id, actor_email, actor_name, action, from_status, to_status, comment)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', case when p_to = 'cancelled' then 'cancelled' else 'status' end,
    p_from, p_to, nullif(trim(p_change->>'comment'), ''));
  return complaints_api.row_json(v_row);
end $$;

-- 6. Nowy prowadzący (administracja). p_handler = {email, name}.
create or replace function complaints_api.assign(p_id text, p_handler jsonb, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare v_row complaints.complaints;
begin
  update complaints.complaints set handler_email = lower(p_handler->>'email'), handler_name = p_handler->>'name', updated_at = now()
  where id = p_id returning * into v_row;
  if not found then raise exception 'Complaint % does not exist.', p_id using errcode = 'P0001'; end if;
  insert into complaints.events (complaint_id, actor_email, actor_name, action, comment)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', 'assigned', p_handler->>'name');
  return complaints_api.row_json(v_row);
end $$;

-- 7. Komentarz na osi zdarzeń.
create or replace function complaints_api.add_comment(p_id text, p_comment text, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare v_row complaints.complaints;
begin
  if nullif(trim(p_comment), '') is null then raise exception 'Write a comment.' using errcode = 'P0001'; end if;
  update complaints.complaints set updated_at = now() where id = p_id returning * into v_row;
  if not found then raise exception 'Complaint % does not exist.', p_id using errcode = 'P0001'; end if;
  insert into complaints.events (complaint_id, actor_email, actor_name, action, comment)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', 'comment', left(trim(p_comment), 4000));
  return complaints_api.row_json(v_row);
end $$;

-- 8. Plik wgrany przez przeglądarkę (podpisany link z serwera). p_file = {category, fileName, path}.
create or replace function complaints_api.add_file(p_id text, p_file jsonb, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare v_row complaints.complaints;
begin
  update complaints.complaints set updated_at = now() where id = p_id and status <> 'cancelled' returning * into v_row;
  if not found then raise exception 'Complaint % does not exist or was cancelled.', p_id using errcode = 'P0001'; end if;
  insert into complaints.files (complaint_id, category, file_name, path, uploaded_by_email, uploaded_by_name)
  values (p_id, p_file->>'category', p_file->>'fileName', p_file->>'path', lower(p_actor->>'email'), p_actor->>'name')
  on conflict (path) do nothing;
  insert into complaints.events (complaint_id, actor_email, actor_name, action, comment)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', 'file_added', p_file->>'fileName');
  return complaints_api.row_json(v_row);
end $$;

create or replace function complaints_api.remove_file(p_id text, p_file_id bigint, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare v_row complaints.complaints; v_name text;
begin
  update complaints.files set removed_at = now() where id = p_file_id and complaint_id = p_id and removed_at is null returning file_name into v_name;
  if v_name is null then raise exception 'This file is not in the complaint.' using errcode = 'P0001'; end if;
  update complaints.complaints set updated_at = now() where id = p_id returning * into v_row;
  insert into complaints.events (complaint_id, actor_email, actor_name, action, comment)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', 'file_removed', v_name);
  return complaints_api.row_json(v_row);
end $$;

-- 9. Lista. p_email: tylko reklamacje, których ta osoba dotyczy (zakładający, prowadzący, handlowiec, właściciel kontraktu
--    zakupu); null = wszystkie (administracja). p_statuses: filtr; p_q: numer, kontrakt, klient, dostawca, produkt, partia.
create or replace function complaints_api.list(p_email text default null, p_statuses text[] default null, p_q text default null,
  p_limit int default 100, p_offset int default 0)
returns jsonb language sql stable security definer set search_path = complaints, public as $$
  with f as (
    select * from complaints.complaints c
    where (p_email is null or lower(p_email) in (c.created_by_email, c.handler_email, c.trader_email, c.purchase_owner_email))
      and (p_statuses is null or c.status = any(p_statuses))
      and (nullif(trim(p_q), '') is null or concat_ws(' ', c.id, c.legacy_id, c.sales_contract_id, c.purchase_contract_id, c.client_name,
            c.supplier_name, c.product_name, c.batch_number, c.supplier_ref) ilike '%' || trim(p_q) || '%')
  )
  select jsonb_build_object('total', (select count(*) from f), 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'type', type, 'salesContractId', sales_contract_id,
      'purchaseContractId', purchase_contract_id, 'clientName', client_name, 'supplierName', supplier_name,
      'productName', product_name, 'handler', jsonb_build_object('email', handler_email, 'name', handler_name),
      'createdAt', created_at, 'updatedAt', updated_at) order by created_at desc)
    from (select * from f order by created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) p), '[]'::jsonb));
$$;

-- 10. Jedna reklamacja z plikami i historią.
create or replace function complaints_api.get(p_id text)
returns jsonb language sql stable security definer set search_path = complaints, public as $$
  select complaints_api.row_json(c) || jsonb_build_object(
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'category', f.category, 'fileName', f.file_name, 'path', f.path,
        'uploadedBy', jsonb_build_object('email', f.uploaded_by_email, 'name', f.uploaded_by_name), 'uploadedAt', f.uploaded_at) order by f.uploaded_at)
      from complaints.files f where f.complaint_id = c.id and f.removed_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'actorEmail', e.actor_email, 'actorName', e.actor_name,
        'action', e.action, 'fromStatus', e.from_status, 'toStatus', e.to_status, 'comment', e.comment) order by e.at, e.id)
      from complaints.events e where e.complaint_id = c.id), '[]'::jsonb))
  from complaints.complaints c where c.id = p_id;
$$;

-- 11. Import reklamacji ze starego intranetu (jednorazowo, 7 spraw z Firestore `complaints`). Idempotentny po legacy_id:
--     drugi raz niczego nie dubluje. p_data: pola jak przy create_complaint + legacyId, status, createdAt, createdBy
--     {email,name}, events [{at, actorName, action, comment}]. Numer nadawany po kolei według daty zgłoszenia.
create or replace function complaints_api.import_legacy(p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = complaints, public as $$
declare
  v_at timestamptz := (p_data->>'createdAt')::timestamptz;
  v_year int := extract(year from v_at at time zone 'Europe/Warsaw')::int;
  v_seq int;
  v_row complaints.complaints;
  v_ev jsonb;
begin
  select * into v_row from complaints.complaints where legacy_id = p_data->>'legacyId';
  if found then return complaints_api.row_json(v_row); end if;
  perform pg_advisory_xact_lock(hashtext('complaints:' || v_year));
  select coalesce(max(seq), 0) + 1 into v_seq from complaints.complaints where year = v_year;
  insert into complaints.complaints (id, year, seq, status, type, sales_contract_id, purchase_contract_id, client_name, supplier_name,
    product_name, trader_email, trader_name, purchase_owner_email, purchase_owner_name, handler_email, handler_name,
    created_by_email, created_by_name, batch_number, description, legacy_id, created_at, updated_at, resolved_at)
  values ('C-' || v_year || '-' || lpad(v_seq::text, 3, '0'), v_year, v_seq, p_data->>'status', coalesce(p_data->>'type', 'other'),
    p_data->>'salesContractId', coalesce(p_data->>'purchaseContractId', ''), coalesce(p_data->>'clientName', ''),
    coalesce(p_data->>'supplierName', ''), coalesce(p_data->>'productName', ''),
    nullif(lower(p_data->'trader'->>'email'), ''), p_data->'trader'->>'name',
    nullif(lower(p_data->'purchaseOwner'->>'email'), ''), p_data->'purchaseOwner'->>'name',
    lower(p_data->'createdBy'->>'email'), p_data->'createdBy'->>'name', lower(p_data->'createdBy'->>'email'), p_data->'createdBy'->>'name',
    coalesce(p_data->>'batchNumber', ''), p_data->>'description', p_data->>'legacyId', v_at,
    coalesce((p_data->>'updatedAt')::timestamptz, v_at), case when p_data->>'status' = 'closed' then (p_data->>'updatedAt')::timestamptz end)
  returning * into v_row;
  insert into complaints.events (complaint_id, at, actor_email, actor_name, action, to_status, comment)
  values (v_row.id, v_at, lower(p_data->'createdBy'->>'email'), p_data->'createdBy'->>'name', 'imported', v_row.status,
    'Imported from the old intranet (' || (p_data->>'legacyId') || ').');
  for v_ev in select * from jsonb_array_elements(coalesce(p_data->'events', '[]')) loop
    insert into complaints.events (complaint_id, at, actor_email, actor_name, action, comment)
    values (v_row.id, (v_ev->>'at')::timestamptz, '', coalesce(v_ev->>'actorName', ''), 'comment',
      'Intranet: ' || coalesce(v_ev->>'action', '') || coalesce(' – ' || nullif(v_ev->>'comment', ''), ''));
  end loop;
  return complaints_api.row_json(v_row);
end $$;

revoke all on all functions in schema complaints_api from public, anon, authenticated;
grant execute on all functions in schema complaints_api to service_role;
