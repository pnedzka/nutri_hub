//   POST /api/sso   body { app } → { tokenHash }
//   GET  /api/health (rewritten to GET /api/sso) → { ok, checks }: for the uptime monitor, see GET below
//
// One sign-in for all our apps. The hub (signed in) asks for a one-time Supabase token for an app the person may
// use and passes it to the app in the address (#sso=…, see src/lib/sso.ts); the app turns it into its own session
// with verifyOtp (type magiclink). generateLink sends no e-mail.

import { APP_NAMES, canUse, isAppId, type AppId } from '../shared/access.js';
import { requireUser } from './_lib/auth.js';
import { HttpError, handle, json, readJson } from './_lib/http.js';
import { db } from './_lib/supabase.js';
import { logError } from './_lib/monitoring.js';

const HUB_OWN: AppId[] = ['intranet', 'news', 'leave', 'commission'];

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const body = await readJson<{ app?: unknown }>(request);
    // The old intranet has its own accounts; News and Leave are parts of the hub and the commission calculator has
    // no sign-in, so they need no token.
    if (!isAppId(body.app) || HUB_OWN.includes(body.app)) throw new HttpError(400, 'Unknown app.');
    if (!canUse(profile, body.app)) throw new HttpError(403, `You don't have access to ${APP_NAMES[body.app]}. Ask your administrator.`);

    // The account's own address, not the copy in `profiles`, so the token can only sign in this account.
    const { data: found, error: findError } = await db().auth.admin.getUserById(profile.id);
    const email = found.user?.email;
    if (findError || !email) throw new HttpError(404, 'Your account was not found.');
    const { data, error } = await db().auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = data.properties?.hashed_token;
    if (error || !tokenHash) {
      logError('sso.generateLink', error);
      throw new HttpError(500, `Could not sign you in to ${APP_NAMES[body.app]}. Try again.`);
    }
    return json({ tokenHash });
  });
}

// GET /api/health. Lives in this file because the Hobby plan allows 12 functions (vercel.json rewrites the address).
// An uptime monitor calls it every few minutes and alerts when it is not 200: the hub's server must reach Supabase
// with its own key (a wrong SUPABASE_SECRET_KEY broke /sso, Users, News and Leave on 20.10.2026), and e-mails need
// the Resend key. Answers only ok/failed per check, no details. `?test=sentry` (not in production) sends a test error.
export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    if (new URL(request.url).searchParams.get('test') === 'sentry' && process.env.VERCEL_ENV !== 'production') {
      logError('health.test', new Error('Test error from /api/health (Sentry set-up check)'));
      return json({ ok: true, test: 'sent' });
    }
    const checks: Record<string, 'ok' | 'failed'> = {};
    const run = async (name: string, check: () => Promise<unknown>) => {
      try {
        await check();
        checks[name] = 'ok';
      } catch (error) {
        checks[name] = 'failed';
        logError(`health.${name}`, error);
      }
    };
    await Promise.all([
      run('auth', async () => {
        const { error } = await db().auth.admin.listUsers({ page: 1, perPage: 1 });
        if (error) throw error;
      }),
      run('database', async () => {
        const { error } = await db().from('profiles').select('id').limit(1);
        if (error) throw error;
      }),
      run('mail', async () => {
        if (!process.env.RESEND_API_KEY?.trim()) throw new Error('RESEND_API_KEY is missing');
      }),
    ]);
    const ok = Object.values(checks).every((c) => c === 'ok');
    return json({ ok, checks }, ok ? 200 : 503);
  });
}
