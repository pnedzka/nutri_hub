//   POST /api/sso   body { app } → { tokenHash }
//
// One sign-in for all our apps. The hub (signed in) asks for a one-time Supabase token for an app the person may
// use and passes it to the app in the address (#sso=…, see src/lib/sso.ts); the app turns it into its own session
// with verifyOtp (type magiclink). generateLink sends no e-mail.

import { APP_NAMES, canUse, isAppId } from '../shared/access.js';
import { requireUser } from './_lib/auth.js';
import { HttpError, handle, json, readJson } from './_lib/http.js';
import { db } from './_lib/supabase.js';

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const body = await readJson<{ app?: unknown }>(request);
    // The old intranet has its own accounts; the new one (VITE_INTRANET_URL, previews until its release) uses ours.
    if (!isAppId(body.app) || (body.app === 'intranet' && !process.env.VITE_INTRANET_URL)) throw new HttpError(400, 'Unknown app.');
    if (!canUse(profile, body.app)) throw new HttpError(403, `You don't have access to ${APP_NAMES[body.app]}. Ask your administrator.`);

    // The account's own address, not the copy in `profiles`, so the token can only sign in this account.
    const { data: found, error: findError } = await db().auth.admin.getUserById(profile.id);
    const email = found.user?.email;
    if (findError || !email) throw new HttpError(404, 'Your account was not found.');
    const { data, error } = await db().auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = data.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error('[sso] generateLink', error);
      throw new HttpError(500, `Could not sign you in to ${APP_NAMES[body.app]}. Try again.`);
    }
    return json({ tokenHash });
  });
}
