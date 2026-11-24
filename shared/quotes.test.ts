import { describe, expect, it } from 'vitest';
import { FALLBACK_QUOTES, MAX_QUOTE_LENGTH, cleanQuotes, pickQuote } from './quotes';

describe('cleanQuotes', () => {
  it('keeps text and author of ZenQuotes answers', () => {
    expect(cleanQuotes([{ q: ' Act now. ', a: ' Someone ', h: '<b>x</b>' }])).toEqual([{ text: 'Act now.', author: 'Someone' }]);
  });

  it('leaves out long, empty, repeated quotes and the request-limit notice', () => {
    const quotes = cleanQuotes([
      { q: 'x'.repeat(MAX_QUOTE_LENGTH + 1), a: 'A' },
      { q: '', a: 'A' },
      { q: 'Keep going.', a: 'Unknown' },
      { q: 'Keep going.', a: 'B' },
      { q: 'Too many requests. Obtain an auth key for unlimited access.', a: 'zenquotes.io' },
    ]);
    expect(quotes).toEqual([{ text: 'Keep going.', author: null }]);
  });

  it('gives nothing for an answer that is not a list', () => {
    expect(cleanQuotes({ error: 'x' })).toEqual([]);
    expect(cleanQuotes(null)).toEqual([]);
  });
});

describe('pickQuote', () => {
  it('takes a fetched quote when there are some', () => {
    const fetched = [
      { text: 'One', author: 'A' },
      { text: 'Two', author: null },
    ];
    expect(pickQuote(fetched, () => 0)).toEqual(fetched[0]);
    expect(pickQuote(fetched, () => 0.99)).toEqual(fetched[1]);
  });

  it('falls back to the built-in list', () => {
    expect(pickQuote([], () => 0)).toEqual({ text: FALLBACK_QUOTES[0], author: null });
    expect(pickQuote([], () => 1)).toEqual({ text: FALLBACK_QUOTES[FALLBACK_QUOTES.length - 1], author: null });
  });
});
