//   POST /api/auth/recover   body { email } → { ok: true }
//
// "Forgot password?" on the login screen. Public: the answer is the same whether the account exists or not, so
// it cannot be used to find out who has an account. One e-mail per account per minute at most.

import { HttpError, appUrl, handle, json, readJson } from '../_lib/http.js';
import { issueAccountLink } from '../_lib/accountLinks.js';
import { sendAccountMail } from '../_lib/mail.js';
import { db } from '../_lib/supabase.js';

const MIN_INTERVAL_MS = 60_000;

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = await readJson<{ email?: unknown }>(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Invalid e-mail address.');

    const { data: profile, error } = await db().from('profiles').select('id, deactivated_at').eq('email', email).maybeSingle();
    if (error) throw error;
    // Deactivated accounts get nothing (the same answer, so it does not tell who was deactivated).
    if (!profile || profile.deactivated_at) return json({ ok: true });

    const { data: found } = await db().auth.admin.getUserById(profile.id);
    const user = found.user;
    if (!user) return json({ ok: true });
    const last = Date.parse(String(user.app_metadata?.last_link_sent_at ?? ''));
    if (Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS) return json({ ok: true });

    const url = await issueAccountLink('recovery', user.id, appUrl(request));
    await db().auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, last_link_sent_at: new Date().toISOString() } });
    await sendAccountMail({ kind: 'recovery', email, url, appUrl: appUrl(request) });
    return json({ ok: true });
  });
}
