-- Adres e-mail przy ofertach na kartach BID BUY i w wynikach wyszukiwarki (przycisk "Copy e-mail", 30.10.2026).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, po offer_search.sql. Niczego nie usuwa.
--
-- Skąd adres: kontakt przypisany do oferty (mail z purchase@), inaczej najnowszy kontakt z adresem w tej samej firmie.
-- BID SELL z Apex nie podaje dostawcy, więc tam jest adres handlowca, który wrzucił ofertę (email_of = 'trader').

create or replace function core.offer_email(p_offer_id bigint)
returns table(email text, email_of text) language sql stable set search_path = core, public as $$
  select coalesce(c.email, cc.email, emp.email),
         case when coalesce(c.email, cc.email) is not null then 'supplier' when emp.email is not null then 'trader' end
  from core.offers o
  left join core.contacts c on c.id = o.contact_id and c.email is not null
  left join lateral (select x.email from core.contacts x
                     where c.email is null and x.company_id = o.company_id and x.email is not null
                     order by x.updated_at desc nulls last, x.id desc limit 1) cc on o.company_id is not null
  left join core.employees emp on emp.id = o.employee_id and o.source = 'apex_bid'
  where o.id = p_offer_id
$$;

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

create or replace function purchase_api.offer_search(p_proposal_id bigint, p_q text, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = core, extensions, public as $$
declare
  pr core.bid_proposals;
  v_words text[] := core.search_words(p_q);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  select * into pr from core.bid_proposals where id = p_proposal_id;
  if not found then raise exception 'Propozycja % nie istnieje', p_proposal_id; end if;
  if cardinality(v_words) = 0 then
    return jsonb_build_object('q', p_q, 'total', 0, 'offers', '[]'::jsonb, 'contractsTotal', 0, 'contracts', '[]'::jsonb);
  end if;

  return (
    with hits as (
      select o.*, coalesce(co.name, o.producer_name) as supplier, p.canonical_name as product, se.full_name as trader
      from core.offers o
      left join core.companies co on co.id = o.company_id
      left join core.products p on p.id = o.product_id
      left join core.employees se on se.id = o.employee_id
      where o.direction in ('supplier_to_us', 'bid_sell')
        and coalesce(o.review_status, '') <> 'rejected'
        and not exists (select 1 from core.bid_proposal_options x where x.proposal_id = pr.id and x.supplier_offer_id = o.id)
        and core.matches_all_words(v_words, concat_ws(' ', o.product_name_raw, p.canonical_name, co.name, o.producer_name))
    ), page as (
      select * from hits order by offered_at desc nulls last, id desc limit v_limit
    ), contract_hits as (
      select d.*, co.name as supplier, p.canonical_name as product
      from core.deals d
      left join core.companies co on co.id = d.supplier_company_id
      left join core.products p on p.id = d.product_id
      where d.source = 'intranet' and d.contract_type = 'P'
        and core.matches_all_words(v_words, concat_ws(' ', d.product_name_raw, p.canonical_name, co.name))
    ), contract_page as (
      select * from contract_hits order by closed_at desc nulls last, id desc limit v_limit
    )
    select jsonb_build_object(
      'q', p_q,
      'total', (select count(*) from hits),
      'offers', coalesce((select jsonb_agg(jsonb_build_object(
          'offerId', h.id, 'supplier', h.supplier, 'priceEurPerKg', round(h.price_eur_per_kg, 3),
          'incoterms', h.incoterms, 'location', h.location, 'leadTime', h.lead_time, 'quantityKg', h.quantity_kg,
          'offeredAt', h.offered_at, 'source', h.source, 'productName', h.product_name_raw, 'trader', h.trader,
          'productId', h.product_id, 'product', h.product,
          'email', e.email, 'emailOf', e.email_of,
          'onThisProduct', h.product_id is not null and core.product_root(h.product_id) = core.product_root(pr.product_id))
        order by h.offered_at desc nulls last, h.id desc) from page h left join lateral core.offer_email(h.id) e on true), '[]'::jsonb),
      'contractsTotal', (select count(*) from contract_hits),
      'contracts', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'contractId', c.contract_id, 'status', c.contract_status, 'supplier', c.supplier,
          'productName', c.product_name_raw, 'product', c.product, 'quantityKg', c.quantity_kg,
          'priceEurPerKg', round(c.purchase_price_eur_per_kg, 3), 'incoterms', c.incoterms, 'date', c.closed_at)
        order by c.closed_at desc nulls last, c.id desc) from contract_page c), '[]'::jsonb))
  );
end $$;

revoke all on all functions in schema purchase_api from public, anon, authenticated;
grant execute on all functions in schema purchase_api to service_role;
