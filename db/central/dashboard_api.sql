-- Dashboard centrum (strona główna, widgety "Contracts this month" i "Sales leaderboard"): warstwa API w bazie
-- nutri-central-db (blbcudymvackpudywdyy). Uruchom raz w Supabase SQL Editor projektu nutri-central-db. Niczego nie
-- zmienia w danych: tworzy schemat dashboard_api z funkcjami tylko do odczytu, które woła serwer centrum kluczem secret.
--
-- Po uruchomieniu: Supabase → nutri-central-db → Project Settings → Data API → Exposed schemas: dopisać dashboard_api.
--
-- Źródło: kontrakty starego intranetu (raw.intranet_records, kolekcja contracts, synchronizacja n8n codziennie 6:40).
-- Liczymy jak dashboard intranetu: kontrakt należy do miesiąca, w którym go utworzono (createdAt, a bez niego
-- submissionDate), bez anulowanych (Cancelled) i zarchiwizowanych. W przeciwieństwie do core.deals są tu też kontrakty
-- oczekujące (Pending, Pending Assignment). Wartość kontraktu: suma pozycji jak calculateProductTotalPrice w intranecie
-- (ilość × cena z przeliczeniem KG/MT/LBS/PCS), przeliczona na EUR kursem z dnia utworzenia (core.eur_rate).
-- Gdy generator kontraktów w centrum zastąpi intranet, ta funkcja dostanie drugie źródło (contracts.contracts).

create schema if not exists dashboard_api;
revoke all on schema dashboard_api from public, anon, authenticated;
grant usage on schema dashboard_api to service_role;

-- Liczba z JSON-a (Firestore zapisuje liczby jako number, czasem jako tekst); null, gdy to nie liczba.
create or replace function dashboard_api.num(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(v #>> '{}')::numeric
    else null end
$$;

-- Wartość pozycji w walucie kontraktu, jak calculateProductTotalPrice w intranecie (src/lib/contract-utils.ts).
create or replace function dashboard_api.line_value(item jsonb) returns numeric
language sql immutable set search_path = '' as $$
  with x as (
    select dashboard_api.num(item->'quantity') q, dashboard_api.num(item->'unitPrice') p,
           upper(coalesce(nullif(item->>'priceUnit', ''), 'KG')) pu, upper(coalesce(item->>'unit', 'KG')) u
  )
  select case
    when q is null or p is null then 0
    when pu = 'PCS' then q * p
    when pu = '1000PCS' then q / 1000 * p
    when u = 'PCS' then 0
    else (case u when 'MT' then q * 1000 when 'LBS' then q * 0.45359237 else q end)
         * (case pu when 'KG' then p when 'MT' then p / 1000 else 0 end)
    end
  from x
$$;

-- Kontrakty utworzone w [p_from, p_to): jeden wiersz na kontrakt. value_eur = null, gdy którejś pozycji nie da się
-- przeliczyć na EUR (brak kursu waluty).
create or replace function dashboard_api.intranet_contracts(p_from timestamptz, p_to timestamptz)
returns table (
  contract_id text,
  contract_type text,
  status text,
  owner_name text,
  created_at timestamptz,
  value_eur numeric
)
language sql stable security definer set search_path = '' as $$
  with c as (
    select r.doc_id, r.payload p,
           coalesce(raw.fs_ts(r.payload->'createdAt'), raw.fs_ts(r.payload->'submissionDate'), r.created_at) as made_at
    from raw.intranet_records r
    where r.collection = 'contracts'
      and coalesce(r.payload->>'status', '') <> 'Cancelled'
      and coalesce(r.payload->>'isArchived', 'false') <> 'true'
  )
  select c.doc_id, c.p->>'type', c.p->>'status', nullif(trim(c.p->>'ownerName'), ''), c.made_at,
    (select case when bool_or(dashboard_api.line_value(i) <> 0 and core.eur_rate(i->>'currency', c.made_at::date) is null)
                 then null
                 else round(coalesce(sum(dashboard_api.line_value(i) * coalesce(core.eur_rate(i->>'currency', c.made_at::date), 0)), 0), 2) end
       from jsonb_array_elements(case jsonb_typeof(c.p->'products') when 'array' then c.p->'products'
                                      else jsonb_build_array(c.p->'product') end) i
      where jsonb_typeof(i) = 'object')
  from c
  where c.made_at >= p_from and c.made_at < p_to
  order by c.made_at
$$;

revoke all on all functions in schema dashboard_api from public, anon, authenticated;
grant execute on function dashboard_api.intranet_contracts(timestamptz, timestamptz) to service_role;
