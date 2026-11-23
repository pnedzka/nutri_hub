// Contracts of the old intranet from the central database (dashboard_api.intranet_contracts,
// db/central/dashboard_api.sql), for the home page's sales widgets and the contests.

import type { ContractRow } from '../../shared/dashboard.js';
import { centralDb } from './central.js';
import { HttpError } from './http.js';
import { logError } from './monitoring.js';

/** The intranet's contracts are synced once a day, so a few minutes of caching per server instance is plenty. */
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; rows: ContractRow[] }>();

/** The intranet's contracts made in [from, to), ISO times. */
export async function contractsBetween(from: string, to: string): Promise<ContractRow[]> {
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const { data, error } = await centralDb().schema('dashboard_api').rpc('intranet_contracts', { p_from: from, p_to: to });
  if (error) {
    logError('dashboard.contracts', new Error(`dashboard_api.intranet_contracts failed (${error.code ?? 'unknown'})`), { code: error.code });
    throw new HttpError(
      error.code?.startsWith('PGRST') ? 503 : 500,
      error.code?.startsWith('PGRST')
        ? 'The central database is not ready for the dashboard yet (dashboard_api). Tell your administrator.'
        : 'The central database did not answer. Try again in a moment.',
    );
  }
  const rows = (data ?? []) as ContractRow[];
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

