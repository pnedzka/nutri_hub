import { describe, expect, it } from 'vitest';
import { legacyRedirect } from './legacy';

const at = (href: string) => legacyRedirect(new URL(href));

describe('legacyRedirect', () => {
  it('sends old owner lookup search links on to the owner lookup', () => {
    expect(at('https://nutripartners.vercel.app/?q=wellu.eu')).toBe('https://whoisowner.vercel.app/?q=wellu.eu');
    expect(at('https://nutripartners.vercel.app/?q=Anna%20Kowalska')).toBe('https://whoisowner.vercel.app/?q=Anna%20Kowalska');
  });

  it('keeps everything else in the hub', () => {
    expect(at('https://nutripartners.vercel.app/')).toBeNull();
    expect(at('https://nutripartners.vercel.app/?utm_source=mail')).toBeNull();
    expect(at('https://nutripartners.vercel.app/other?q=x')).toBeNull();
  });
});
