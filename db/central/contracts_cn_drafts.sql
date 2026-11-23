-- Contract generator: kody CN przy produktach i szkice kontraktów (prośba Pawła z 23.11.2026).
-- Uruchom raz w Supabase SQL Editor projektu nutri-central-db, po contracts_api.sql. Niczego nie usuwa.
--
-- 1. core.cn_codes: słownik kodów do wyszukiwarki. Na start nomenklatura HS (2, 4 i 6 cyfr, opisy po angielsku);
--    8-cyfrowe kody CN wpisuje handlowiec, a baza zapamiętuje je przy produkcie (core.products.cn_code), więc
--    przy kolejnym kontrakcie z tym produktem kod podpowiada się sam. Gdy enova dostanie kody produktów, można
--    tu dograć pełną listę CN (ta sama tabela, level = 8). Dane słownika ładuje Claude (insert), nie ten plik.
-- 2. contracts.drafts: szkice. Szkic nie ma numeru ani obiegu; numer nadaje baza dopiero przy wysłaniu.

create table if not exists core.cn_codes (
  code text primary key check (code ~ '^[0-9]{2,10}$'),
  description text not null,
  level int not null,                                    -- 2 dział, 4 pozycja, 6 podpozycja HS, 8 kod CN
  source text not null default 'HS 2022'
);
create index if not exists cn_codes_description_idx on core.cn_codes using gin (to_tsvector('english', description));
alter table core.cn_codes enable row level security;

alter table core.products add column if not exists cn_code text check (cn_code ~ '^[0-9]{4,10}$');

create table if not exists contracts.drafts (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  created_by_email text not null,
  type char(1) not null check (type in ('S', 'P')),
  company_name text not null default '',
  data jsonb not null,                                   -- cały formularz (ContractInput z shared/contractsApi.ts)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracts_drafts_owner_idx on contracts.drafts (owner_email, updated_at desc);
alter table contracts.drafts enable row level security;
revoke all on contracts.drafts from public, anon, authenticated;
grant all on contracts.drafts to service_role;

-- Wyszukiwarka kodu CN: po kodzie (same cyfry, spacje i kropki pomijane) albo po słowach z nazwy produktu i opisu.
-- Najpierw produkty z zapamiętanym kodem, potem słownik.
create or replace function contracts_api.cn_search(p_q text, p_limit int default 15)
returns jsonb language sql stable security definer set search_path = core, public as $$
  with q as (select trim(p_q) as text, regexp_replace(p_q, '[^0-9]', '', 'g') as digits, trim(p_q) ~ '^[0-9 .]+$' as is_code),
  by_product as (
    select p.cn_code as code, p.canonical_name as label, 'product' as kind, 0 as rank
    from core.products p, q
    where p.cn_code is not null and p.merged_into_id is null and length(q.text) >= 2
      and (case when q.is_code then p.cn_code like q.digits || '%' else p.canonical_name ilike '%' || q.text || '%' end)
    limit 10
  ),
  by_code as (
    select c.code, c.description as label, 'code' as kind, 1 as rank
    from core.cn_codes c, q
    where q.is_code and length(q.digits) >= 2 and c.code like q.digits || '%'
    order by c.code limit 15
  ),
  by_words as (
    select c.code, c.description as label, 'code' as kind, 2 as rank
    from core.cn_codes c, q
    where not q.is_code and length(q.text) >= 3 and c.level >= 4
      and to_tsvector('english', c.description) @@ plainto_tsquery('english', q.text)
    order by c.level desc, c.code limit 15
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label, 'kind', kind) order by rank, code), '[]'::jsonb)
  from (select * from by_product union all select * from by_code union all select * from by_words limit least(greatest(p_limit, 1), 30)) hits;
$$;

-- Zapamiętanie kodów CN przy produktach z kontraktu (tylko tam, gdzie produkt jeszcze nie ma kodu).
create or replace function contracts_api.learn_cn(p_data jsonb)
returns void language sql volatile security definer set search_path = core, public as $$
  update core.products p set cn_code = l.cn
  from (select (line->>'productId')::bigint as id, regexp_replace(line->>'cnCode', '[^0-9]', '', 'g') as cn
        from jsonb_array_elements(coalesce(p_data->'products', '[]'::jsonb)) line
        where line->>'productId' ~ '^[0-9]+$') l
  where p.id = l.id and p.cn_code is null and l.cn ~ '^[0-9]{4,10}$';
$$;

-- Podpowiedzi produktów: teraz z kodem CN.
create or replace function contracts_api.product_search(p_q text, p_limit int default 15)
returns jsonb language sql stable security definer set search_path = core, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.canonical_name, 'enovaCode', p.enova_code, 'cnCode', p.cn_code)), '[]'::jsonb)
  from (select * from core.products
        where length(trim(p_q)) >= 2 and coalesce(is_active, true) and merged_into_id is null
          and canonical_name ilike '%' || trim(p_q) || '%'
        order by (canonical_name ilike trim(p_q) || '%') desc, canonical_name
        limit least(greatest(p_limit, 1), 30)) p;
$$;

-- Szkice. p_id null = nowy szkic. Właściciela i uprawnienia sprawdza serwer centrum.
create or replace function contracts_api.draft_save(p_id uuid, p_owner text, p_actor text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = contracts, public as $$
declare v contracts.drafts;
begin
  if p_id is null then
    insert into contracts.drafts (owner_email, created_by_email, type, company_name, data)
    values (lower(p_owner), lower(p_actor), coalesce(p_data->>'type', 'S'), coalesce(p_data->'party'->>'companyName', ''), p_data)
    returning * into v;
  else
    update contracts.drafts set owner_email = lower(p_owner), type = coalesce(p_data->>'type', 'S'),
      company_name = coalesce(p_data->'party'->>'companyName', ''), data = p_data, updated_at = now()
    where id = p_id returning * into v;
    if v.id is null then raise exception 'This draft no longer exists.' using errcode = 'P0001'; end if;
  end if;
  return jsonb_build_object('id', v.id, 'ownerEmail', v.owner_email, 'type', v.type, 'companyName', v.company_name,
    'data', v.data, 'createdAt', v.created_at, 'updatedAt', v.updated_at);
end $$;

-- Szkice osoby: jej własne i te, które zapisała dla innego tradera (admin).
create or replace function contracts_api.draft_list(p_owner text)
returns jsonb language sql stable security definer set search_path = contracts, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ownerEmail', owner_email, 'type', type, 'companyName', company_name,
    'updatedAt', updated_at) order by updated_at desc), '[]'::jsonb)
  from contracts.drafts where owner_email = lower(p_owner) or created_by_email = lower(p_owner);
$$;

create or replace function contracts_api.draft_get(p_id uuid)
returns jsonb language sql stable security definer set search_path = contracts, public as $$
  select jsonb_build_object('id', id, 'ownerEmail', owner_email, 'type', type, 'companyName', company_name, 'data', data,
    'createdAt', created_at, 'updatedAt', updated_at)
  from contracts.drafts where id = p_id;
$$;

create or replace function contracts_api.draft_delete(p_id uuid)
returns void language sql volatile security definer set search_path = contracts, public as $$
  delete from contracts.drafts where id = p_id;
$$;

revoke all on all functions in schema contracts_api from public, anon, authenticated;
grant execute on all functions in schema contracts_api to service_role;
