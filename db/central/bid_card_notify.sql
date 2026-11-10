-- Karty BID BUY: powiadomienia e-mail dla Purchase Managera (decyzja z 10.11.2026: e-mail na bieżąco).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, PO bid_card_ranking.sql. Niczego nie usuwa.
--
-- Co godzinę, zaraz po przeliczeniu kart, n8n („Central DB - Bid sell proposals”) woła core.take_bid_card_news().
-- Funkcja zwraca to, o czym Purchase Manager jeszcze nie dostał wiadomości, i od razu oznacza to jako zgłoszone:
--   cards   nowe karty BID BUY (z 3 najlepszymi ofertami),
--   offers  nowe oferty, które weszły do pierwszej piątki na karcie już wcześniej zgłoszonej.
-- n8n wysyła JEDEN e-mail na przebieg i tylko wtedy, gdy jest coś nowego. Oferty spoza pierwszej piątki nie są
-- zgłaszane (inaczej każdy stary cennik z purchase@ dawałby wiadomość).
-- Na start wszystkie istniejące karty i oferty są oznaczone jako zgłoszone, więc pierwszy e-mail dotyczy tylko nowości.

-- 1. Co już zgłoszono
alter table core.bid_proposals add column if not exists notified_at timestamptz;

create table if not exists core.bid_card_seen_offers (
  proposal_id bigint not null references core.bid_proposals(id) on delete cascade,
  supplier_offer_id bigint not null,
  seen_at timestamptz not null default now(),
  primary key (proposal_id, supplier_offer_id)
);
alter table core.bid_card_seen_offers enable row level security;
revoke all on core.bid_card_seen_offers from public, anon, authenticated;

-- 2. Nowości od ostatniego wywołania
create or replace function core.take_bid_card_news(p_top int default 5)
returns jsonb language plpgsql as $$
declare
  v_cards jsonb;
  v_offers jsonb;
begin
  -- nowe karty
  select coalesce(jsonb_agg(jsonb_build_object(
           'proposalId', p.id, 'product', pr.canonical_name, 'category', pr.category,
           'bidBuyAt', b.offered_at, 'salesRep', emp.full_name,
           'requestedKg', coalesce(p.requested_quantity_kg, b.quantity_kg),
           'requestedIncoterms', b.incoterms, 'requestedLocation', b.location,
           'offers', (select count(*) from core.bid_proposal_options o where o.proposal_id = p.id),
           'top', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'supplier', coalesce(sc.name, so.producer_name), 'trader', se.full_name, 'source', so.source,
                      'priceEurPerKg', o.purchase_price_eur_per_kg, 'quantityKg', so.quantity_kg,
                      'incoterms', coalesce(o.incoterms, so.incoterms), 'offeredAt', so.offered_at)
                    order by o.rank)
             from core.bid_proposal_options o
             join core.offers so on so.id = o.supplier_offer_id
             left join core.companies sc on sc.id = o.supplier_company_id
             left join core.employees se on se.id = so.employee_id
             where o.proposal_id = p.id and o.rank <= 3), '[]'::jsonb))
         order by b.offered_at desc), '[]'::jsonb)
  into v_cards
  from core.bid_proposals p
  join core.offers b on b.id = p.bid_buy_offer_id
  join core.products pr on pr.id = p.product_id
  left join core.employees emp on emp.id = b.employee_id
  where p.status = 'pending_review' and p.notified_at is null;

  -- nowe oferty w pierwszej piątce kart już zgłoszonych
  select coalesce(jsonb_agg(jsonb_build_object(
           'proposalId', p.id, 'product', pr.canonical_name, 'bidBuyAt', b.offered_at, 'salesRep', emp.full_name,
           'rank', o.rank, 'supplier', coalesce(sc.name, so.producer_name), 'trader', se.full_name, 'source', so.source,
           'priceEurPerKg', o.purchase_price_eur_per_kg, 'quantityKg', so.quantity_kg,
           'incoterms', coalesce(o.incoterms, so.incoterms), 'offeredAt', so.offered_at)
         order by b.offered_at desc, o.rank), '[]'::jsonb)
  into v_offers
  from core.bid_proposal_options o
  join core.bid_proposals p on p.id = o.proposal_id
  join core.offers b on b.id = p.bid_buy_offer_id
  join core.products pr on pr.id = p.product_id
  join core.offers so on so.id = o.supplier_offer_id
  left join core.employees emp on emp.id = b.employee_id
  left join core.companies sc on sc.id = o.supplier_company_id
  left join core.employees se on se.id = so.employee_id
  where p.status = 'pending_review' and p.notified_at is not null and o.rank <= p_top
    and not exists (select 1 from core.bid_card_seen_offers s
                    where s.proposal_id = o.proposal_id and s.supplier_offer_id = o.supplier_offer_id);

  -- oznacz jako zgłoszone: karty i wszystkie ich obecne oferty (także spoza pierwszej piątki)
  update core.bid_proposals set notified_at = now() where status = 'pending_review' and notified_at is null;
  insert into core.bid_card_seen_offers(proposal_id, supplier_offer_id)
  select o.proposal_id, o.supplier_offer_id
  from core.bid_proposal_options o
  join core.bid_proposals p on p.id = o.proposal_id
  where p.status = 'pending_review'
  on conflict do nothing;
  -- karty zamknięte i wygasłe nie potrzebują już historii
  delete from core.bid_card_seen_offers s
  using core.bid_proposals p
  where p.id = s.proposal_id and p.status <> 'pending_review';

  return jsonb_build_object('cards', v_cards, 'offers', v_offers,
                            'count', jsonb_array_length(v_cards) + jsonb_array_length(v_offers));
end $$;

-- 3. Start: wszystko, co jest dziś na kartach, uznajemy za zgłoszone (wynik: ile nowości pominięto)
select core.take_bid_card_news() -> 'count' as skipped_on_start;
