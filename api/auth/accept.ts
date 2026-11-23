//   POST /api/auth/accept   body { token } → { tokenHash, type }
//
// Opens a link from an account e-mail (see _lib/accountLinks.ts): redeems the one-time token and returns a fresh
// Supabase token that the browser exchanges for a session with verifyOtp. Public; tokens are 256-bit random.
// The first opened invitation tells the inviter and the team that the person joined.

import { redeemAccountLink } from '../_lib/accountLinks.js';
import { notifyJoined } from '../_lib/accountNotices.js';
import { appUrl, HttpError, handle, json, readJson } from '../_lib/http.js';

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = await readJson<{ token?: unknown }>(request);
    if (typeof body.token !== 'string' || !/^[\w-]{20,100}$/.test(body.token)) throw new HttpError(400, 'Invalid link.');
    const { tokenHash, type, userId, invitation } = await redeemAccountLink(body.token);
    // U2 + U3 (README "Powiadomienia"): the first time an invitation is opened.
    if (invitation) await notifyJoined(appUrl(request), userId);
    return json({ tokenHash, type });
  });
}
