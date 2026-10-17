import { supabase } from './supabase';

/** Calls the app's API with the signed-in user's access token. Throws an Error with a message for the user. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: {
        ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: init.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error('Cannot reach the server. Check your connection.', { cause: error });
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const payload = isJson ? ((await res.json()) as T & { error?: string }) : null;
  if (!res.ok || !payload) {
    throw new Error(payload?.error ?? (res.status === 404 ? 'The API is not running (start the app with `vercel dev`).' : `Server error (${res.status}).`));
  }
  return payload;
}
