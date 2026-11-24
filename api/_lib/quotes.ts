// The quotes of the welcome card on the hub's home page, fetched by themselves so nobody has to keep a list
// (owner's request, 24.11.2026). Served by api/people.ts with ?resource=quotes (the Hobby plan allows 12 functions):
//
//   GET /api/people?resource=quotes → { quotes: Quote[], source: 'zenquotes' | 'none' }
//
// The source is ZenQuotes (https://zenquotes.io, free, 5 requests per 30 seconds; the page must credit it). The
// answer is cached by Vercel for 6 hours, so it is asked a few times a day and the quotes change by themselves.
// Nothing personal is in it, so no sign-in is needed. When ZenQuotes does not answer the list is empty and the
// browser takes one of the quotes built into the hub (shared/quotes.ts).

import { cleanQuotes, type Quote } from '../../shared/quotes.js';
import { logError } from './monitoring.js';

const SOURCE = 'https://zenquotes.io/api/quotes';
const TIMEOUT_MS = 4000;

export const isQuotesRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'quotes';

function answer(quotes: Quote[], cacheSeconds: number): Response {
  return new Response(JSON.stringify({ quotes, source: quotes.length ? 'zenquotes' : 'none' }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=600, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`,
    },
  });
}

export async function quotesGet(): Promise<Response> {
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`ZenQuotes answered ${response.status}`);
    const quotes = cleanQuotes(await response.json());
    if (quotes.length === 0) throw new Error('ZenQuotes sent no quotes');
    return answer(quotes, 6 * 60 * 60);
  } catch (error) {
    logError('quotes.fetch', error);
    // Ask again in 10 minutes rather than in 6 hours.
    return answer([], 10 * 60);
  }
}
