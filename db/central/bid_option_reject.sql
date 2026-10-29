-- Purchase Manager: odrzucanie pojedynczych ofert na kartach BID BUY (przycisk „Not this product” w /purchase).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, po purchase_api.sql. Niczego nie zmienia w danych.
--
-- Produkty scalamy także przy niskim podobieństwie nazw (decyzja z 29.10.2026), więc na karcie może się trafić oferta
-- na inny towar. Odrzucenie takiej oferty uczy bazę:
--   1. reguła (produkt, nazwa z oferty): oferty o tej nazwie znikają ze wszystkich kart tego produktu, także przyszłych;
--   2. pozycja „niepewne dopasowanie” w Products to review: Purchase Manager decyduje, dokąd ta nazwa należy.
--      „Approve” (nazwa jednak pasuje) wyłącza regułę, „Other product” i „Not a product” przenoszą albo odpinają nazwę.
-- Odrzucenie można przywrócić („Restore” na karcie): reguła przestaje działać, a otwarta pozycja przeglądu się zamyka.

-- 1. Reguły
create table if not exists core.offer_match_rejections (
  id bigint generated always as identity primary key,
  product_id bigint not null references core.products(id),   -- produkt karty (po scaleniu liczy się produkt docelowy)
  offer_name_norm text not null,                               -- core.norm_product_name(nazwa z oferty dostawcy)
  offer_name_raw text not null,
  supplier_offer_id bigint references core.offers(id),
  proposal_id bigint references core.bid_proposals(id),
  review_item_id bigint references core.review_queue(id),
  rejected_by text not null,
  rejected_at timestamptz not null default now(),
  restored_by text,
  restored_at timestamptz
);
create unique index if not exists offer_match_rejections_active_uq
  on core.offer_match_rejections (product_id, offer_name_norm) where restored_at is null;
alter table core.offer_match_rejections enable row level security;
revoke all on core.offer_match_rejections from public, anon, authenticated;

-- Działające reguły: nieprzywrócone, a ich pozycja przeglądu nie została zatwierdzona („nazwa jednak pasuje”).
create or replace view core.v_offer_match_rejections as
select r.*, core.product_root(r.product_id) as root_product_id
from core.offer_match_rejections r
left join core.review_queue q on q.id = r.review_item_id
where r.restored_at is null
  and not (coalesce(q.status, '') = 'approved' and coalesce(q.resolution, '') in ('approved', 'edited'));

-- 2. Opcje propozycji: jak dotąd, ale bez ofert odrzuconych dla tego produktu
create or replace function core.build_bid_proposal_options(p_proposal_id bigint, p_offer_days int default 180, p_options int default 3)
returns int language plpgsql as $$
declare
  pr core.bid_proposals;
  b core.offers;
  v_n int;
begin
  select * into pr from core.bid_proposals where id = p_proposal_id;
  select * into b from core.offers where id = pr.bid_buy_offer_id;
  delete from core.bid_proposal_options where proposal_id = p_proposal_id;

  insert into core.bid_proposal_options(proposal_id, rank, supplier_offer_id, supplier_company_id,
    purchase_price_eur_per_kg, suggested_sell_price_eur_per_kg, margin_pct, incoterms, lead_time, rationale)
  select p_proposal_id, row_number() over (order by c.price_eur_per_kg, c.offered_at desc),
    c.id, c.company_id, round(c.price_eur_per_kg, 3),
    b.price_eur_per_kg,
    case when b.price_eur_per_kg > 0 then round(100 * (b.price_eur_per_kg - c.price_eur_per_kg) / b.price_eur_per_kg, 1) end,
    c.incoterms, c.lead_time,
    concat_ws(' · ',
      case c.source when 'airtable' then 'Oferta dostawcy (purchase@)' when 'apex_bid' then 'BID SELL z Apex' else c.source end,
      coalesce(co.name, c.producer_name),
      round(c.price_eur_per_kg, 2) || ' EUR/kg' || coalesce(' ' || c.incoterms, '') || coalesce(' ' || c.location, ''),
      'z ' || to_char(c.offered_at, 'DD.MM.YYYY') || ' (' || (current_date - c.offered_at::date) || ' dni temu)',
      case when c.quantity_kg is not null then 'dostępne ' || round(c.quantity_kg) || ' kg' end,
      case when b.incoterms is not null and c.incoterms is not null and upper(b.incoterms) <> upper(c.incoterms)
           then 'uwaga: klient chce ' || b.incoterms || coalesce(' ' || b.location, '') end)
  from (
    select distinct on (coalesce(s.company_id::text, s.source || ':' || coalesce(lower(s.producer_name), s.id::text))) s.*
    from core.offers s
    where s.product_id = b.product_id
      and s.direction in ('supplier_to_us', 'bid_sell')
      and s.price_eur_per_kg is not null and s.price_eur_per_kg > 0
      and s.offered_at > now() - make_interval(days => p_offer_days)
      and coalesce(s.review_status, '') <> 'rejected'
      and not exists (select 1 from core.v_offer_match_rejections r
                      where r.root_product_id = b.product_id
                        and r.offer_name_norm = core.norm_product_name(s.product_name_raw))
    order by coalesce(s.company_id::text, s.source || ':' || coalesce(lower(s.producer_name), s.id::text)), s.offered_at desc
  ) c
  left join core.companies co on co.id = c.company_id
  order by c.price_eur_per_kg, c.offered_at desc
  limit p_options;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 3. Odrzucenie oferty z karty
create or replace function purchase_api.bid_option_reject(p_option_id bigint, p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare
  o core.bid_proposal_options;
  pr core.bid_proposals;
  s core.offers;
  v_norm text;
  v_rule bigint;
  v_item bigint;
begin
  if p_by is null or trim(p_by) = '' then raise exception 'Brak decided_by'; end if;
  select * into o from core.bid_proposal_options where id = p_option_id;
  if not found then raise exception 'Tej oferty nie ma już na karcie. Odśwież stronę.'; end if;
  select * into pr from core.bid_proposals where id = o.proposal_id for update;
  if pr.status <> 'pending_review' then raise exception 'Propozycja jest już rozstrzygnięta. Najpierw cofnij decyzję.'; end if;
  select * into s from core.offers where id = o.supplier_offer_id;
  v_norm := core.norm_product_name(s.product_name_raw);
  if v_norm is null then raise exception 'Oferta nie ma nazwy produktu, więc nie da się jej odrzucić.'; end if;

  select id into v_rule from core.v_offer_match_rejections
  where root_product_id = core.product_root(pr.product_id) and offer_name_norm = v_norm limit 1;
  if v_rule is null then
    -- pytanie do przeglądu: czy ta nazwa należy do produktu karty (jedna otwarta pozycja na nazwę)
    select q.id into v_item from core.review_queue q
    where q.status = 'open' and q.item_type = 'product_mapping' and q.entity_id = pr.product_id
      and core.norm_product_name(q.suggestion->>'name') = v_norm
    limit 1;
    if v_item is null then
      insert into core.review_queue(item_type, entity_table, entity_id, reason, suggestion)
      values ('product_mapping', 'core.products', pr.product_id, 'Oferta odrzucona na karcie BID BUY',
              jsonb_build_object('name', s.product_name_raw, 'product_id', pr.product_id,
                                 'reason', 'Rejected on a BID BUY card by ' || p_by, 'source', 'bid_card'))
      returning id into v_item;
    end if;
    -- reguła mogła zostać wyłączona zatwierdzeniem pozycji albo przywróceniem: zakładamy nową
    update core.offer_match_rejections set restored_by = p_by, restored_at = now()
    where product_id = pr.product_id and offer_name_norm = v_norm and restored_at is null;
    insert into core.offer_match_rejections(product_id, offer_name_norm, offer_name_raw, supplier_offer_id, proposal_id,
                                            review_item_id, rejected_by)
    values (pr.product_id, v_norm, s.product_name_raw, s.id, pr.id, v_item, p_by)
    returning id into v_rule;
  end if;

  return jsonb_build_object('rejectionId', v_rule, 'reviewItemId', v_item,
                            'proposalsRefreshed', core._refresh_proposals(array[pr.product_id]));
end $$;

-- 4. Przywrócenie odrzuconej oferty: reguła przestaje działać, a otwarta pozycja przeglądu zamyka się jako „pasuje”
create or replace function purchase_api.bid_option_restore(p_rejection_id bigint, p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare r core.offer_match_rejections;
begin
  if p_by is null or trim(p_by) = '' then raise exception 'Brak decided_by'; end if;
  select * into r from core.offer_match_rejections where id = p_rejection_id for update;
  if not found or r.restored_at is not null then raise exception 'To odrzucenie jest już przywrócone. Odśwież stronę.'; end if;
  update core.offer_match_rejections set restored_by = p_by, restored_at = now() where id = r.id;
  update core.review_queue set status = 'approved', resolution = 'approved', decided_by = p_by, decided_at = now()
  where id = r.review_item_id and status = 'open';
  return jsonb_build_object('rejectionId', r.id,
                            'proposalsRefreshed', core._refresh_proposals(array_remove(array[r.product_id, core.product_root(r.product_id)], null)));
end $$;

-- 5. Lista propozycji: jak dotąd, plus odrzucone oferty produktu karty ('rejected')
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
                 where o.proposal_id = p.id), '[]'::jsonb),
               'rejected', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', r.id, 'productName', r.offer_name_raw, 'supplier', coalesce(rc.name, ro.producer_name),
                          'rejectedBy', r.rejected_by, 'rejectedAt', r.rejected_at)
                        order by r.rejected_at desc)
                 from core.v_offer_match_rejections r
                 left join core.offers ro on ro.id = r.supplier_offer_id
                 left join core.companies rc on rc.id = ro.company_id
                 where r.root_product_id = p.product_id), '[]'::jsonb))
             order by p.bid_buy_at desc, p.id desc)
      from page p
      join core.offers b on b.id = p.bid_buy_offer_id
      join core.products pr on pr.id = p.product_id
      left join core.employees emp on emp.id = b.employee_id
      left join core.companies cu on cu.id = p.customer_company_id), '[]'::jsonb))
$$;

-- 6. Dostęp: tylko service_role (serwer centrum)
revoke all on all functions in schema purchase_api from public, anon, authenticated;
grant execute on all functions in schema purchase_api to service_role;

-- Sprawdzenie: liczba działających reguł (na start 0)
select count(*) as active_rejections from core.v_offer_match_rejections;
