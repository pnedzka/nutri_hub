-- Purchase Manager: "Open in Spark" next to offers that came by e-mail (Michał Roman's request of 18.11.2026).
-- core.offer_message(offer) finds the e-mail an offer came from: offers from purchase@ reach the database through
-- Airtable (Sender Email, Email Subject, Source Mailbox), and the same e-mail sits in raw.emails with its real
-- Message-ID; the closest one in time wins. bid_proposal_list and offer_search return messageId and mailbox next to
-- each offer; the screen builds the Spark link from them. Offers without a match (sales@, office@, Apex Bid) get null.
-- Run in the SQL Editor of nutri-central-db, after bid_original_prices.sql. Removes nothing.

create index if not exists airtable_records_record_id_idx on raw.airtable_records (record_id);
create index if not exists emails_mailbox_subject_idx on raw.emails (mailbox, subject);

create or replace function core.offer_message(p_offer_id bigint)
returns table(message_id text, mailbox text) language sql stable set search_path = core, public as $$
  select e.message_id, e.mailbox
  from core.offers o
  join raw.airtable_records r on r.record_id = o.source_id and r.table_name = 'Offers'
  join raw.emails e
    on e.mailbox = lower(r.payload->'fields'->>'Source Mailbox') || '@nutripartners.co'
   and e.subject = r.payload->'fields'->>'Email Subject'
   and position(lower(r.payload->'fields'->>'Sender Email') in lower(e.from_address)) > 0
  where o.id = p_offer_id and o.source = 'airtable' and e.message_id like '<%'
  order by abs(extract(epoch from e.sent_at - o.offered_at))
  limit 1
$$;

create or replace function purchase_api.bid_proposal_list(p_status text default 'pending_review', p_limit int default 25, p_offset int default 0, p_q text default null)
returns jsonb
language sql
stable
security definer
set search_path = core, extensions, public
as $$
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
                          'incoterms', coalesce(o.incoterms, so.incoterms),
                          'location', so.location, 'leadTime', o.lead_time, 'quantityKg', so.quantity_kg,
                          'offeredAt', so.offered_at, 'source', so.source, 'productName', so.product_name_raw,
                          'trader', se.full_name,
                          'email', e.email, 'emailOf', e.email_of,
                          'messageId', m.message_id, 'mailbox', m.mailbox)
                        order by o.rank)
                 from core.bid_proposal_options o
                 join core.offers so on so.id = o.supplier_offer_id
                 left join core.companies sc on sc.id = o.supplier_company_id
                 left join core.employees se on se.id = so.employee_id
                 left join lateral core.offer_email(so.id) e on true
                 left join lateral core.offer_message(so.id) m on true
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
          'price', h.price, 'currency', h.currency, 'priceUnit', h.price_unit,
          'incoterms', h.incoterms, 'location', h.location, 'leadTime', h.lead_time, 'quantityKg', h.quantity_kg,
          'offeredAt', h.offered_at, 'source', h.source, 'productName', h.product_name_raw, 'trader', h.trader,
          'productId', h.product_id, 'product', h.product,
          'email', e.email, 'emailOf', e.email_of,
          'messageId', m.message_id, 'mailbox', m.mailbox,
          'onThisProduct', h.product_id is not null and core.product_root(h.product_id) = core.product_root(pr.product_id))
        order by h.offered_at desc nulls last, h.id desc) from page h left join lateral core.offer_email(h.id) e on true left join lateral core.offer_message(h.id) m on true), '[]'::jsonb),
      'contractsTotal', (select count(*) from contract_hits),
      'contracts', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'contractId', c.contract_id, 'status', c.contract_status, 'supplier', c.supplier,
          'productName', c.product_name_raw, 'product', c.product, 'quantityKg', c.quantity_kg,
          'priceEurPerKg', round(c.purchase_price_eur_per_kg, 3),
          'price', c.unit_price, 'currency', c.currency, 'priceUnit', c.price_unit, 'incoterms', c.incoterms, 'date', c.closed_at)
        order by c.closed_at desc nulls last, c.id desc) from contract_page c), '[]'::jsonb))
  );
end $$;

revoke all on function core.offer_message(bigint) from public, anon, authenticated;
revoke all on function purchase_api.bid_proposal_list(text, int, int, text) from public, anon, authenticated;
grant execute on function purchase_api.bid_proposal_list(text, int, int, text) to service_role;
revoke all on function purchase_api.offer_search(bigint, text, int) from public, anon, authenticated;
grant execute on function purchase_api.offer_search(bigint, text, int) to service_role;
