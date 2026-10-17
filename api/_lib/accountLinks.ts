// One-time links from account e-mails. The e-mail carries the app's own random token (valid 24 h for an
// invitation, 1 h for a password reset); only its SHA-256 is stored in `account_links`. When the link is opened,
// the token is redeemed once and exchanged for a fresh Supabase Auth token (`generateLink`, which sends nothing),
// which the browser turns into a session with `verifyOtp`. The validity therefore does not depend on the
// "Email OTP Expiration" setting in Supabase, and an e-mail scanner that opens the link cannot use it up.

import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from './http.js';
import { db } from './supabase.js';

export type AccountLinkKind = 'invite' | 'recovery';

export const LINK_VALIDITY_HOURS: Record<AccountLinkKind, number> = { invite: 24, recovery: 1 };

export const EXPIRED_LINK = 'This link has expired or has already been used. Ask your administrator for a new one or use "Forgot password?".';

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates the Supabase account for an invitation (no e-mail is sent by Supabase). */
export async function createInvitedUser(email: string, fullName: string | null) {
  const { data, error } = await db().auth.admin.generateLink({ type: 'invite', email, options: { data: { full_name: fullName } } });
  return { user: data.user, error };
}

/** A new link for the account; earlier unused links of the account stop working. */
export async function issueAccountLink(kind: AccountLinkKind, userId: string, appUrl: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const { error: revokeError } = await db().from('account_links').update({ used_at: now.toISOString() }).eq('user_id', userId).is('used_at', null);
  if (revokeError) throw revokeError;
  const { error } = await db()
    .from('account_links')
    .insert({ user_id: userId, kind, token_hash: sha256(token), expires_at: new Date(now.getTime() + LINK_VALIDITY_HOURS[kind] * 3600_000).toISOString() });
  if (error) throw error;
  return `${appUrl}/?${new URLSearchParams({ link: token, type: kind })}`;
}

/** Redeems a link (once) and returns a fresh Supabase token for `verifyOtp`. */
export async function redeemAccountLink(token: string): Promise<{ tokenHash: string; type: AccountLinkKind }> {
  const { data: link, error } = await db()
    .from('account_links')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', sha256(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id, kind')
    .maybeSingle();
  if (error) throw error;
  if (!link) throw new HttpError(410, EXPIRED_LINK);

  const { data: found } = await db().auth.admin.getUserById(link.user_id);
  const email = found.user?.email;
  if (!email) throw new HttpError(410, EXPIRED_LINK);
  let type = link.kind as AccountLinkKind;
  let generated = await db().auth.admin.generateLink(type === 'invite' ? { type: 'invite', email } : { type: 'recovery', email });
  // Supabase refuses an invitation once the address counts as confirmed; a reset token signs in the same way.
  if (type === 'invite' && generated.error) {
    type = 'recovery';
    generated = await db().auth.admin.generateLink({ type: 'recovery', email });
  }
  const tokenHash = generated.data.properties?.hashed_token;
  if (generated.error || !tokenHash) {
    console.error('[links] generateLink', generated.error);
    throw new HttpError(500, 'Could not open the link. Try again or ask for a new one.');
  }
  return { tokenHash, type };
}
