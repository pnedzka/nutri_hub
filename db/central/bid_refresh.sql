-- Karty BID BUY: „Check Apex Bid now” (ręczne odświeżenie przez Purchase Managera, decyzja z 10.11.2026).
-- Uruchom w Supabase SQL Editor projektu nutri-central-db, PO bid_card_ranking.sql. Niczego nie usuwa.
--
-- Przycisk w centrum (/purchase → Bid sell proposals) nie czeka na cogodzinną synchronizację:
--   1. serwer centrum woła purchase_api.bid_refresh_begin(): zapisuje prośbę (kto, kiedy), pilnuje odstępu 60 s
--      i zwraca jednorazowy token oraz adres webhooka n8n (core.settings, klucz bid_refresh_webhook_url);
--   2. serwer wysyła token na webhook workflow „Central DB - Apex Bid sync”; n8n sprawdza go w
--      core.bid_refresh_claim() (nieznany, zużyty albo starszy niż 2 minuty token niczego nie uruchamia);
--   3. n8n pobiera z Apex Bid produkty, oferty i BID SOLD tak jak co godzinę, a na końcu core.bid_refresh_finish()
--      przelicza karty (core.generate_bid_proposals) i odsyła wynik.
-- Adres webhooka nie jest w repozytorium: wpisuje się go raz do core.settings (bez niego przycisk zgłasza brak konfiguracji).
-- E-mail o nowościach wychodzi jak dotąd, po przeliczeniu o :25.

-- 1. Ustawienia i prośby o odświeżenie
create table if not exists core.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table core.settings enable row level security;
revoke all on core.settings from public, anon, authenticated;

create table if not exists core.bid_refresh_requests (
  id bigint generated always as identity primary key,
  token uuid not null default gen_random_uuid() unique,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  result jsonb
);
alter table core.bid_refresh_requests enable row level security;
revoke all on core.bid_refresh_requests from public, anon, authenticated;

-- 2. Początek: prośba z centrum
create or replace function purchase_api.bid_refresh_begin(p_by text)
returns jsonb language plpgsql security definer set search_path = core, extensions, public as $$
declare
  v_url text;
  v_token uuid;
begin
  select value into v_url from core.settings where key = 'bid_refresh_webhook_url';
  if v_url is null or v_url !~ '^https://' then
    raise exception 'Checking Apex Bid on demand is not set up yet. Tell your administrator.' using errcode = 'P0001';
  end if;
  if exists (select 1 from core.bid_refresh_requests where requested_at > now() - interval '60 seconds') then
    raise exception 'Apex Bid was checked less than a minute ago. Try again in a moment.' using errcode = 'P0001';
  end if;
  insert into core.bid_refresh_requests(requested_by) values (p_by) returning token into v_token;
  return jsonb_build_object('token', v_token, 'url', v_url);
end $$;

-- 3. n8n: czy token jest prawdziwy i świeży (jednorazowy)
create or replace function core.bid_refresh_claim(p_token text)
returns boolean language plpgsql as $$
begin
  update core.bid_refresh_requests set claimed_at = now()
  where token::text = p_token and claimed_at is null and requested_at > now() - interval '2 minutes';
  return found;
end $$;

-- 4. n8n: koniec synchronizacji. Dla przebiegu cogodzinnego (pusty token) nic nie robi.
create or replace function core.bid_refresh_finish(p_token text)
returns jsonb language plpgsql as $$
declare
  v_id bigint;
  v_result jsonb;
begin
  select id into v_id from core.bid_refresh_requests
  where token::text = p_token and claimed_at is not null and finished_at is null;
  if v_id is null then
    return jsonb_build_object('manual', false);
  end if;
  v_result := jsonb_build_object(
    'manual', true,
    'cards', to_jsonb(core.generate_bid_proposals(30, 180, 3)),
    'checkedAt', now());
  update core.bid_refresh_requests set finished_at = now(), result = v_result where id = v_id;
  return v_result;
end $$;

revoke all on all functions in schema purchase_api from public, anon, authenticated;
grant execute on all functions in schema purchase_api to service_role;

select 'bid_refresh ready' as status,
       exists (select 1 from core.settings where key = 'bid_refresh_webhook_url') as webhook_url_set;
