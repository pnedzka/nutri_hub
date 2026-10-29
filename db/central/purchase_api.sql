-- Purchase Manager (moduł centrum /purchase): warstwa API w bazie nutri-central-db (projekt blbcudymvackpudywdyy).
-- Uruchom raz w Supabase SQL Editor projektu nutri-central-db. Niczego nie zmienia w danych: tworzy schemat
-- purchase_api z funkcjami, które woła serwer centrum aplikacji (klucz secret nutri-central-db).
--
-- Po uruchomieniu: Supabase → nutri-central-db → Project Settings → Data API → Exposed schemas: dopisać purchase_api.
-- Funkcje może wołać tylko service_role (klucz secret); anon i authenticated nie mają do nich dostępu.
--
-- Przegląd produktów woła funkcje core.review_* z product_review.sql (muszą już istnieć), propozycje bid sell
-- czytają core.bid_proposals. Każda decyzja zapisuje, kto ją podjął (e-mail osoby zalogowanej w centrum).
-- Ceny sprzedaży i marże są poza zakresem: funkcje zwracają tylko ceny zakupu z ofert dostawców.

create schema if not exists purchase_api;
revoke all on schema purchase_api from public, anon, authenticated;
grant usage on schema purchase_api to service_role;

-- 1. Przegląd produktów: strona listy z filtrami. Podobne produkty liczone tylko dla pozycji na stronie.
create or replace function purchase_api.product_review_list(
  p_type text default null,          -- 'new_product' | 'product_mapping' | null (wszystkie)
  p_category text default null,
  p_max_confidence numeric default null,
  p_with_offers boolean default false,
  p_q text default null,             -- fragment nazwy z oferty albo propozycji AI
  p_limit int default 25,
  p_offset int default 0)
returns jsonb language sql stable security definer set search_path = core, extensions, public as $$
  with base as (
    select q.id, q.item_type,
           coalesce(q.suggestion->>'from_name', q.suggestion->>'name') as from_name,
           case q.item_type when 'new_product' then coalesce(q.suggestion->>'name', p.canonical_name) else p.canonical_name end as ai_proposal,
           p.id as product_id, p.canonical_name, p.review_status as product_status, p.source as product_source,
           coalesce(nullif(q.suggestion->>'category', ''), p.category) as category,
           case q.item_type
             when 'new_product' then (select nq.confidence from core.product_name_queue nq
                                      where nq.name_norm = core.norm_product_name(q.suggestion->>'from_name'))
             else nullif(q.suggestion->>'confidence', '')::numeric end as confidence,
           q.suggestion->>'reason' as ai_reason,
           case q.item_type
             when 'new_product' then (select count(*) from core.offers o where o.product_id = q.entity_id)
             else (select count(*) from core.offers o where o.product_id = q.entity_id
                     and core.norm_product_name(o.product_name_raw) = core.norm_product_name(q.suggestion->>'name')) end as offers,
           q.created_at
    from core.review_queue q
    join core.products p on p.id = q.entity_id
    where q.status = 'open' and q.item_type in ('new_product', 'product_mapping')
      and (p_type is null or q.item_type = p_type)
  ), filtered as (
    select * from base
    where (p_category is null or category = p_category)
      and (p_max_confidence is null or coalesce(confidence, 0) < p_max_confidence)
      and (not p_with_offers or offers > 0)
      and (nullif(trim(p_q), '') is null or from_name ilike '%' || trim(p_q) || '%' or ai_proposal ilike '%' || trim(p_q) || '%')
  ), page as (
    select * from filtered order by offers desc, id
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pg.id, 'itemType', pg.item_type, 'fromName', pg.from_name, 'aiProposal', pg.ai_proposal,
               'productId', pg.product_id, 'productName', pg.canonical_name, 'productStatus', pg.product_status,
               'productSource', pg.product_source, 'category', pg.category, 'confidence', pg.confidence,
               'aiReason', pg.ai_reason, 'offers', pg.offers, 'createdAt', pg.created_at,
               'similar', coalesce(sim.similar, '[]'::jsonb))
             order by pg.offers desc, pg.id)
      from page pg
      left join lateral (
        select jsonb_agg(jsonb_build_object('productId', s.id, 'name', s.canonical_name, 'category', s.category,
                                            'source', s.source, 'status', s.review_status,
                                            'similarity', round(s.sim::numeric, 2), 'offers', s.offers)
                         order by s.sim desc) as similar
        from (select s.id, s.canonical_name, s.category, s.source, s.review_status,
                     extensions.similarity(s.canonical_name, pg.canonical_name) as sim,
                     (select count(*) from core.offers o where o.product_id = s.id) as offers
              from core.products s
              where s.id <> pg.product_id and s.review_status <> 'rejected'
                and s.canonical_name operator(extensions.%) pg.canonical_name
              order by sim desc limit 5) s) sim on true), '[]'::jsonb))
$$;

-- Liczby do nagłówka i lista kategorii do filtra
create or replace function purchase_api.product_review_summary()
returns jsonb language sql stable security definer set search_path = core, extensions, public as $$
  select jsonb_build_object(
    'open', (select count(*) from core.review_queue where status = 'open' and item_type in ('new_product', 'product_mapping')),
    'newProducts', (select count(*) from core.review_queue where status = 'open' and item_type = 'new_product'),
    'mappings', (select count(*) from core.review_queue where status = 'open' and item_type = 'product_mapping'),
    'decidedToday', (select count(*) from core.review_queue where item_type in ('new_product', 'product_mapping')
                       and decided_at >= date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw'),
    'approvedProducts', (select count(*) from core.products where review_status = 'approved'),
    'categories', coalesce((select jsonb_agg(c order by c) from (
                     select distinct category c from core.products where category is not null and review_status <> 'rejected') x), '[]'::jsonb))
$$;

-- 2. Akcje przeglądu: cienkie nakładki na core.review_* (logika i walidacja zostają tam)
create or replace function purchase_api.review_approve(p_item_id bigint, p_by text, p_name text default null, p_category text default null)
returns jsonb language sql security definer set search_path = core, extensions, public as $$
  select core.review_approve(p_item_id, p_by, p_name, p_category)
$$;

create or replace function purchase_api.review_merge(p_item_id bigint, p_target_id bigint, p_by text)
returns jsonb language sql security definer set search_path = core, extensions, public as $$
  select core.review_merge(p_item_id, p_target_id, p_by)
$$;

create or replace function purchase_api.review_not_product(p_item_id bigint, p_by text)
returns jsonb language sql security definer set search_path = core, extensions, public as $$
  select core.review_not_product(p_item_id, p_by)
$$;

create or replace function purchase_api.review_remap(p_item_id bigint, p_target_id bigint, p_by text)
returns jsonb language sql security definer set search_path = core, extensions, public as $$
  select core.review_remap(p_item_id, p_target_id, p_by)
$$;

create or replace function purchase_api.review_approve_bulk(p_item_ids bigint[], p_by text, p_min_confidence numeric default 0.9)
returns jsonb language sql security definer set search_path = core, extensions, public as $$
  select core.review_approve_bulk(p_item_ids, p_by, p_min_confidence)
$$;

create or replace function purchase_api.search_products(p_q text, p_limit int default 10)
returns jsonb language sql stable security definer set search_path = core, extensions, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('productId', s.product_id, 'name', s.name, 'category', s.category,
                                               'status', s.review_status, 'source', s.source,
                                               'similarity', round(s.similarity::numeric, 2), 'offers', s.offers)), '[]'::jsonb)
  from core.search_products(p_q, least(greatest(p_limit, 1), 25)) s
$$;

-- 3. Propozycje bid sell: lista (bez marż i cen sprzedaży) i decyzja Purchase Managera
create or replace function purchase_api.bid_proposal_list(p_status text default 'pending_review', p_limit int default 25, p_offset int default 0)
returns jsonb language sql stable security definer set search_path = core, extensions, public as $$
  with filtered as (
    select p.*, b.offered_at as bid_buy_at
    from core.bid_proposals p
    join core.offers b on b.id = p.bid_buy_offer_id
    where p_status is null or p.status = p_status
  ), page as (
    select * from filtered order by bid_buy_at desc, id desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from core.bid_proposals group by 1) c),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'status', p.status, 'generatedAt', p.generated_at,
               'productId', pr.id, 'product', pr.canonical_name, 'category', pr.category,
               'bidBuyAt', b.offered_at, 'salesRep', emp.full_name, 'customer', cu.name,
               'requestedKg', coalesce(p.requested_quantity_kg, b.quantity_kg),
               'targetPriceEurPerKg', b.price_eur_per_kg,
               'requestedIncoterms', b.incoterms, 'requestedLocation', b.location, 'bidBuyText', b.raw_text,
               'reviewedBy', p.reviewed_by, 'reviewedAt', p.reviewed_at, 'reviewNote', p.review_note,
               'chosenOptionId', p.chosen_option_id,
               'options', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', o.id, 'rank', o.rank, 'supplier', coalesce(sc.name, so.producer_name),
                          'priceEurPerKg', o.purchase_price_eur_per_kg, 'incoterms', coalesce(o.incoterms, so.incoterms),
                          'location', so.location, 'leadTime', o.lead_time, 'quantityKg', so.quantity_kg,
                          'offeredAt', so.offered_at, 'source', so.source, 'productName', so.product_name_raw)
                        order by o.rank)
                 from core.bid_proposal_options o
                 join core.offers so on so.id = o.supplier_offer_id
                 left join core.companies sc on sc.id = o.supplier_company_id
                 where o.proposal_id = p.id), '[]'::jsonb))
             order by p.bid_buy_at desc, p.id desc)
      from page p
      join core.offers b on b.id = p.bid_buy_offer_id
      join core.products pr on pr.id = p.product_id
      left join core.employees emp on emp.id = b.employee_id
      left join core.companies cu on cu.id = p.customer_company_id), '[]'::jsonb))
$$;

-- approved (z wybraną opcją) | rejected | pending_review (cofnięcie decyzji). Tylko propozycje oczekujące albo
-- rozstrzygnięte przez człowieka; wygasłe i wysłane zostają bez zmian.
create or replace function purchase_api.bid_proposal_decide(p_id bigint, p_status text, p_by text, p_option_id bigint default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare pr core.bid_proposals;
begin
  if p_by is null or trim(p_by) = '' then raise exception 'Brak decided_by'; end if;
  if p_status not in ('approved', 'rejected', 'pending_review') then raise exception 'Nieznany status %', p_status; end if;
  select * into pr from core.bid_proposals where id = p_id for update;
  if not found then raise exception 'Propozycja % nie istnieje', p_id; end if;
  if pr.status not in ('pending_review', 'approved', 'rejected') then
    raise exception 'Propozycja % ma status % i nie można jej zmienić', p_id, pr.status;
  end if;
  if p_status = 'approved' then
    if p_option_id is null then raise exception 'Wybierz opcję dostawcy'; end if;
    if not exists (select 1 from core.bid_proposal_options where id = p_option_id and proposal_id = p_id) then
      raise exception 'Opcja % nie należy do propozycji %', p_option_id, p_id;
    end if;
  end if;
  update core.bid_proposals set
    status = p_status,
    chosen_option_id = case when p_status = 'approved' then p_option_id end,
    reviewed_by = case when p_status = 'pending_review' then null else p_by end,
    reviewed_at = case when p_status = 'pending_review' then null else now() end,
    review_note = nullif(trim(p_note), '')
  where id = p_id;
  -- po cofnięciu decyzji opcje mogą być nieaktualne
  if p_status = 'pending_review' then perform core.build_bid_proposal_options(p_id); end if;
  return jsonb_build_object('id', p_id, 'status', p_status, 'chosenOptionId', case when p_status = 'approved' then p_option_id end);
end $$;

-- 4. Dostęp: tylko service_role (serwer centrum). Funkcje w nowym schemacie domyślnie może wołać PUBLIC.
revoke all on all functions in schema purchase_api from public, anon, authenticated;
grant execute on all functions in schema purchase_api to service_role;

-- Sprawdzenie
select purchase_api.product_review_summary() - 'categories' as review,
       (purchase_api.bid_proposal_list(null, 1))->'counts' as proposals;
