// Quotes for the welcome card on the hub's home page. They come by themselves from ZenQuotes through the hub's
// server (api/_lib/quotes.ts); the short business lines below are only the fallback when that source does not
// answer, so the card is never empty.

export interface Quote {
  text: string;
  author: string | null;
}

/** Longer quotes do not fit the card well. */
export const MAX_QUOTE_LENGTH = 180;

export const FALLBACK_QUOTES: readonly string[] = [
  'There is only one way to avoid criticism: do nothing, say nothing, and be nothing.',
  'The secret of getting ahead is getting started.',
  'Quality is not an act, it is a habit.',
  'Well done is better than well said.',
  'Opportunities don’t happen. You create them.',
  'The best way to predict the future is to create it.',
  'Success is not final, failure is not fatal: it is the courage to continue that counts.',
  'Don’t watch the clock; do what it does. Keep going.',
  'Done is better than perfect.',
  'Price is what you pay. Value is what you get.',
  'It always seems impossible until it’s done.',
  'Small daily improvements are the key to staggering long-term results.',
  'The harder I work, the luckier I get.',
  'A goal without a plan is just a wish.',
  'Discipline is the bridge between goals and accomplishment.',
];

/**
 * ZenQuotes' answer ([{ q, a }, …]) as quotes: text and author trimmed, without the long ones, the empty ones, the
 * repeated ones and ZenQuotes' own notice about its request limit.
 */
export function cleanQuotes(raw: unknown): Quote[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const quotes: Quote[] = [];
  for (const item of raw) {
    const text = typeof item?.q === 'string' ? item.q.trim() : '';
    const author = typeof item?.a === 'string' ? item.a.trim() : '';
    if (!text || text.length > MAX_QUOTE_LENGTH || seen.has(text) || /zenquotes/i.test(`${text} ${author}`)) continue;
    seen.add(text);
    quotes.push({ text, author: author && author.toLowerCase() !== 'unknown' ? author : null });
  }
  return quotes;
}

/** One quote for this visit: from the fetched ones, or from the fallback list; `random` is there for the tests. */
export function pickQuote(fetched: readonly Quote[], random: () => number = Math.random): Quote {
  const index = (length: number) => Math.min(length - 1, Math.floor(random() * length));
  if (fetched.length) return fetched[index(fetched.length)];
  return { text: FALLBACK_QUOTES[index(FALLBACK_QUOTES.length)], author: null };
}
