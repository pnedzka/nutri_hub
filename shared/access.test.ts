import { describe, expect, it } from 'vitest';
import { canUse, toApps } from './access';

describe('toApps', () => {
  it('keeps known apps once, in a fixed order', () => {
    expect(toApps(['intranet', 'neutralizer', 'intranet', 'crm', 7])).toEqual(['neutralizer', 'intranet']);
    expect(toApps(null)).toEqual([]);
  });
});

describe('canUse', () => {
  it('lets administrators use every app and users only their own', () => {
    expect(canUse({ role: 'admin', apps: [] }, 'signatures')).toBe(true);
    expect(canUse({ role: 'user', apps: ['signatures'] }, 'signatures')).toBe(true);
    expect(canUse({ role: 'user', apps: ['signatures'] }, 'neutralizer')).toBe(false);
  });
});
