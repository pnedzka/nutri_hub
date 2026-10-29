-- Propozycje bid sell: na razie WSZYSTKIE oferty na produkt karty, bez względu na wiek i cenę (decyzja z 29.10.2026).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, po bid_option_reject.sql. Niczego nie usuwa poza opcjami
-- oczekujących propozycji, które przelicza od nowa (jak co godzinę robi n8n).
--
-- Wcześniej: najświeższa oferta każdego dostawcy z 180 dni, tylko z ceną, 3 najtańsze. Teraz każda oferta dostawcy
-- (purchase@) i każdy BID SELL z Apex na ten produkt, także stare i bez ceny: najpierw z ceną od najtańszej, potem bez
-- ceny od najnowszej. Parametry p_offer_days i p_options zostają w sygnaturze (n8n podaje 180 i 3), ale nie działają.
-- Powrót do starych zasad: ponownie uruchomić funkcję z bid_option_reject.sql.
-- Oferty odrzucone przyciskiem ✕ (core.v_offer_match_rejections) dalej są pomijane.
-- Lista propozycji podaje też handlowca, który wrzucił BID SELL na WhatsAppa (Apex nie podaje dostawcy): 'trader'.

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
  select p_proposal_id, row_number() over (order by c.price_eur_per_kg nulls last, c.offered_at desc nulls last, c.id),
    c.id, c.company_id, round(c.price_eur_per_kg, 3),
    b.price_eur_per_kg,
    case when b.price_eur_per_kg > 0 then round(100 * (b.price_eur_per_kg - c.price_eur_per_kg) / b.price_eur_per_kg, 1) end,
    c.incoterms, c.lead_time,
    concat_ws(' · ',
      case c.source when 'airtable' then 'Oferta dostawcy (purchase@)' when 'apex_bid' then 'BID SELL z Apex' else c.source end,
      coalesce(co.name, c.producer_name),
      coalesce(round(c.price_eur_per_kg, 2) || ' EUR/kg', 'bez ceny') || coalesce(' ' || c.incoterms, '') || coalesce(' ' || c.location, ''),
      'z ' || to_char(c.offered_at, 'DD.MM.YYYY') || ' (' || (current_date - c.offered_at::date) || ' dni temu)',
      case when c.quantity_kg is not null then 'dostępne ' || round(c.quantity_kg) || ' kg' end,
      case when b.incoterms is not null and c.incoterms is not null and upper(b.incoterms) <> upper(c.incoterms)
           then 'uwaga: klient chce ' || b.incoterms || coalesce(' ' || b.location, '') end)
  from (
    select s.*
    from core.offers s
    where s.product_id = b.product_id
      and s.direction in ('supplier_to_us', 'bid_sell')
      and coalesce(s.review_status, '') <> 'rejected'
      and not exists (select 1 from core.v_offer_match_rejections r
                      where r.root_product_id = b.product_id
                        and r.offer_name_norm = core.norm_product_name(s.product_name_raw))
  ) c
  left join core.companies co on co.id = c.company_id
  order by c.price_eur_per_kg nulls last, c.offered_at desc nulls last, c.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

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
                          'offeredAt', so.offered_at, 'source', so.source, 'productName', so.product_name_raw,
                          'trader', se.full_name)
                        order by o.rank)
                 from core.bid_proposal_options o
                 join core.offers so on so.id = o.supplier_offer_id
                 left join core.companies sc on sc.id = o.supplier_company_id
                 left join core.employees se on se.id = so.employee_id
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

revoke all on all functions in schema purchase_api from public, anon, authenticated;
grant execute on all functions in schema purchase_api to service_role;

-- Przeliczenie oczekujących propozycji i dołożenie kart dla BID BUY, które dotąd nie miały ofert z ceną
select core._refresh_proposals(array(select distinct product_id from core.bid_proposals where status = 'pending_review')) as refreshed,
       core.generate_bid_proposals(30, 180, 3) as generated;
