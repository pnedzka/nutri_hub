import { describe, expect, it } from 'vitest';
import { canUse, isAvailable, toApps } from './access';

describe('toApps', () => {
  it('keeps known apps once, in a fixed order', () => {
    expect(toApps(['intranet', 'neutralizer', 'intranet', 'crm', 7])).toEqual(['neutralizer', 'intranet']);
    expect(toApps(null)).toEqual([]);
    expect(toApps(['leave', 'news', 'owner-lookup'])).toEqual(['owner-lookup', 'news', 'leave']);
  });
});

describe('canUse', () => {
  it('lets administrators use every app and users only their own', () => {
    expect(canUse({ role: 'admin', apps: [] }, 'signatures')).toBe(true);
    expect(canUse({ role: 'user', apps: ['signatures'] }, 'signatures')).toBe(true);
    expect(canUse({ role: 'user', apps: ['signatures'] }, 'neutralizer')).toBe(false);
  });
});

describe('isAvailable', () => {
  it('keeps modules in development off unless VITE_HUB_MODULES lists them', () => {
    expect(isAvailable('neutralizer', undefined)).toBe(true);
    expect(isAvailable('news', undefined)).toBe(false);
    expect(isAvailable('leave', '')).toBe(false);
    expect(isAvailable('news', 'news, leave')).toBe(true);
    expect(isAvailable('leave', 'news')).toBe(false);
  });
});
