-- Karty BID BUY: ranking ofert, znacznik sprzedaży z Apex i wygasanie według ważności BID BUY (decyzje z 10.11.2026).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, po bid_all_offers.sql i offer_email.sql. Niczego nie usuwa
-- poza opcjami kart oczekujących, które przelicza od nowa (jak co godzinę robi n8n). Decyzje Michała zostają.
--
-- 1. Ranking: karta dalej ma WSZYSTKIE oferty na produkt, ale w kolejności wyniku (core.bid_option_score), a interfejs
--    pokazuje 5 pierwszych i „Show all”. Wynik (im wyżej, tym lepiej):
--      bliskość w czasie do BID BUY   do 40 pkt, połowa co 14 dni (stara oferta z purchase@ spada, odpowiedź na BID BUY rośnie)
--      BID SELL z Apex                +25 (dotąd każda sprzedaż z karty była BID SELL z Apex)
--      ma cenę                        +10, i do +10 za najniższą cenę wśród ofert karty
--      cena ≤ cena docelowa BID BUY   +10
--      ilość ≥ zapotrzebowanie        +10
--      incoterms                      +5 zgodne, −5 inne niż w BID BUY
--    Na 7 sprzedażach powiązanych z kartami sprzedana oferta była na pozycji 1, 2, 3, 3, 6, 6 i 31 (wcześniej 1–64).
--    Uwaga: te powiązania są heurystyczne (szukają BID SELL blisko w czasie), więc wynik jest zachęcający, nie dowodem.
-- 2. Znacznik sprzedaży: lista kart podaje 'sold' (BID SOLD z Apex na ten BID BUY). Kartę zamyka zawsze Michał
--    (bez automatycznego zamykania).
-- 3. Wygasanie: karta wygasa 7 dni po ważności BID BUY z Apex (core.offers.valid_until; Apex daje 14–21 dni), a bez
--    niej jak dotąd po p_buy_days (30) dniach. n8n wywołuje generate_bid_proposals(30, 180, 3) bez zmian.
--
-- Powrót do kolejności po cenie: ponownie uruchomić build_bid_proposal_options z bid_all_offers.sql.

-- 0. Wynik opcji (do analizy, jak ranking się sprawdza)
alter table core.bid_proposal_options add column if not exists score numeric;

-- Do kiedy karta jest otwarta
create or replace function core.bid_buy_open_until(p_offered_at timestamptz, p_valid_until timestamptz, p_buy_days int default 30)
returns timestamptz language sql immutable as $$
  select coalesce(p_valid_until, p_offered_at + make_interval(days => p_buy_days)) + interval '7 days'
$$;

-- 1. Opcje: wszystkie oferty na produkt, w kolejności wyniku
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
    purchase_price_eur_per_kg, suggested_sell_price_eur_per_kg, margin_pct, incoterms, lead_time, rationale, score)
  select p_proposal_id, row_number() over (order by c.score desc, c.offered_at desc nulls last, c.id),
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
           then 'uwaga: klient chce ' || b.incoterms || coalesce(' ' || b.location, '') end),
    round(c.score, 1)
  from (
    select s.*,
      -- bliskość w czasie do BID BUY (oferta bez daty: jak bardzo stara)
      40 * power(0.5, coalesce(abs(extract(epoch from (s.offered_at - b.offered_at))) / 86400, 365) / 14.0)
      + case when s.source = 'apex_bid' then 25 else 0 end
      + case when s.price_eur_per_kg is not null
             then 10 + 10 * coalesce(1 - (s.price_eur_per_kg - min(s.price_eur_per_kg) over ())
                                         / nullif(max(s.price_eur_per_kg) over () - min(s.price_eur_per_kg) over (), 0), 1)
             else 0 end
      + case when s.price_eur_per_kg is not null and b.price_eur_per_kg is not null and s.price_eur_per_kg <= b.price_eur_per_kg then 10 else 0 end
      + case when s.quantity_kg is not null and b.quantity_kg is not null and s.quantity_kg >= b.quantity_kg then 10 else 0 end
      + case when s.incoterms is null or b.incoterms is null then 0
             when upper(s.incoterms) = upper(b.incoterms) then 5 else -5 end as score
    from core.offers s
    where s.product_id = b.product_id
      and s.direction in ('supplier_to_us', 'bid_sell')
      and coalesce(s.review_status, '') <> 'rejected'
      and not exists (select 1 from core.v_offer_match_rejections r
                      where r.root_product_id = b.product_id
                        and r.offer_name_norm = core.norm_product_name(s.product_name_raw))
  ) c
  left join core.companies co on co.id = c.company_id
  order by c.score desc, c.offered_at desc nulls last, c.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 2. Generowanie: jak dotąd, ale karta jest otwarta do ważności BID BUY z Apex + 7 dni
create or replace function core.generate_bid_proposals(p_buy_days int default 30, p_offer_days int default 180, p_options int default 3)
returns jsonb language plpgsql as $$
declare
  r record;
  v_pid bigint;
  v_n int;
  v_new int := 0;
  v_no_options int := 0;
  v_refreshed int := 0;
  v_expired int;
begin
  -- 1. nowe BID BUY
  for r in
    select b.* from core.offers b
    where b.direction = 'bid_buy' and b.product_id is not null
      and core.bid_buy_open_until(b.offered_at, b.valid_until, p_buy_days) > now()
      and not exists (select 1 from core.bid_proposals p where p.bid_buy_offer_id = b.id)
  loop
    insert into core.bid_proposals(bid_buy_offer_id, product_id, customer_company_id, requested_quantity_kg, status, generated_by, generated_at)
    values (r.id, r.product_id, r.company_id, r.quantity_kg, 'pending_review', 'sql_v2', now())
    returning id into v_pid;
    v_n := core.build_bid_proposal_options(v_pid, p_offer_days, p_options);
    if v_n = 0 then
      delete from core.bid_proposals where id = v_pid;   -- brak ofert: spróbujemy przy kolejnym przebiegu
      v_no_options := v_no_options + 1;
    else
      v_new := v_new + 1;
    end if;
  end loop;

  -- 2. odśwież opcje oczekujących propozycji (mogły dojść nowe oferty)
  for r in select p.id from core.bid_proposals p join core.offers b on b.id = p.bid_buy_offer_id
           where p.status = 'pending_review'
             and core.bid_buy_open_until(b.offered_at, b.valid_until, p_buy_days) > now()
             and p.generated_at < now() - interval '50 minutes'
  loop
    perform core.build_bid_proposal_options(r.id, p_offer_days, p_options);
    update core.bid_proposals set generated_at = now() where id = r.id;
    v_refreshed := v_refreshed + 1;
  end loop;

  -- 3. wygaś po ważności
  update core.bid_proposals p set status = 'expired'
  from core.offers b
  where b.id = p.bid_buy_offer_id and p.status = 'pending_review'
    and core.bid_buy_open_until(b.offered_at, b.valid_until, p_buy_days) <= now();
  get diagnostics v_expired = row_count;

  return jsonb_build_object('new', v_new, 'bid_buy_without_offers', v_no_options, 'refreshed', v_refreshed, 'expired', v_expired);
end $$;

-- 3. Lista kart: jak dotąd, plus wynik opcji, data wygaśnięcia karty i sprzedaże z Apex ('sold')
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

-- 4. Przeliczenie: nowe kolejności na kartach oczekujących, wygaśnięcie kart po ważności (ok. 30 kart)
select core._refresh_proposals(array(select distinct product_id from core.bid_proposals where status = 'pending_review')) as refreshed,
       core.generate_bid_proposals(30, 180, 3) as generated;
