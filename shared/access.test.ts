import { describe, expect, it } from 'vitest';
import { DEFAULT_APPS, canUse, grantableApps, isAvailable, newAccountProblem, toApps } from './access';

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
  it('leaves Purchase Manager and creating accounts out of a new account', () => {
    expect(DEFAULT_APPS).not.toContain('purchase');
    expect(DEFAULT_APPS).not.toContain('create-users');
    expect(DEFAULT_APPS).toContain('neutralizer');
  });
});

describe('creating accounts', () => {
  const creator = { role: 'user' as const, apps: ['create-users', 'signatures', 'neutralizer'] };
  const invite = (apps: ('signatures' | 'neutralizer' | 'purchase' | 'create-users')[], role: 'user' | 'admin' = 'user') => ({ role, apps, invite: true });

  it('lets administrators create any account', () => {
    expect(newAccountProblem({ role: 'admin', apps: [] }, { role: 'admin', apps: [], invite: false })).toBeNull();
    expect(grantableApps({ role: 'admin', apps: [] })).toContain('purchase');
  });

  it('lets a person with the permission invite users with their own apps', () => {
    expect(newAccountProblem(creator, invite(['signatures', 'create-users']))).toBeNull();
    expect(grantableApps(creator)).toEqual(['neutralizer', 'signatures', 'create-users']);
  });

  it('refuses everyone else, administrator accounts, start passwords and apps the creator does not have', () => {
    expect(newAccountProblem({ role: 'user', apps: ['signatures'] }, invite(['signatures']))).toMatch(/Only administrators/);
    expect(newAccountProblem(creator, invite([], 'admin'))).toMatch(/administrator accounts/);
    expect(newAccountProblem(creator, { role: 'user', apps: [], invite: false })).toMatch(/start password/);
    expect(newAccountProblem(creator, invite(['signatures', 'purchase']))).toMatch(/not: Purchase Manager/);
  });
});
