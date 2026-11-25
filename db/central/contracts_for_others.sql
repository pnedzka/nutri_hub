-- Contracts → uprawnienie „Create contracts for other traders” (contracts-for-others, 25.11.2026, prośba właściciela:
-- Klaudia Adamek tworzy kontrakty w imieniu handlowców, obieg akceptacji bez zmian).
-- Osoba z tym uprawnieniem widzi na liście swoje kontrakty i te, które utworzyła dla innych, i otwiera swoje szkice
-- zapisane dla innych. Uruchamia właściciel w SQL Editorze projektu nutri-central-db (blbcudymvackpudywdyy).
-- Można uruchomić ponownie.

-- 1. Lista: nowy parametr p_created_by (kontrakty utworzone przez tę osobę, obok kontraktów p_owner).
drop function if exists contracts_api.list(text, text[], text, int, int);

create or replace function contracts_api.list(p_owner text default null, p_statuses text[] default null, p_q text default null,
  p_limit int default 50, p_offset int default 0, p_created_by text default null)
returns jsonb language sql stable security definer set search_path = contracts, public as $$
  with f as (
    select * from contracts.contracts c
    where (p_owner is null or c.owner_email = lower(p_owner) or (p_created_by is not null and c.created_by_email = lower(p_created_by)))
      and (p_statuses is null or c.status = any(p_statuses))
      and (nullif(trim(p_q), '') is null or c.id ilike '%' || trim(p_q) || '%' or c.company_name ilike '%' || trim(p_q) || '%' or c.owner_name ilike '%' || trim(p_q) || '%')
  )
  select jsonb_build_object('total', (select count(*) from f), 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'type', type, 'status', status, 'ownerEmail', owner_email, 'ownerName', owner_name,
      'companyName', company_name, 'currency', currency, 'amountNet', amount_net, 'amountEur', amount_eur,
      'boardRequired', board_required, 'submissionDate', submission_date, 'updatedAt', updated_at) order by created_at desc)
    from (select * from f order by created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) p), '[]'::jsonb));
$$;

-- 2. Szkic: także kto go zapisał (createdByEmail), żeby ta osoba mogła otworzyć szkic zapisany dla handlowca.
create or replace function contracts_api.draft_get(p_id uuid)
returns jsonb language sql stable security definer set search_path = contracts, public as $$
  select jsonb_build_object('id', id, 'ownerEmail', owner_email, 'createdByEmail', created_by_email, 'type', type,
    'companyName', company_name, 'data', data, 'createdAt', created_at, 'updatedAt', updated_at)
  from contracts.drafts where id = p_id;
$$;

revoke all on function contracts_api.list(text, text[], text, int, int, text) from public, anon, authenticated;
grant execute on function contracts_api.list(text, text[], text, int, int, text) to service_role;
revoke all on function contracts_api.draft_get(uuid) from public, anon, authenticated;
grant execute on function contracts_api.draft_get(uuid) to service_role;

-- Data API od razu zna nową wersję funkcji.
notify pgrst, 'reload schema';
