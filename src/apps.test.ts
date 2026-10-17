import { describe, expect, it } from 'vitest';
import { APPS, sectionsFor } from './apps';

const ids = (role: 'admin' | 'user') => sectionsFor(role).map((s) => [s.title, s.apps.map((a) => a.id)]);

describe('sectionsFor', () => {
  it('shows a user the apps for everyone only', () => {
    expect(ids('user')).toEqual([['Your apps', ['neutralizer', 'signatures', 'owner-lookup', 'intranet']]]);
  });

  it('adds the Administration section for an admin', () => {
    expect(ids('admin')).toEqual([
      ['Your apps', ['neutralizer', 'signatures', 'owner-lookup', 'intranet']],
      ['Administration', ['users']],
    ]);
  });

  it('leaves out empty sections', () => {
    expect(sectionsFor('admin', APPS.filter((a) => a.audience === 'everyone')).map((s) => s.title)).toEqual(['Your apps']);
  });
});

describe('APPS', () => {
  it('has unique ids and https addresses', () => {
    expect(new Set(APPS.map((a) => a.id)).size).toBe(APPS.length);
    for (const app of APPS) expect(new URL(app.url).protocol).toBe('https:');
  });

  it('opens only the intranet in a new tab', () => {
    expect(APPS.filter((a) => a.newTab).map((a) => a.id)).toEqual(['intranet']);
  });

  it('links user management to the Users tab of the neutralizer', () => {
    expect(APPS.find((a) => a.id === 'users')?.url).toBe('https://nutridocumentation-nxdi.vercel.app/admin/uzytkownicy');
  });
});
