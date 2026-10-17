//   POST /api/auth/accept   body { token } → { tokenHash, type }
//
// Opens a link from an account e-mail (see _lib/accountLinks.ts): redeems the one-time token and returns a fresh
// Supabase token that the browser exchanges for a session with verifyOtp. Public; tokens are 256-bit random.

import { redeemAccountLink } from '../_lib/accountLinks.js';
import { HttpError, handle, json, readJson } from '../_lib/http.js';

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = await readJson<{ token?: unknown }>(request);
    if (typeof body.token !== 'string' || !/^[\w-]{20,100}$/.test(body.token)) throw new HttpError(400, 'Invalid link.');
    return json(await redeemAccountLink(body.token));
  });
}
