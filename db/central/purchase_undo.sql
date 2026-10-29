-- Purchase Manager: cofanie decyzji przeglądu produktów (przycisk „Undo” w /purchase).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, po purchase_api.sql. Niczego nie zmienia w danych.
--
-- Każda decyzja z interfejsu (approve, merge, not a product, other product) zapisuje przed wykonaniem migawkę
-- wierszy, które zmieni (core.review_undo_log). „Undo” przywraca je i przelicza propozycje bid sell tych produktów.
-- Cofnąć można tylko własne decyzje, od najnowszej. Decyzji podjętych przed uruchomieniem tego pliku nie da się cofnąć.

create table if not exists core.review_undo_log (
  id bigint generated always as identity primary key,
  item_id bigint not null,
  action text not null,
  label text,
  decided_by text not null,
  decided_at timestamptz not null default now(),
  products bigint[] not null,
  snapshot jsonb not null,
  undone_at timestamptz,
  undone_by text
);
create index if not exists review_undo_log_by_idx on core.review_undo_log (decided_by, id desc) where undone_at is null;
alter table core.review_undo_log enable row level security;
revoke all on core.review_undo_log from public, anon, authenticated;

-- Migawka wierszy, które zmieni decyzja o pozycji p_item_id (p_target: produkt docelowy scalenia lub przepięcia).
create or replace function core._review_snapshot(p_item_id bigint, p_target bigint)
returns jsonb language plpgsql stable as $$
declare
  it core.review_queue;
  v_src bigint;
  v_tgt bigint := core.product_root(p_target);
  v_new boolean;
  v_item_names text[];
  v_names text[];
  v_offers jsonb;
begin
  select * into it from core.review_queue where id = p_item_id;
  if not found then raise exception 'Pozycja % nie istnieje', p_item_id; end if;
  v_src := it.entity_id;
  v_new := it.item_type = 'new_product';
  -- nazwy z oferty, których dotyczy niepewne dopasowanie
  v_item_names := array_remove(array[core.norm_product_name(it.suggestion->>'name'),
                                     core.norm_product_name(it.suggestion->>'from_name')], null);
  -- wszystkie nazwy, które decyzja może dopisać do kolejki nazw (jak w core.review_not_product)
  select array_agg(distinct n) into v_names from (
    select unnest(v_item_names) n
    union all select core.norm_product_name(alias) from core.product_aliases where v_new and product_id = v_src
    union all select core.norm_product_name(canonical_name) from core.products where v_new and id = v_src
    union all select name_norm from core.product_name_queue where v_new and product_id = v_src) x where n is not null;

  select coalesce(jsonb_agg(jsonb_build_array(o.id, o.product_id)), '[]'::jsonb) into v_offers
  from core.offers o where o.product_id = v_src and (v_new or core.norm_product_name(o.product_name_raw) = any(v_item_names));

  return jsonb_build_object(
    'src', v_src,
    'tgt', v_tgt,
    'names', to_jsonb(coalesce(v_names, '{}')),
    'products', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from core.products p
                 where p.id = v_src or p.id = v_tgt or (v_new and p.merged_into_id = v_src)),
    'aliases', (select coalesce(jsonb_agg(jsonb_build_object('product_id', a.product_id, 'alias', a.alias, 'source', a.source)), '[]'::jsonb)
                from core.product_aliases a where a.product_id = v_src or a.product_id = v_tgt),
    'review', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from core.review_queue q
               where q.id = it.id or (v_new and q.entity_id = v_src and q.item_type in ('new_product', 'product_mapping'))),
    'offers', v_offers,
    'inquiries', (select coalesce(jsonb_agg(jsonb_build_array(i.id, i.product_id)), '[]'::jsonb) from core.inquiries i
                  where i.product_id = v_src and (v_new or core.norm_product_name(i.product_name_raw) = any(v_item_names))),
    'deals', (select coalesce(jsonb_agg(jsonb_build_array(d.id, d.product_id)), '[]'::jsonb) from core.deals d
              where v_new and d.product_id = v_src),
    'proposals', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from core.bid_proposals b
                  where b.product_id = v_src
                    and (v_new or b.bid_buy_offer_id in (select (e->>0)::bigint from jsonb_array_elements(v_offers) e))),
    'name_queue', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from core.product_name_queue n
                   where n.product_id = v_src and (v_new or n.name_norm = any(v_item_names))
                      or n.name_norm = any(coalesce(v_names, '{}')))
  );
end $$;

-- Zapis decyzji w dzienniku (wołany przez nakładki purchase_api poniżej).
create or replace function core._review_logged(p_item_id bigint, p_action text, p_target bigint, p_by text, p_snapshot jsonb)
returns bigint language sql as $$
  insert into core.review_undo_log (item_id, action, label, decided_by, products, snapshot)
  select p_item_id, p_action,
         coalesce(q.suggestion->>'from_name', q.suggestion->>'name', (select canonical_name from core.products where id = q.entity_id)),
         p_by,
         array(select distinct x from unnest(array[(p_snapshot->>'src')::bigint, (p_snapshot->>'tgt')::bigint]
                 || array(select (p->>'id')::bigint from jsonb_array_elements(p_snapshot->'products') p)) x where x is not null),
         p_snapshot
  from core.review_queue q where q.id = p_item_id
  returning id
$$;

-- Cofnięcie decyzji z dziennika: przywraca migawkę.
create or replace function core.review_undo(p_log_id bigint, p_by text)
returns jsonb language plpgsql as $$
declare
  l core.review_undo_log;
  s jsonb;
  v_src bigint;
  v_tgt bigint;
  v_names text[];
begin
  if p_by is null or trim(p_by) = '' then raise exception 'Brak decided_by'; end if;
  select * into l from core.review_undo_log where id = p_log_id for update;
  if not found then raise exception 'Nie ma takiej decyzji do cofnięcia'; end if;
  if l.undone_at is not null then raise exception 'Ta decyzja jest już cofnięta'; end if;
  if exists (select 1 from core.review_undo_log x where x.id > l.id and x.undone_at is null and x.products && l.products) then
    raise exception 'Te produkty zmieniła już późniejsza decyzja. Cofnij najpierw ją.';
  end if;
  s := l.snapshot;
  v_src := (s->>'src')::bigint;
  v_tgt := (s->>'tgt')::bigint;
  v_names := array(select jsonb_array_elements_text(s->'names'));

  update core.products p set canonical_name = x.canonical_name, category = x.category, review_status = x.review_status,
         merged_into_id = x.merged_into_id, is_active = x.is_active
  from jsonb_populate_recordset(null::core.products, s->'products') x where p.id = x.id;

  -- aliasy produktów źródłowego i docelowego wracają do stanu sprzed decyzji
  delete from core.product_aliases a
  where a.product_id in (v_src, v_tgt)
    and not exists (select 1 from jsonb_populate_recordset(null::core.product_aliases, s->'aliases') x
                    where x.product_id = a.product_id and x.alias = a.alias);
  insert into core.product_aliases (product_id, alias, source)
  select x.product_id, x.alias, x.source from jsonb_populate_recordset(null::core.product_aliases, s->'aliases') x
  on conflict (product_id, alias) do nothing;

  update core.review_queue q set entity_id = x.entity_id, suggestion = x.suggestion, status = x.status, resolution = x.resolution,
         resolution_target_id = x.resolution_target_id, decided_by = x.decided_by, decided_at = x.decided_at
  from jsonb_populate_recordset(null::core.review_queue, s->'review') x where q.id = x.id;

  update core.offers o set product_id = (e->>1)::bigint from jsonb_array_elements(s->'offers') e where o.id = (e->>0)::bigint;
  update core.inquiries i set product_id = (e->>1)::bigint from jsonb_array_elements(s->'inquiries') e where i.id = (e->>0)::bigint;
  update core.deals d set product_id = (e->>1)::bigint from jsonb_array_elements(s->'deals') e where d.id = (e->>0)::bigint;

  update core.bid_proposals b set product_id = x.product_id, status = x.status, reviewed_by = x.reviewed_by,
         reviewed_at = x.reviewed_at, review_note = x.review_note, chosen_option_id = x.chosen_option_id
  from jsonb_populate_recordset(null::core.bid_proposals, s->'proposals') x where b.id = x.id;

  -- kolejka nazw: wiersze z migawki wracają, a dopisane przez decyzję znikają
  delete from core.product_name_queue n
  where (n.name_norm = any(v_names) or n.name_norm in (select x.name_norm from jsonb_populate_recordset(null::core.product_name_queue, s->'name_queue') x));
  insert into core.product_name_queue
  select * from jsonb_populate_recordset(null::core.product_name_queue, s->'name_queue');

  perform core._refresh_proposals(array_remove(array[v_src, v_tgt], null));
  update core.review_undo_log set undone_at = now(), undone_by = p_by where id = l.id;
  return jsonb_build_object('item', l.item_id, 'action', l.action, 'label', l.label);
end $$;

-- Nakładki purchase_api: te same nazwy i argumenty co w purchase_api.sql, teraz z zapisem do dziennika.
create or replace function purchase_api.review_approve(p_item_id bigint, p_by text, p_name text default null, p_category text default null)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare v_snap jsonb := core._review_snapshot(p_item_id, null); v jsonb;
begin
  v := core.review_approve(p_item_id, p_by, p_name, p_category);
  perform core._review_logged(p_item_id, 'approve', null, p_by, v_snap);
  return v;
end $$;

create or replace function purchase_api.review_merge(p_item_id bigint, p_target_id bigint, p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare v_snap jsonb := core._review_snapshot(p_item_id, p_target_id); v jsonb;
begin
  v := core.review_merge(p_item_id, p_target_id, p_by);
  perform core._review_logged(p_item_id, 'merge', p_target_id, p_by, v_snap);
  return v;
end $$;

create or replace function purchase_api.review_not_product(p_item_id bigint, p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare v_snap jsonb := core._review_snapshot(p_item_id, null); v jsonb;
begin
  v := core.review_not_product(p_item_id, p_by);
  perform core._review_logged(p_item_id, 'notProduct', null, p_by, v_snap);
  return v;
end $$;

create or replace function purchase_api.review_remap(p_item_id bigint, p_target_id bigint, p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare v_snap jsonb := core._review_snapshot(p_item_id, p_target_id); v jsonb;
begin
  v := core.review_remap(p_item_id, p_target_id, p_by);
  perform core._review_logged(p_item_id, 'remap', p_target_id, p_by, v_snap);
  return v;
end $$;

-- Zatwierdzanie zbiorcze: każda pozycja osobno w dzienniku (Undo cofa je po jednej, od ostatniej).
create or replace function purchase_api.review_approve_bulk(p_item_ids bigint[], p_by text, p_min_confidence numeric default 0.9)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare r record; v_ok bigint[] := '{}'; v_skip bigint[] := '{}';
begin
  for r in select id, confidence from core.v_product_review where id = any(p_item_ids) order by id loop
    if r.confidence >= p_min_confidence then
      perform purchase_api.review_approve(r.id, p_by);
      v_ok := v_ok || r.id;
    else
      v_skip := v_skip || r.id;
    end if;
  end loop;
  return jsonb_build_object('approved', to_jsonb(v_ok), 'skipped', to_jsonb(v_skip),
    'not_found', to_jsonb(array(select unnest(p_item_ids) except select unnest(v_ok || v_skip))));
end $$;

-- Ostatnia decyzja tej osoby, którą można cofnąć (albo null).
create or replace function purchase_api.review_last_decision(p_by text)
returns jsonb language sql stable security definer set search_path = core, extensions, public as $$
  select jsonb_build_object('id', l.id, 'itemId', l.item_id, 'action', l.action, 'label', l.label, 'decidedAt', l.decided_at)
  from core.review_undo_log l
  where l.decided_by = p_by and l.undone_at is null
  order by l.id desc limit 1
$$;

-- Cofa ostatnią decyzję tej osoby.
create or replace function purchase_api.review_undo_last(p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare v_id bigint;
begin
  select id into v_id from core.review_undo_log where decided_by = p_by and undone_at is null order by id desc limit 1;
  if v_id is null then raise exception 'Nie ma decyzji do cofnięcia'; end if;
  return core.review_undo(v_id, p_by);
end $$;

revoke all on function core._review_snapshot(bigint, bigint), core._review_logged(bigint, text, bigint, text, jsonb),
  core.review_undo(bigint, text) from public, anon, authenticated;
revoke all on all functions in schema purchase_api from public, anon, authenticated;
grant execute on all functions in schema purchase_api to service_role;
