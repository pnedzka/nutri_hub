-- Karty BID BUY: ostatnie zakupy produktu z kontraktów intranetu (decyzja z 10.11.2026).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, PO bid_card_ranking.sql. Niczego nie usuwa i niczego nie przelicza.
--
-- Kontrakty z intranetu (core.deals, source = 'intranet') były dotąd widoczne tylko w wyszukiwarce na karcie.
-- Lista kart zwraca teraz dla każdej karty 3 ostatnie pozycje kontraktów ZAKUPU tego produktu ('purchases':
-- dostawca, cena zakupu EUR/kg, ilość, warunki, data, numer kontraktu, kto kupował) i ich łączną liczbę
-- ('purchasesTotal'). To informacja obok ofert: kontrakt nie jest ofertą, nie wchodzi do rankingu i nie da się go
-- zatwierdzić. Tylko ceny zakupu. Reszta funkcji jest bez zmian (kopia z bid_card_ranking.sql).

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
               'openUntil', core.bid_buy_open_until(b.offered_at, b.valid_until),
               'requestedKg', coalesce(p.requested_quantity_kg, b.quantity_kg),
               'targetPriceEurPerKg', b.price_eur_per_kg,
               'requestedIncoterms', b.incoterms, 'requestedLocation', b.location, 'bidBuyText', b.raw_text,
               'reviewedBy', p.reviewed_by, 'reviewedAt', p.reviewed_at, 'reviewNote', p.review_note,
               'chosenOptionId', p.chosen_option_id,
               'options', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', o.id, 'rank', o.rank, 'score', o.score, 'supplier', coalesce(sc.name, so.producer_name),
                          'priceEurPerKg', o.purchase_price_eur_per_kg, 'incoterms', coalesce(o.incoterms, so.incoterms),
                          'location', so.location, 'leadTime', o.lead_time, 'quantityKg', so.quantity_kg,
                          'offeredAt', so.offered_at, 'source', so.source, 'productName', so.product_name_raw,
                          'trader', se.full_name,
                          'email', e.email, 'emailOf', e.email_of)
                        order by o.rank)
                 from core.bid_proposal_options o
                 join core.offers so on so.id = o.supplier_offer_id
                 left join core.companies sc on sc.id = o.supplier_company_id
                 left join core.employees se on se.id = so.employee_id
                 left join lateral core.offer_email(so.id) e on true
                 where o.proposal_id = p.id), '[]'::jsonb),
               'sold', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'dealId', d.id, 'soldAt', coalesce(d.closed_at, d.created_at), 'trader', de.full_name,
                          'quantityKg', d.quantity_kg, 'certain', d.match_method = 'explicit',
                          'offerId', d.bid_sell_offer_id,
                          'optionId', (select o.id from core.bid_proposal_options o
                                       where o.proposal_id = p.id and o.supplier_offer_id = d.bid_sell_offer_id limit 1),
                          'text', d.raw_text)
                        order by coalesce(d.closed_at, d.created_at) desc)
                 from core.deals d
                 left join core.employees de on de.id = d.employee_id
                 where d.source = 'apex_bid' and d.bid_buy_offer_id = p.bid_buy_offer_id), '[]'::jsonb),
               'purchases', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', d.id, 'contractId', d.contract_id, 'status', d.contract_status,
                          'supplier', dc.name, 'buyer', de.full_name, 'productName', d.product_name_raw,
                          'quantityKg', d.quantity_kg, 'priceEurPerKg', round(d.purchase_price_eur_per_kg, 3),
                          'incoterms', d.incoterms, 'date', d.closed_at)
                        order by d.closed_at desc nulls last, d.id desc)
                 from (
                   select d.* from core.deals d
                   where d.source = 'intranet' and d.contract_type = 'P' and d.product_id is not null
                     and core.product_root(d.product_id) = core.product_root(p.product_id)
                   order by d.closed_at desc nulls last, d.id desc
                   limit 3) d
                 left join core.companies dc on dc.id = d.supplier_company_id
                 left join core.employees de on de.id = d.employee_id), '[]'::jsonb),
               'purchasesTotal', (
                 select count(*) from core.deals d
                 where d.source = 'intranet' and d.contract_type = 'P' and d.product_id is not null
                   and core.product_root(d.product_id) = core.product_root(p.product_id)),
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

select 'bid_card_purchases ready' as status;
