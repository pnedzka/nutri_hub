import { flushErrors, hasLoggedErrors, logError } from './monitoring.js';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** An error with a message meant for the user and an HTTP status. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Runs a handler and turns thrown errors into JSON responses. Unexpected errors and our own 5xx errors are logged
 * (and sent to Sentry), unless the code that threw already logged the details.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status >= 500 && !hasLoggedErrors()) logError('http', error, { status: error.status });
      return json({ error: error.message }, error.status);
    }
    logError('http', error);
    return json({ error: 'An unexpected server error occurred.' }, 500);
  } finally {
    await flushErrors();
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid request data.');
  }
}

/** Address of the app that links in e-mails lead to: `APP_URL`, or the address the request came to. */
export function appUrl(request: Request): string {
  return (process.env.APP_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, '');
}
