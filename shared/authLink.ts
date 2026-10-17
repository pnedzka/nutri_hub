// Links from account e-mails (invitation, password reset) that open the app:
// - sent by the app (api/_lib/accountLinks.ts): `?link=…&type=invite`, the app's one-time token, redeemed through
//   POST /api/auth/accept for a Supabase token (`?token_hash=…` is the same with a Supabase token directly);
// - sent by Supabase itself: the result in the URL fragment, e.g. `#access_token=…&type=invite` or
//   `#error=access_denied&error_code=otp_expired`. supabase-js consumes and clears the fragment while it starts,
//   so the app reads it first to know which screen to show.

export type AuthLink = { kind: 'invite' | 'recovery'; tokenHash?: string; linkToken?: string } | { kind: 'error'; message: string } | null;

export const EXPIRED_LINK = 'This link has expired or has already been used. Ask your administrator for a new one or use "Forgot password?".';

export function parseAuthLink(hash: string, search = ''): AuthLink {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const errorCode = fragment.get('error_code') ?? query.get('error_code');
  const error = fragment.get('error') ?? query.get('error');
  if (error || errorCode) {
    if (errorCode === 'otp_expired' || error === 'access_denied') return { kind: 'error', message: EXPIRED_LINK };
    const description = fragment.get('error_description') ?? query.get('error_description');
    return { kind: 'error', message: `This link is invalid${description ? ` (${description})` : ''}.` };
  }
  const linkType = query.get('type');
  if (linkType === 'invite' || linkType === 'recovery') {
    const linkToken = query.get('link');
    if (linkToken) return { kind: linkType, linkToken };
    const tokenHash = query.get('token_hash');
    if (tokenHash) return { kind: linkType, tokenHash };
  }
  if (!fragment.get('access_token')) return null;
  const type = fragment.get('type');
  return type === 'invite' || type === 'recovery' ? { kind: type } : null;
}
