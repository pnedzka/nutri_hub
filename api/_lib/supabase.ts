import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

// The shared Supabase project of the Document neutralizer. Managing accounts (creating, inviting, deleting) needs
// the secret key: SUPABASE_SECRET_KEY (older projects: SUPABASE_SERVICE_ROLE_KEY), set only on the server.
function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  return url && key ? { url, key } : null;
}

/** True for the public keys (publishable or the legacy anon JWT): with them every read runs as anon and RLS hides all rows. */
export function isPublicKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  const [, payload] = key.split('.');
  if (!payload || key.startsWith('sb_')) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role !== 'service_role';
  } catch {
    return false;
  }
}

let client: SupabaseClient | null = null;

/** Server-side client with full access. Every endpoint using it checks who is asking first. */
export function db(): SupabaseClient {
  if (client) return client;
  const cfg = config();
  if (!cfg) throw new HttpError(503, 'User management is not configured (SUPABASE_SECRET_KEY is missing).');
  if (isPublicKey(cfg.key)) {
    throw new HttpError(503, 'User management is misconfigured: SUPABASE_SECRET_KEY holds a public (publishable/anon) key. Use the secret key.');
  }
  client = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
