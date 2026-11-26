import { describe, expect, it } from 'vitest';
import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('names the module of the path', () => {
    expect(pageTitle('/')).toBe('Home – Nutri Partners');
    expect(pageTitle('/leave/calendar')).toBe('Leave – Nutri Partners');
    expect(pageTitle('/contracts/14-S-TT-2026')).toBe('Contracts – Nutri Partners');
    expect(pageTitle('/users/abc')).toBe('User management – Nutri Partners');
  });
  it('keeps "Apps" for other paths', () => {
    expect(pageTitle('/sso')).toBe('Apps – Nutri Partners');
  });
});
