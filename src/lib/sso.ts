import type { AppId } from '../../shared/access.ts';
import { COMMISSION_URL, NEUTRALIZER_URL, OWNER_LOOKUP_URL, SIGNATURES_URL } from '../apps';

// One sign-in for all our apps: an app without a session sends the person to /sso?app=…&to=…&back=…, and the
// tiles link there too. The hub (signing the person in first if needed) gets a one-time token from /api/sso and
// opens the app with it in the address (#sso=…). The intranet has its own accounts.

const APP_URLS: Partial<Record<AppId, string>> = {
  neutralizer: NEUTRALIZER_URL,
  signatures: SIGNATURES_URL,
  'owner-lookup': OWNER_LOOKUP_URL,
  commission: COMMISSION_URL,
};

export const isSsoApp = (id: string): id is AppId => id in APP_URLS;

/**
 * The page to open in the app: `to` (a path in the app) at the app's address. `back` is the address the app was
 * opened at; it replaces the configured one only when it matches VITE_SSO_PREVIEW_ORIGINS (set for previews only,
 * so an app's pull request preview gets the person back). The token never goes anywhere else.
 */
export function ssoTarget(
  app: string | null,
  to: string | null,
  back: string | null,
  previewOrigins: string | undefined = import.meta.env.VITE_SSO_PREVIEW_ORIGINS,
): { id: AppId; url: URL } | null {
  if (!app || !isSsoApp(app)) return null;
  let base = new URL(APP_URLS[app]!);
  if (back && previewOrigins) {
    try {
      const origin = new URL(back).origin;
      if (new RegExp(`^(?:${previewOrigins})$`).test(origin)) base = new URL(origin);
    } catch {
      // Not an address: keep the configured one.
    }
  }
  let url: URL;
  try {
    url = new URL(to || '/', base);
  } catch {
    url = new URL('/', base);
  }
  if (url.origin !== base.origin) url = new URL('/', base);
  url.hash = '';
  return { id: app, url };
}

/** The app's address with the token: in the fragment, which browsers never send to a server. */
export function withToken(url: URL, tokenHash: string): string {
  const target = new URL(url);
  target.hash = new URLSearchParams({ sso: tokenHash }).toString();
  return target.href;
}
