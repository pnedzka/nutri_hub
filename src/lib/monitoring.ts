// Errors in the browser go to Sentry when VITE_SENTRY_DSN is set (same project as the server, tag side=browser).
// No session replay or tracing; the person is identified by account id and e-mail so a report can be followed up.

import * as Sentry from '@sentry/react';

const env = import.meta.env;
const dsn: string | undefined = env.VITE_SENTRY_DSN;

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: env.VITE_VERCEL_ENV || 'development',
    release: env.VITE_VERCEL_GIT_COMMIT_SHA || undefined,
    // Nothing collected automatically (cookies, headers, bodies, query): only the error and who saw it.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    initialScope: { tags: { app: 'hub', side: 'browser' } },
    // Addresses can carry one-time sign-in tokens in the fragment (#sso=…, e-mail links): never send it.
    beforeSend(event) {
      if (event.request?.url) event.request.url = withoutFragment(event.request.url);
      return event;
    },
    beforeBreadcrumb(crumb) {
      for (const key of ['from', 'to', 'url']) {
        const value = crumb.data?.[key];
        if (typeof value === 'string') crumb.data![key] = withoutFragment(value);
      }
      return crumb;
    },
  });
}

const withoutFragment = (url: string) => url.split('#')[0];

/** For createRoot: errors React could not recover from. */
export const onUncaughtError = dsn ? Sentry.reactErrorHandler() : undefined;

export function setMonitoringUser(user: { id: string; email: string } | null) {
  if (dsn) Sentry.setUser(user ? { id: user.id, email: user.email } : null);
}
