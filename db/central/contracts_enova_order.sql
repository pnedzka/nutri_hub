-- Contract generator: numer wewnętrzny zamówienia z enova (prośba Pawła z 24.11.2026).
-- Uruchom raz w Supabase SQL Editor projektu nutri-central-db, po contracts_api.sql. Niczego nie usuwa.
--
-- Numer zamówienia wpisuje administracja przy akceptacji (obowiązkowy, sprawdza serwer centrum). Ta funkcja
-- pozwala go dopisać albo poprawić po akceptacji, bez zmiany etapu obiegu; zmiana trafia do historii kontraktu.

create or replace function contracts_api.set_enova_order(p_id text, p_order text, p_actor jsonb)
returns jsonb language plpgsql volatile security definer set search_path = contracts, public as $$
declare
  v_row contracts.contracts;
  v_order text := nullif(left(trim(p_order), 60), '');
begin
  select * into v_row from contracts.contracts where id = p_id for update;
  if not found then raise exception 'Contract % does not exist.', p_id using errcode = 'P0001'; end if;
  if v_row.status not in ('signature', 'board', 'signed', 'client_signed') then
    raise exception 'The order number can be changed only after the contract is accepted.' using errcode = 'P0001';
  end if;
  if v_order is null then raise exception 'Enter the internal order number.' using errcode = 'P0001'; end if;
  if v_order is not distinct from v_row.enova_order then return contracts_api.row_json(v_row); end if;
  update contracts.contracts set enova_order = v_order, updated_at = now() where id = p_id returning * into v_row;
  insert into contracts.events (contract_id, actor_email, actor_name, action, from_status, to_status, comment)
  values (p_id, lower(p_actor->>'email'), p_actor->>'name', 'order_number', v_row.status, v_row.status, v_order);
  return contracts_api.row_json(v_row);
end $$;

grant execute on function contracts_api.set_enova_order(text, text, jsonb) to service_role;
