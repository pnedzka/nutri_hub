-- Wyszukiwarka BID BUY nad listą Bid sell proposals (30.10.2026). Uruchom w Supabase SQL Editor projektu nutri-central-db,
-- po offer_email.sql. Niczego w danych nie zmienia.
--
-- purchase_api.bid_proposal_list dostaje parametr p_q: fraza przeszukuje wszystkie karty (każdy status, wszystkie strony)
-- po nazwie produktu i kategorii, nazwie z BID BUY, treści wiadomości BID BUY, handlowcu i kliencie. Każde słowo musi
-- pasować (fragment albo podobne słowo, jak w wyszukiwarce ofert). Liczniki statusów liczą tylko pasujące karty.
-- Pusta fraza = lista jak dotąd.

-- Stara wersja (3 parametry) obok nowej dawałaby niejednoznaczne wywołanie z API.
drop function if exists purchase_api.bid_proposal_list(text, int, int);

create or replace function purchase_api.bid_proposal_list(p_status text default 'pending_review', p_limit int default 25, p_offset int default 0,
                                                     p_q text default null)
returns jsonb language sql stable security definer set search_path = core, extensions, public as $$
  with words as (
    select core.search_words(p_q) as w
  ), found as (
    select p.*, b.offered_at as bid_buy_at
    from core.bid_proposals p
    join core.offers b on b.id = p.bid_buy_offer_id
    cross join words
    where cardinality(words.w) = 0
       or core.matches_all_words(words.w, concat_ws(' ',
            (select concat_ws(' ', pr.canonical_name, pr.category) from core.products pr where pr.id = p.product_id),
            b.product_name_raw, b.raw_text,
            (select e.full_name from core.employees e where e.id = b.employee_id),
            (select c.name from core.companies c where c.id = p.customer_company_id)))
  ), filtered as (
    select * from found where p_status is null or status = p_status
  ), page as (
    select * from filtered order by bid_buy_at desc, id desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from found group by 1) c),
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
                          'trader', se.full_name,
                          'email', e.email, 'emailOf', e.email_of)
                        order by o.rank)
                 from core.bid_proposal_options o
                 join core.offers so on so.id = o.supplier_offer_id
                 left join core.companies sc on sc.id = o.supplier_company_id
                 left join core.employees se on se.id = so.employee_id
                 left join lateral core.offer_email(so.id) e on true
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
