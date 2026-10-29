import { describe, expect, it } from 'vitest';
import { DEFAULT_APPS, canUse, isAvailable, toApps } from './access';

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
    expect(isAvailable('calls', 'news,leave')).toBe(false);
    expect(isAvailable('calls', 'news,leave,calls')).toBe(true);
    // Purchase Manager is released (29.10.2026): available everywhere.
    expect(isAvailable('purchase', 'news,leave,calls')).toBe(true);
    expect(isAvailable('purchase', '')).toBe(true);
  });
});

describe('DEFAULT_APPS', () => {
  it('leaves Purchase Manager out of a new account', () => {
    expect(DEFAULT_APPS).not.toContain('purchase');
    expect(DEFAULT_APPS).toContain('neutralizer');
  });
});
