import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

// The shared Supabase project of the Document neutralizer. Managing accounts (creating, inviting, deleting) needs
// the secret key: SUPABASE_SECRET_KEY (older projects: SUPABASE_SERVICE_ROLE_KEY), set only on the server.
function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

let client: SupabaseClient | null = null;

/** Server-side client with full access. Every endpoint using it checks who is asking first. */
export function db(): SupabaseClient {
  if (client) return client;
  const cfg = config();
  if (!cfg) throw new HttpError(503, 'User management is not configured (SUPABASE_SECRET_KEY is missing).');
  client = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
