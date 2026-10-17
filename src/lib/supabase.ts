import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The same Supabase project as the Document neutralizer: one user base for the team's apps.
// The Supabase integration on Vercel sets NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// (newer projects: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); VITE_* works for local development.
const env = import.meta.env;
const url: string | undefined = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key: string | undefined =
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

/** Where accounts are managed (invitations, password resets): the Document neutralizer. */
export const ACCOUNT_APP_URL: string = (env.VITE_ACCOUNT_APP_URL || 'https://nutridocumentation-nxdi.vercel.app').replace(/\/+$/, '');
