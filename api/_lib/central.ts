// The central database (Supabase nutri-central-db), used by Purchase Manager (schema purchase_api) and by
// "Mailbox in the knowledge base" (schema mailbox_api). The server calls only the functions of those schemas, with
// that project's secret key: CENTRAL_DB_URL and CENTRAL_DB_SECRET_KEY.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';
import { isPublicKey } from './supabase.js';

let client: SupabaseClient | null = null;

/** The central database with the secret key (only service_role may call the API functions). */
export function centralDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.CENTRAL_DB_URL?.trim();
  const key = process.env.CENTRAL_DB_SECRET_KEY?.trim();
  if (!url || !key) throw new HttpError(503, 'The central database is not configured (CENTRAL_DB_URL or CENTRAL_DB_SECRET_KEY is missing).');
  if (isPublicKey(key)) throw new HttpError(503, 'The central database is misconfigured: CENTRAL_DB_SECRET_KEY holds a public key. Use the secret key.');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
