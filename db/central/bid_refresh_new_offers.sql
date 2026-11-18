-- BID BUY cards: a new offer for the card's product shows up on the card at the next sync run (18.11.2026).
-- Until now an open card was rebuilt at most once every 50 minutes (from the hourly schedule). Since Apex Bid is
-- read every 10 minutes, a new BID SELL or purchase@ offer waited up to an hour before it reached the card, although
-- the search on the card already found it. Now a card is also rebuilt when an offer for its product (any variant,
-- core.product_root) arrived after the card was last built. Rebuilding keeps Michał's decisions (chosen offer,
-- offers removed with ✕), as before. Run in the SQL Editor of nutri-central-db. Removes nothing.

create or replace function core.generate_bid_proposals(p_buy_days integer default 30, p_offer_days integer default 180, p_options integer default 3)
returns jsonb language plpgsql as $function$
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

  -- 2. odśwież opcje oczekujących propozycji: co ~godzinę (zmiany dopasowań) albo od razu, gdy na produkt karty
  --    doszła nowa oferta (od 18.11.2026)
  for r in select p.id from core.bid_proposals p join core.offers b on b.id = p.bid_buy_offer_id
           where p.status = 'pending_review'
             and core.bid_buy_open_until(b.offered_at, b.valid_until, p_buy_days) > now()
             and (p.generated_at < now() - interval '50 minutes'
                  or exists (select 1 from core.offers o
                             where o.direction in ('supplier_to_us', 'bid_sell')
                               and o.product_id is not null
                               and o.created_at > p.generated_at
                               and core.product_root(o.product_id) = core.product_root(p.product_id)))
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
end $function$;
