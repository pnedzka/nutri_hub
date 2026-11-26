-- Contracts → zakładka „Archive (intranet)”: kontrakty ze starego intranetu, tylko do odczytu (24.11.2026).
-- Dane już są w bazie: raw.intranet_records (collection = 'contracts'), odświeżane co godzinę przez workflow n8n
-- „Central DB - Intranet sync”. Nic nie kopiujemy; te funkcje tylko czytają.
-- Uruchamia właściciel w SQL Editorze projektu nutri-central-db (blbcudymvackpudywdyy). Można uruchomić ponownie.

-- 0. Data z intranetu: tekst ISO albo obiekt Firestore {"seconds": …}.
create or replace function contracts_api.archive_date(v jsonb)
returns date language sql immutable as $$
  select case
    when jsonb_typeof(v) = 'object' and v->>'seconds' ~ '^[0-9]+$' then (to_timestamp((v->>'seconds')::bigint) at time zone 'Europe/Warsaw')::date
    when jsonb_typeof(v) = 'string' and v #>> '{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then left(v #>> '{}', 10)::date
  end;
$$;

-- 1. Kontrakty z intranetu w jednym kształcie: handlowiec (także dla starszych bez ownerName: z innych kontraktów
--    tej samej osoby albo z createdBy), kupujący/dostawca, wartość netto z pozycji (jednostki jak w module: MT ↔ KG).
create or replace function contracts_api.archive_rows()
returns table (id text, type text, status text, archived boolean, owner_name text, company_name text, submission_date date,
  currency text, amount numeric, products text, payload jsonb)
language sql stable security definer set search_path = raw, public as $$
  with c as (
    select r.doc_id, r.payload p from raw.intranet_records r where r.collection = 'contracts'
  ), owners as (
    select distinct on (p->>'ownerId') p->>'ownerId' owner_id, p->>'ownerName' owner_name
    from c where nullif(p->>'ownerId', '') is not null and nullif(trim(p->>'ownerName'), '') is not null
    order by p->>'ownerId', p->>'updatedAt' desc nulls last
  )
  select
    c.doc_id,
    coalesce(nullif(c.p->>'type', ''), split_part(c.doc_id, '-', 2)),
    coalesce(c.p->>'status', ''),
    coalesce((c.p->>'isArchived')::boolean, false),
    trim(coalesce(nullif(trim(c.p->>'ownerName'), ''), o.owner_name, c.p->'createdBy'->>'userName', '')),
    trim(coalesce(c.p->'buyer'->>'companyName', '')),
    coalesce(contracts_api.archive_date(c.p->'submissionDate'), contracts_api.archive_date(c.p->'createdAt')),
    coalesce((select pr->>'currency' from jsonb_array_elements(coalesce(c.p->'products', '[]')) pr where pr->>'currency' is not null limit 1), 'EUR'),
    round(coalesce((
      select sum(
        coalesce(nullif(replace(pr->>'quantity', ',', '.'), '')::numeric, 0)
        * coalesce(nullif(replace(pr->>'unitPrice', ',', '.'), '')::numeric, 0)
        * case when pr->>'unit' = 'MT' and pr->>'priceUnit' = 'KG' then 1000
               when pr->>'unit' = 'KG' and pr->>'priceUnit' = 'MT' then 0.001 else 1 end)
      from jsonb_array_elements(coalesce(c.p->'products', '[]')) pr
      where coalesce(replace(pr->>'quantity', ',', '.'), '') ~ '^[0-9]+(\.[0-9]+)?$'
        and coalesce(replace(pr->>'unitPrice', ',', '.'), '') ~ '^[0-9]+(\.[0-9]+)?$'), 0), 2),
    coalesce((select string_agg(pr->>'productName', ', ') from jsonb_array_elements(coalesce(c.p->'products', '[]')) pr), ''),
    c.p
  from c left join owners o on o.owner_id = c.p->>'ownerId';
$$;

-- 2. Lista z wyszukiwarką i filtrami. p_viewer_name: handlowiec widzi tylko swoje (po imieniu i nazwisku, bo intranet
--    nie zna adresów e-mail); null = wszystkie (administracja, podpisujący, admini).
create or replace function contracts_api.archive_list(p_viewer_name text default null, p_q text default null,
  p_type text default null, p_owner text default null, p_year int default null, p_limit int default 50, p_offset int default 0)
returns jsonb language sql stable security definer set search_path = raw, public as $$
  with mine as (
    select * from contracts_api.archive_rows() a
    where p_viewer_name is null or lower(a.owner_name) = lower(trim(p_viewer_name))
  ), f as (
    select * from mine a
    where (p_type is null or a.type = p_type)
      and (nullif(trim(p_owner), '') is null or lower(a.owner_name) = lower(trim(p_owner)))
      and (p_year is null or extract(year from a.submission_date) = p_year)
      and (nullif(trim(p_q), '') is null or a.id ilike '%' || trim(p_q) || '%' or a.company_name ilike '%' || trim(p_q) || '%'
        or a.products ilike '%' || trim(p_q) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'type', type, 'status', status, 'archived', archived, 'ownerName', owner_name,
        'companyName', company_name, 'submissionDate', submission_date, 'currency', currency, 'amount', amount, 'products', products)
        order by submission_date desc nulls last, id desc)
      from (select * from f order by submission_date desc nulls last, id desc
            limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x), '[]'::jsonb),
    'owners', coalesce((select jsonb_agg(o order by o) from (select distinct owner_name o from mine where owner_name <> '') d), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(y order by y desc) from (select distinct extract(year from submission_date)::int y from mine where submission_date is not null) d), '[]'::jsonb));
$$;

-- 3. Jeden kontrakt: pola potrzebne do podglądu (bez prowizji, rozliczeń i wewnętrznych identyfikatorów intranetu).
create or replace function contracts_api.archive_get(p_id text, p_viewer_name text default null)
returns jsonb language sql stable security definer set search_path = raw, public as $$
  select jsonb_build_object('id', a.id, 'type', a.type, 'status', a.status, 'archived', a.archived, 'ownerName', a.owner_name,
    'companyName', a.company_name, 'submissionDate', a.submission_date, 'currency', a.currency, 'amount', a.amount,
    'buyer', (a.payload->'buyer') - 'id', 'products', a.products, 'lines', coalesce(a.payload->'products', '[]'::jsonb), 'delivery', a.payload->'delivery',
    'paymentTerms', a.payload->'paymentTerms', 'requiredDocuments', a.payload->'requiredDocument',
    'representative', a.payload->>'representative', 'signedByRepresentative', a.payload->'isSignedByRepresentative',
    'linkedContractId', a.payload->>'linkedOppositeContractId', 'proformaInvoiceNumber', a.payload->>'proformaInvoiceNumber',
    'vatInvoiceNumber', a.payload->>'vatInvoiceNumber', 'shipmentDate', a.payload->>'shipmentDate',
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('type', at->>'type', 'fileName', at->>'fileName', 'url', at->>'url',
        'uploadedAt', at->>'uploadedAt', 'uploadedBy', at->'uploadedBy'->>'name'))
      from jsonb_array_elements(coalesce(a.payload->'attachments', '[]')) at where at->>'url' like 'https://%'), '[]'::jsonb))
  from contracts_api.archive_rows() a
  where a.id = p_id and (p_viewer_name is null or lower(a.owner_name) = lower(trim(p_viewer_name)));
$$;

revoke all on function contracts_api.archive_date(jsonb) from public, anon, authenticated;
grant execute on function contracts_api.archive_date(jsonb) to service_role;
revoke all on function contracts_api.archive_rows() from public, anon, authenticated;
revoke all on function contracts_api.archive_list(text, text, text, text, int, int, int) from public, anon, authenticated;
revoke all on function contracts_api.archive_get(text, text) from public, anon, authenticated;
grant execute on function contracts_api.archive_rows() to service_role;
grant execute on function contracts_api.archive_list(text, text, text, text, int, int, int) to service_role;
grant execute on function contracts_api.archive_get(text, text) to service_role;
