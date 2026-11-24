-- BID SELL, który powtarza ofertę dostawcy z maila (prośba Michała Romana, 24.11.2026).
--
-- Purchase Manager dostaje ofertę mailem (purchase@ → Airtable → core.offers, supplier_to_us)
-- i po chwili wrzuca ją na czat jako BID SELL (Apex Bid → core.offers, bid_sell). Na karcie
-- BID BUY były wtedy dwie pozycje z tą samą ceną. Teraz to jedna pozycja: oferta z maila
-- (zna dostawcę, e-mail i Spark), uzupełniona o ilość, miejsce i płatność z BID SELL,
-- ze znacznikiem, że poszła jako BID SELL, i z rankingiem jak BID SELL.
--
-- Bliźniak: BID SELL i oferta dostawcy na ten sam produkt, cena w EUR/kg różni się
-- najwyżej o 1%, mail przyszedł od 2 dni przed do 6 godzin po BID SELL. Przy kilku
-- kandydatach wygrywa ten z tymi samymi Incoterms, potem najbliższy w czasie.
-- Dane z 30 dni do 24.11: 161 z 269 BID SELL Michała ma takiego bliźniaka, BID SELL
-- innych traderów: żaden.
--
-- Uruchomić raz w SQL Editorze nutri-central-db. Karty pending przebudują się same przy
-- najbliższych synchronizacjach Apex Bid (generate_bid_proposals), rozstrzygniętych to
-- nie dotyka.

-- 1. Oferta dostawcy, którą powtarza dany BID SELL (null, gdy żadna).
create or replace function core.bid_sell_twin(p_bid_sell_id bigint)
returns bigint
language sql
stable
set search_path = core, public
as $$
  select m.id
  from core.offers bs
  join core.offers m
    on m.direction = 'supplier_to_us'
   and m.product_id = bs.product_id
   and coalesce(m.review_status, '') <> 'rejected'
   and m.price_eur_per_kg is not null
   and abs(m.price_eur_per_kg - bs.price_eur_per_kg) <= 0.01 * bs.price_eur_per_kg
   and m.offered_at between bs.offered_at - interval '2 days' and bs.offered_at + interval '6 hours'
  where bs.id = p_bid_sell_id
    and bs.direction = 'bid_sell'
    and bs.product_id is not null
    and bs.price_eur_per_kg is not null
    and bs.offered_at is not null
  order by (upper(coalesce(m.incoterms, '')) = upper(coalesce(bs.incoterms, ''))) desc,
           abs(extract(epoch from (bs.offered_at - m.offered_at))),
           m.id
  limit 1
$$;

-- 2. Najnowszy BID SELL, który powtarza daną ofertę dostawcy (null, gdy żaden).
create or replace function core.supplier_offer_bid_sell(p_offer_id bigint)
returns bigint
language sql
stable
set search_path = core, public
as $$
  select bs.id
  from core.offers m
  join core.offers bs
    on bs.direction = 'bid_sell'
   and bs.product_id = m.product_id
   and bs.offered_at between m.offered_at - interval '6 hours' and m.offered_at + interval '2 days'
  where m.id = p_offer_id
    and m.direction = 'supplier_to_us'
    and core.bid_sell_twin(bs.id) = m.id
  order by bs.offered_at desc, bs.id desc
  limit 1
$$;

-- 3. Opcje karty: BID SELL z bliźniakiem na karcie znika, a oferta z maila przejmuje jego
--    ilość, miejsce, płatność i premię rankingu BID SELL.
create or replace function core.build_bid_proposal_options(p_proposal_id bigint, p_offer_days integer default 180, p_options integer default 3)
returns integer
language plpgsql
as $function$
declare
  pr core.bid_proposals;
  b core.offers;
  v_n int;
begin
  select * into pr from core.bid_proposals where id = p_proposal_id;
  select * into b from core.offers where id = pr.bid_buy_offer_id;
  delete from core.bid_proposal_options where proposal_id = p_proposal_id;

  insert into core.bid_proposal_options(proposal_id, rank, supplier_offer_id, supplier_company_id,
    purchase_price_eur_per_kg, suggested_sell_price_eur_per_kg, margin_pct, incoterms, lead_time, rationale, score)
  with cand as (
    select s.*
    from core.offers s
    where s.product_id = b.product_id
      and s.direction in ('supplier_to_us', 'bid_sell')
      and coalesce(s.review_status, '') <> 'rejected'
      and not exists (select 1 from core.v_offer_match_rejections r
                      where r.root_product_id = b.product_id
                        and r.offer_name_norm = core.norm_product_name(s.product_name_raw))
  ), twins as (
    select bs.id as bid_sell_id, core.bid_sell_twin(bs.id) as offer_id, bs.offered_at
    from cand bs
    where bs.direction = 'bid_sell'
  ), twin_of as (
    -- jedna oferta z maila może mieć kilka BID SELL: bierzemy najnowszy
    select distinct on (t.offer_id) t.offer_id, t.bid_sell_id
    from twins t
    where t.offer_id in (select id from cand)
    order by t.offer_id, t.offered_at desc, t.bid_sell_id desc
  ), merged as (
    select s.id, s.company_id, s.producer_name, s.source, s.price_eur_per_kg, s.offered_at, s.lead_time,
      coalesce(s.incoterms, bs.incoterms) as incoterms,
      coalesce(s.location, bs.location) as location,
      coalesce(s.quantity_kg, bs.quantity_kg) as quantity_kg,
      bs.id as bid_sell_id
    from cand s
    left join twin_of t on t.offer_id = s.id
    left join cand bs on bs.id = t.bid_sell_id
    where not exists (select 1 from twins t2
                      where t2.bid_sell_id = s.id and t2.offer_id in (select id from cand))
  ), c as (
    select s.*,
      -- bliskość w czasie do BID BUY (oferta bez daty: jak bardzo stara)
      40 * power(0.5, coalesce(abs(extract(epoch from (s.offered_at - b.offered_at))) / 86400, 365) / 14.0)
      + case when s.source = 'apex_bid' or s.bid_sell_id is not null then 25 else 0 end
      + case when s.price_eur_per_kg is not null
             then 10 + 10 * coalesce(1 - (s.price_eur_per_kg - min(s.price_eur_per_kg) over ())
                                         / nullif(max(s.price_eur_per_kg) over () - min(s.price_eur_per_kg) over (), 0), 1)
             else 0 end
      + case when s.price_eur_per_kg is not null and b.price_eur_per_kg is not null and s.price_eur_per_kg <= b.price_eur_per_kg then 10 else 0 end
      + case when s.quantity_kg is not null and b.quantity_kg is not null and s.quantity_kg >= b.quantity_kg then 10 else 0 end
      + case when s.incoterms is null or b.incoterms is null then 0
             when upper(s.incoterms) = upper(b.incoterms) then 5 else -5 end as score
    from merged s
  )
  select p_proposal_id, row_number() over (order by c.score desc, c.offered_at desc nulls last, c.id),
    c.id, c.company_id, round(c.price_eur_per_kg, 3),
    b.price_eur_per_kg,
    case when b.price_eur_per_kg > 0 then round(100 * (b.price_eur_per_kg - c.price_eur_per_kg) / b.price_eur_per_kg, 1) end,
    c.incoterms, c.lead_time,
    concat_ws(' · ',
      case c.source when 'airtable' then 'Oferta dostawcy (purchase@)' when 'apex_bid' then 'BID SELL z Apex' else c.source end,
      case when c.bid_sell_id is not null then 'wysłana też jako BID SELL' end,
      coalesce(co.name, c.producer_name),
      coalesce(round(c.price_eur_per_kg, 2) || ' EUR/kg', 'bez ceny') || coalesce(' ' || c.incoterms, '') || coalesce(' ' || c.location, ''),
      'z ' || to_char(c.offered_at, 'DD.MM.YYYY') || ' (' || (current_date - c.offered_at::date) || ' dni temu)',
      case when c.quantity_kg is not null then 'dostępne ' || round(c.quantity_kg) || ' kg' end,
      case when b.incoterms is not null and c.incoterms is not null and upper(b.incoterms) <> upper(c.incoterms)
           then 'uwaga: klient chce ' || b.incoterms || coalesce(' ' || b.location, '') end),
    round(c.score, 1)
  from c
  left join core.companies co on co.id = c.company_id
  order by c.score desc, c.offered_at desc nulls last, c.id;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- 4. Lista kart: przy ofercie z maila pole bidSell (kiedy, kto, ilość, miejsce, płatność,
--    treść), ilość i miejsce uzupełnione z BID SELL; BID SOLD do BID SELL z bliźniakiem
--    wskazuje ofertę z maila.
create or replace function purchase_api.bid_proposal_list(p_status text default 'pending_review'::text, p_limit integer default 25, p_offset integer default 0, p_q text default null::text)
returns jsonb
language sql
stable security definer
set search_path to 'core', 'extensions', 'public'
as $function$
  with matched as (
    select p.id, p.status
    from core.bid_proposals p
    where coalesce(trim(p_q), '') = '' or core.bid_proposal_matches(p.id, p_q)
  ), filtered as (
    select p.*, b.offered_at as bid_buy_at
    from core.bid_proposals p
    join matched m on m.id = p.id
    join core.offers b on b.id = p.bid_buy_offer_id
    where p_status is null or p.status = p_status
  ), page as (
    select * from filtered order by bid_buy_at desc, id desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from matched group by 1) c),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'status', p.status, 'generatedAt', p.generated_at,
               'productId', pr.id, 'product', pr.canonical_name, 'category', pr.category,
               'bidBuyAt', b.offered_at, 'salesRep', emp.full_name, 'customer', cu.name,
               'openUntil', core.bid_buy_open_until(b.offered_at, b.valid_until),
               'requestedKg', coalesce(p.requested_quantity_kg, b.quantity_kg),
               'targetPriceEurPerKg', b.price_eur_per_kg,
               'targetPrice', b.price, 'targetCurrency', b.currency, 'targetPriceUnit', b.price_unit,
               'requestedIncoterms', b.incoterms, 'requestedLocation', b.location, 'bidBuyText', b.raw_text,
               'reviewedBy', p.reviewed_by, 'reviewedAt', p.reviewed_at, 'reviewNote', p.review_note,
               'chosenOptionId', p.chosen_option_id,
               'options', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', o.id, 'rank', o.rank, 'score', o.score, 'supplier', coalesce(sc.name, so.producer_name),
                          'priceEurPerKg', o.purchase_price_eur_per_kg, 'price', so.price, 'currency', so.currency, 'priceUnit', so.price_unit,
                          'incoterms', coalesce(o.incoterms, so.incoterms, tw.incoterms),
                          'location', coalesce(so.location, tw.location), 'leadTime', o.lead_time,
                          'quantityKg', coalesce(so.quantity_kg, tw.quantity_kg),
                          'offeredAt', so.offered_at, 'source', so.source, 'productName', so.product_name_raw,
                          'trader', se.full_name,
                          'email', e.email, 'emailOf', e.email_of,
                          'messageId', m.message_id, 'mailbox', m.mailbox,
                          'bidSell', case when tw.id is not null then jsonb_build_object(
                            'offerId', tw.id, 'offeredAt', tw.offered_at, 'trader', twe.full_name,
                            'quantityKg', tw.quantity_kg, 'location', tw.location,
                            'paymentTerms', tw.payment_terms, 'text', tw.raw_text) end)
                        order by o.rank)
                 from core.bid_proposal_options o
                 join core.offers so on so.id = o.supplier_offer_id
                 left join core.companies sc on sc.id = o.supplier_company_id
                 left join core.employees se on se.id = so.employee_id
                 left join lateral core.offer_email(so.id) e on true
                 left join lateral core.offer_message(so.id) m on true
                 left join core.offers tw on so.direction = 'supplier_to_us' and tw.id = core.supplier_offer_bid_sell(so.id)
                 left join core.employees twe on twe.id = tw.employee_id
                 where o.proposal_id = p.id), '[]'::jsonb),
               'sold', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'dealId', d.id, 'soldAt', coalesce(d.closed_at, d.created_at), 'trader', de.full_name,
                          'quantityKg', d.quantity_kg, 'certain', d.match_method = 'explicit',
                          'offerId', d.bid_sell_offer_id,
                          'optionId', (select o.id from core.bid_proposal_options o
                                       where o.proposal_id = p.id
                                         and o.supplier_offer_id in (d.bid_sell_offer_id, core.bid_sell_twin(d.bid_sell_offer_id))
                                       order by (o.supplier_offer_id = d.bid_sell_offer_id) desc
                                       limit 1),
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
                          'price', d.unit_price, 'currency', d.currency, 'priceUnit', d.price_unit,
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
$function$;
