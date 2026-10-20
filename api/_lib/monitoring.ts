// Server errors go to the Vercel logs and, when SENTRY_DSN is set, to Sentry (which e-mails about new issues).
// Minimal SDK set-up: no tracing or automatic instrumentation, so cold starts stay short.

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.initWithoutDefaultIntegrations({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    initialScope: { tags: { app: 'hub', side: 'server' } },
  });
}

let unsent = false;

/** Turns what libraries throw or return (Supabase errors are plain objects) into an Error with a readable message. */
export function toError(where: string, error: unknown): Error {
  if (error instanceof Error) return error;
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error);
  return new Error(`${where}: ${message}`);
}

/** Logs an error the person cannot fix themselves (a failed call to Supabase or Resend, a bug). */
export function logError(where: string, error: unknown, details?: Record<string, unknown>): void {
  console.error(`[${where}]`, error, ...(details ? [details] : []));
  if (!dsn) return;
  Sentry.withScope((scope) => {
    scope.setTag('where', where);
    if (details) scope.setExtras(details);
    if (error && typeof error === 'object' && !(error instanceof Error)) scope.setExtra('error', error);
    Sentry.captureException(toError(where, error));
  });
  unsent = true;
}

/** Whether anything was logged since the last flush (then a generic report would only repeat it). */
export function hasLoggedErrors(): boolean {
  return unsent;
}

/** Sends logged errors before the function returns: Vercel may freeze it right after the response. */
export async function flushErrors(): Promise<void> {
  if (!unsent) return;
  unsent = false;
  await Sentry.flush(2000);
}
