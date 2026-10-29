// Purchase Manager (/purchase, people with the `purchase` app): reviewing products AI proposed and bid sell
// proposals. Served by api/admin/users.ts with ?resource=purchase, because the Hobby plan allows 12 functions and
// all are used. The API is described in shared/purchaseApi.ts.
//
// The data is in the central database (Supabase nutri-central-db), not in the hub's user database. The server calls
// only the functions of its schema purchase_api (db/central/purchase_api.sql) with that project's secret key:
// CENTRAL_DB_URL and CENTRAL_DB_SECRET_KEY. Every decision is saved with the e-mail of the person who made it.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  BULK_MIN_CONFIDENCE,
  PROPOSALS_PAGE_SIZE,
  PurchaseInputError,
  REVIEW_PAGE_SIZE,
  proposalStatus,
  purchaseAction,
  reviewFilters,
  type PurchaseAction,
  type ReviewSummary,
} from '../../shared/purchaseApi.js';
import { requireApp } from './auth.js';
import { HttpError, handle, json, readJson } from './http.js';
import { logError } from './monitoring.js';
import { isPublicKey } from './supabase.js';

export const isPurchaseRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'purchase';

let client: SupabaseClient | null = null;

/** The central database, schema purchase_api, with the secret key (only service_role may call its functions). */
function central(): SupabaseClient {
  if (client) return client;
  const url = process.env.CENTRAL_DB_URL?.trim();
  const key = process.env.CENTRAL_DB_SECRET_KEY?.trim();
  if (!url || !key) throw new HttpError(503, 'Purchase Manager is not configured (CENTRAL_DB_URL or CENTRAL_DB_SECRET_KEY is missing).');
  if (isPublicKey(key)) throw new HttpError(503, 'Purchase Manager is misconfigured: CENTRAL_DB_SECRET_KEY holds a public key. Use the secret key.');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/**
 * Calls a function of purchase_api. The functions raise exceptions with a message meant for the person (P0001, e.g.
 * "the item is already closed"), which go back as 409; anything else is logged and reported as a server error.
 */
async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await central().schema('purchase_api').rpc(fn, args);
  if (!error) return data as T;
  if (error.code === 'P0001') throw new HttpError(409, error.message);
  // PGRST106/PGRST202: the schema is not exposed in the Data API, or the SQL has not been run yet.
  logError(`purchase.${fn}`, new Error(`purchase_api.${fn} failed (${error.code ?? 'unknown'})`), { code: error.code });
  throw new HttpError(
    error.code?.startsWith('PGRST') ? 503 : 500,
    error.code?.startsWith('PGRST')
      ? 'The central database is not ready for Purchase Manager yet (purchase_api). Tell your administrator.'
      : 'The central database did not answer. Try again in a moment.',
  );
}

/** The header numbers, plus how many items each category has open (one count per category, in parallel). */
async function reviewSummary(): Promise<ReviewSummary> {
  const summary = await call<Omit<ReviewSummary, 'openByCategory'>>('product_review_summary', {});
  const counts = await Promise.all(
    summary.categories.map(async (category) => {
      const page = await call<{ total: number }>('product_review_list', { p_category: category, p_limit: 1 });
      return [category, Number(page.total)] as const;
    }),
  );
  return { ...summary, openByCategory: Object.fromEntries(counts.filter(([, total]) => total > 0)) };
}

export function purchaseGet(request: Request): Promise<Response> {
  return handle(async () => {
    const person = await requireApp(request, 'purchase');
    const params = new URL(request.url).searchParams;
    switch (params.get('view')) {
      case 'summary':
        return json(await reviewSummary());
      case 'review': {
        const f = reviewFilters(params);
        return json(
          await call('product_review_list', {
            p_type: f.type,
            p_category: f.category,
            p_max_confidence: f.maxConfidence,
            p_with_offers: f.withOffers,
            p_q: f.q,
            p_limit: REVIEW_PAGE_SIZE,
            p_offset: (f.page - 1) * REVIEW_PAGE_SIZE,
          }),
        );
      }
      case 'lastDecision':
        return json({ last: await call('review_last_decision', { p_by: person.email }) });
      case 'search': {
        const q = params.get('q')?.trim().slice(0, 100) ?? '';
        if (q.length < 2) return json({ products: [] });
        return json({ products: await call('search_products', { p_q: q, p_limit: 10 }) });
      }
      case 'proposals': {
        const status = params.get('status');
        const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
        return json(
          await call('bid_proposal_list', {
            p_status: status === 'all' ? null : (proposalStatus(status) ?? 'pending_review'),
            p_limit: PROPOSALS_PAGE_SIZE,
            p_offset: (page - 1) * PROPOSALS_PAGE_SIZE,
          }),
        );
      }
      default:
        throw new HttpError(400, 'Unknown view.');
    }
  });
}

function run(action: PurchaseAction, by: string): Promise<unknown> {
  switch (action.action) {
    case 'approve':
      return call('review_approve', { p_item_id: action.itemId, p_by: by, p_name: action.name ?? null, p_category: action.category ?? null });
    case 'merge':
      return call('review_merge', { p_item_id: action.itemId, p_target_id: action.targetId, p_by: by });
    case 'notProduct':
      return call('review_not_product', { p_item_id: action.itemId, p_by: by });
    case 'remap':
      return call('review_remap', { p_item_id: action.itemId, p_target_id: action.targetId, p_by: by });
    case 'approveBulk':
      return call('review_approve_bulk', { p_item_ids: action.itemIds, p_by: by, p_min_confidence: BULK_MIN_CONFIDENCE });
    case 'undo':
      return call('review_undo_last', { p_by: by });
    case 'rejectOption':
      return call('bid_option_reject', { p_option_id: action.optionId, p_by: by });
    case 'restoreOption':
      return call('bid_option_restore', { p_rejection_id: action.rejectionId, p_by: by });
    case 'decide':
      return call('bid_proposal_decide', {
        p_id: action.proposalId,
        p_status: action.status,
        p_by: by,
        p_option_id: action.optionId ?? null,
        p_note: action.note ?? null,
      });
  }
}

export function purchasePost(request: Request): Promise<Response> {
  return handle(async () => {
    const person = await requireApp(request, 'purchase');
    let action: PurchaseAction;
    try {
      action = purchaseAction(await readJson(request));
    } catch (error) {
      if (error instanceof PurchaseInputError) throw new HttpError(400, error.message);
      throw error;
    }
    return json({ result: await run(action, person.email) });
  });
}
