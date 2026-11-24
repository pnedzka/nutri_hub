import { describe, expect, it } from 'vitest';
import { QUOTES, pickQuote } from './quotes';

describe('pickQuote', () => {
  it('returns a quote from the list for any random number', () => {
    expect(pickQuote(() => 0)).toBe(QUOTES[0]);
    expect(pickQuote(() => 0.999999)).toBe(QUOTES[QUOTES.length - 1]);
    expect(pickQuote(() => 1)).toBe(QUOTES[QUOTES.length - 1]);
  });

  it('has no empty or repeated quotes', () => {
    expect(QUOTES.every((q) => q.trim().length > 0)).toBe(true);
    expect(new Set(QUOTES).size).toBe(QUOTES.length);
  });
});
