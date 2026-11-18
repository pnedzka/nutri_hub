import { describe, expect, it } from 'vitest';
import { sparkLink } from './spark';

describe('sparkLink', () => {
  it('builds the same link as Spark (example from Michał Roman, 18.11.2026)', () => {
    expect(sparkLink('purchase@nutripartners.co', '<8920df80-abf3-4204-bd89-72f874c91e60@Spark>')).toBe(
      'https://sparkmailapp.com/dpl/bl?token=QTpwdXJjaGFzZUBudXRyaXBhcnRuZXJzLmNvO0lEOjg5MjBkZjgwLWFiZjMtNDIw%0D%0ANC1iZDg5LTcyZjg3NGM5MWU2MEBTcGFyazszODI5NTQwMzc3',
    );
  });

  it('gives no link without a Message-ID or a mailbox', () => {
    expect(sparkLink('purchase@nutripartners.co', null)).toBeNull();
    expect(sparkLink(null, '<a@b>')).toBeNull();
    expect(sparkLink('purchase@nutripartners.co', '  ')).toBeNull();
  });
});
