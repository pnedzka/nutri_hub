-- Wyszukiwarka ofert na kartach BID BUY (30.10.2026). Uruchom w Supabase SQL Editor projektu nutri-central-db,
-- po bid_all_offers.sql. Niczego nie usuwa.
--
-- purchase_api.offer_search: szuka frazy w CAŁEJ bazie ofert (od dostawców i BID SELL z Apex) oraz w kontraktach
-- zakupu z intranetu. Każde słowo frazy musi pasować do nazwy z oferty, nazwy produktu, dostawcy albo producenta
-- (fragment słowa albo podobne słowo, więc drobne literówki przechodzą). Na razie bez pełnej treści maili i wiadomości
-- (decyzja z 30.10.2026). Najnowsze na górze. Oferty, które już są na karcie, są pominięte.
--
-- purchase_api.bid_proposal_choose_offer: zatwierdza propozycję ofertą znalezioną wyszukiwarką (dopisuje ją jako
-- opcję karty i ją wybiera). Cofnięcie decyzji przelicza opcje od nowa, więc taka opcja wtedy znika z karty.
--
-- purchase_api.offer_assign_product: "Add to this product". Nazwa z oferty staje się aliasem produktu karty, a wszystkie
-- oferty, zapytania i kontrakty o tej nazwie przechodzą na ten produkt. Reguła ✕ dla tej nazwy na tym produkcie
-- przestaje działać. Odwrotność: ✕ na karcie. Decyzja zapisuje się w core.review_queue (kto i kiedy).

create extension if not exists pg_trgm with schema extensions;

create index if not exists offers_product_name_trgm_idx on core.offers using gin (lower(product_name_raw) extensions.gin_trgm_ops);
create index if not exists deals_product_name_trgm_idx on core.deals using gin (lower(product_name_raw) extensions.gin_trgm_ops);

-- Słowa frazy: małe litery, co najmniej 2 znaki, najwyżej 6 słów.
create or replace function core.search_words(p_q text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(w), '{}')
  from (select w from unnest(regexp_split_to_array(lower(trim(coalesce(p_q, ''))), '[^[:alnum:]%.,-]+')) w
        where length(w) >= 2 limit 6) x
$$;

-- Czy tekst zawiera każde słowo (fragment albo podobne słowo).
create or replace function core.matches_all_words(p_words text[], p_text text)
returns boolean language sql immutable set search_path = core, extensions, public as $$
  select cardinality(p_words) > 0 and not exists (
    select 1 from unnest(p_words) w
    where not (lower(coalesce(p_text, '')) like '%' || w || '%'
               or (length(w) >= 4 and extensions.word_similarity(w, lower(coalesce(p_text, ''))) >= 0.7)))
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
          'onThisProduct', h.product_id is not null and core.product_root(h.product_id) = core.product_root(pr.product_id))
        order by h.offered_at desc nulls last, h.id desc) from page h), '[]'::jsonb),
      'contractsTotal', (select count(*) from contract_hits),
      'contracts', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'contractId', c.contract_id, 'status', c.contract_status, 'supplier', c.supplier,
          'productName', c.product_name_raw, 'product', c.product, 'quantityKg', c.quantity_kg,
          'priceEurPerKg', round(c.purchase_price_eur_per_kg, 3), 'incoterms', c.incoterms, 'date', c.closed_at)
        order by c.closed_at desc nulls last, c.id desc) from contract_page c), '[]'::jsonb))
  );
end $$;

create or replace function purchase_api.bid_proposal_choose_offer(p_id bigint, p_offer_id bigint, p_by text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare
  pr core.bid_proposals;
  s core.offers;
  b core.offers;
  v_option bigint;
begin
  if p_by is null or trim(p_by) = '' then raise exception 'Brak decided_by'; end if;
  select * into pr from core.bid_proposals where id = p_id for update;
  if not found then raise exception 'Propozycja % nie istnieje', p_id; end if;
  if pr.status <> 'pending_review' then raise exception 'Propozycja jest już rozstrzygnięta. Najpierw cofnij decyzję.'; end if;
  select * into s from core.offers where id = p_offer_id;
  if not found or s.direction not in ('supplier_to_us', 'bid_sell') then raise exception 'Tej oferty nie ma w bazie. Odśwież wyniki.'; end if;
  select * into b from core.offers where id = pr.bid_buy_offer_id;

  select id into v_option from core.bid_proposal_options where proposal_id = p_id and supplier_offer_id = p_offer_id;
  if v_option is null then
    insert into core.bid_proposal_options(proposal_id, rank, supplier_offer_id, supplier_company_id,
      purchase_price_eur_per_kg, suggested_sell_price_eur_per_kg, margin_pct, incoterms, lead_time, rationale)
    values (p_id, coalesce((select max(rank) from core.bid_proposal_options where proposal_id = p_id), 0) + 1,
      s.id, s.company_id, round(s.price_eur_per_kg, 3), b.price_eur_per_kg,
      case when b.price_eur_per_kg > 0 and s.price_eur_per_kg is not null
           then round(100 * (b.price_eur_per_kg - s.price_eur_per_kg) / b.price_eur_per_kg, 1) end,
      s.incoterms, s.lead_time, 'Znaleziona wyszukiwarką przez ' || p_by)
    returning id into v_option;
  end if;

  return purchase_api.bid_proposal_decide(p_id, 'approved', p_by, v_option, p_note);
end $$;

create or replace function purchase_api.offer_assign_product(p_proposal_id bigint, p_offer_id bigint, p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare
  pr core.bid_proposals;
  s core.offers;
  v_target bigint;
  v_norm text;
  v_old bigint[];
  v_offers int; v_inq int; v_deals int;
begin
  if p_by is null or trim(p_by) = '' then raise exception 'Brak decided_by'; end if;
  select * into pr from core.bid_proposals where id = p_proposal_id;
  if not found then raise exception 'Propozycja % nie istnieje', p_proposal_id; end if;
  v_target := core.product_root(pr.product_id);
  if v_target is null then raise exception 'Produkt karty jest odrzucony albo nie istnieje'; end if;
  select * into s from core.offers where id = p_offer_id;
  if not found then raise exception 'Tej oferty nie ma w bazie. Odśwież wyniki.'; end if;
  v_norm := core.norm_product_name(s.product_name_raw);
  if v_norm is null then raise exception 'Oferta nie ma nazwy produktu, więc nie da się jej przypisać.'; end if;

  v_old := array(select distinct product_id from core.offers
                 where core.norm_product_name(product_name_raw) = v_norm and product_id is distinct from v_target and product_id is not null);

  -- nazwa należy odtąd do produktu karty (i tylko do niego)
  delete from core.product_aliases where product_id <> v_target and core.norm_product_name(alias) = v_norm;
  insert into core.product_aliases(product_id, alias, source) values (v_target, s.product_name_raw, 'bid_card')
  on conflict (product_id, alias) do nothing;

  update core.offers set product_id = v_target
  where core.norm_product_name(product_name_raw) = v_norm and product_id is distinct from v_target;
  get diagnostics v_offers = row_count;
  update core.inquiries set product_id = v_target
  where core.norm_product_name(product_name_raw) = v_norm and product_id is distinct from v_target;
  get diagnostics v_inq = row_count;
  update core.deals set product_id = v_target
  where core.norm_product_name(product_name_raw) = v_norm and product_id is distinct from v_target;
  get diagnostics v_deals = row_count;

  update core.product_name_queue set status = 'matched', product_id = v_target, confidence = 1,
         note = 'Przypisane na karcie BID BUY przez: ' || p_by, decided_at = now()
  where name_norm = v_norm;

  -- reguła ✕ dla tej nazwy na tym produkcie przestaje działać; otwarte pytania o tę nazwę są rozstrzygnięte
  update core.offer_match_rejections set restored_by = p_by, restored_at = now()
  where core.product_root(product_id) = v_target and offer_name_norm = v_norm and restored_at is null;
  update core.review_queue set status = 'approved', resolution = 'remapped', resolution_target_id = v_target,
         decided_by = p_by, decided_at = now()
  where status = 'open' and item_type = 'product_mapping' and core.norm_product_name(suggestion->>'name') = v_norm;
  insert into core.review_queue(item_type, entity_table, entity_id, reason, suggestion, status, resolution,
                                resolution_target_id, decided_by, decided_at)
  values ('product_mapping', 'core.products', v_target, 'Przypisane na karcie BID BUY',
          jsonb_build_object('name', s.product_name_raw, 'product_id', v_target, 'from_products', to_jsonb(v_old),
                             'offer_id', s.id, 'proposal_id', pr.id, 'source', 'bid_card'),
          'approved', 'remapped', v_target, p_by, now());

  return jsonb_build_object('productId', v_target, 'name', s.product_name_raw, 'offers', v_offers, 'inquiries', v_inq,
                            'contracts', v_deals,
                            'proposalsRefreshed', core._refresh_proposals(array_append(v_old, v_target)));
end $$;

revoke all on all functions in schema purchase_api from public, anon, authenticated;
grant execute on all functions in schema purchase_api to service_role;
