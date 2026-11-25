import { describe, expect, it } from 'vitest';
import { APP_IDS } from '../shared/access';
import { APPS, navSectionsFor, sectionsFor, tileTarget } from './apps';

const MODULES = 'news,leave,calls,purchase';
const ids = (user: Parameters<typeof sectionsFor>[0], modules: string | undefined = MODULES) =>
  sectionsFor(user, APPS, modules).map((s) => [s.title, s.apps.map((a) => a.id)]);

describe('sectionsFor', () => {
  it('shows a user only the apps they may use', () => {
    expect(ids({ role: 'user', apps: ['neutralizer', 'intranet'] })).toEqual([['Your apps', ['neutralizer', 'team', 'intranet']]]);
  });

  it('shows the New user accounts tile to people allowed to create accounts, not to administrators', () => {
    expect(ids({ role: 'user', apps: ['signatures', 'create-users'] })).toEqual([['Your apps', ['signatures', 'team', 'create-users']]]);
    expect(ids({ role: 'admin', apps: ['create-users'] })[0][1]).not.toContain('create-users');
    // "Edit user profiles" opens User management, where "Add user" is too.
    expect(ids({ role: 'user', apps: ['create-users', 'edit-users'] })).toEqual([['Your apps', ['team', 'edit-users']]]);
    expect(ids({ role: 'admin', apps: ['edit-users'] })[0][1]).not.toContain('edit-users');
  });

  it('shows only Team to a user without apps', () => {
    expect(ids({ role: 'user', apps: [] })).toEqual([['Your apps', ['team']]]);
  });

  it('shows News, Leave and Purchase Manager, modules of the hub, as paths inside it', () => {
    expect(ids({ role: 'user', apps: ['leave', 'news'] })).toEqual([['Your apps', ['news', 'leave', 'team']]]);
    expect(ids({ role: 'user', apps: ['purchase'] })).toEqual([['Your apps', ['purchase', 'team']]]);
    expect(APPS.filter((a) => ['news', 'leave', 'purchase'].includes(a.id)).map((a) => a.url)).toEqual(['/news', '/leave', '/purchase']);
  });

  it('hides News, Leave and Phone calls analyser where VITE_HUB_MODULES does not list them (production)', () => {
    expect(ids({ role: 'admin', apps: [] }, '')).toEqual([
      ['Your apps', ['neutralizer', 'signatures', 'owner-lookup', 'commission', 'purchase', 'team', 'intranet']],
      ['Administration', ['users', 'contests']],
    ]);
    expect(ids({ role: 'user', apps: ['news', 'leave', 'purchase', 'neutralizer'] }, 'news')).toEqual([['Your apps', ['neutralizer', 'news', 'purchase', 'team']]]);
  });

  it('shows an admin every app and the Administration section', () => {
    expect(ids({ role: 'admin', apps: [] })).toEqual([
      ['Your apps', ['neutralizer', 'signatures', 'owner-lookup', 'commission', 'news', 'leave', 'purchase', 'team', 'intranet']],
      ['Administration', ['users', 'calls', 'contests']],
    ]);
  });
});

describe('APPS', () => {
  it('has a tile for every app id', () => {
    // The extra permissions of the Contract generator and of Leave share their module's tile.
    const withTiles = APP_IDS.filter((id) => !id.startsWith('contracts-') && id !== 'leave-admin');
    expect(APPS.filter((a) => a.audience === 'app').map((a) => a.id)).toEqual(withTiles);
    expect(APPS.find((a) => a.id === 'create-users')?.url).toBe('/users/new');
  });

  it('has unique ids, https addresses or hub paths', () => {
    expect(new Set(APPS.map((a) => a.id)).size).toBe(APPS.length);
    for (const app of APPS) expect(app.url.startsWith('/') || new URL(app.url).protocol === 'https:').toBe(true);
  });

  it('opens only the intranet in a new tab', () => {
    expect(APPS.filter((a) => a.newTab).map((a) => a.id)).toEqual(['intranet']);
  });
});

describe('navSectionsFor', () => {
  const nav = (user: Parameters<typeof navSectionsFor>[0]) => navSectionsFor(user, APPS, MODULES).map((s) => [s.title, s.apps.map((a) => a.id)]);

  it('splits the apps into modules of the hub, separate apps and administration', () => {
    expect(nav({ role: 'user', apps: ['news', 'owner-lookup', 'intranet', 'create-users'] })).toEqual([
      ['Work', ['news', 'team']],
      ['Tools', ['owner-lookup', 'intranet']],
      ['Administration', ['create-users']],
    ]);
  });

  it('gives an admin every app, with User management and Phone calls analyser under Administration', () => {
    const sections = nav({ role: 'admin', apps: [] });
    expect(sections.map(([title]) => title)).toEqual(['Work', 'Tools', 'Administration']);
    expect(sections[2][1]).toEqual(['users', 'calls', 'contests']);
  });

  it('shows only Team to a user without apps', () => {
    expect(nav({ role: 'user', apps: [] })).toEqual([['Work', ['team']]]);
  });
});

describe('tileTarget', () => {
  const tile = (id: string) => APPS.find((a) => a.id === id)!;
  it('keeps hub paths, sends our apps through one sign-in and links the intranet directly', () => {
    expect(tileTarget(tile('news'), () => false)).toEqual({ path: '/news' });
    expect(tileTarget(tile('owner-lookup'), (id) => id === 'owner-lookup')).toEqual({ path: '/sso?app=owner-lookup' });
    expect(tileTarget(tile('intranet'), () => false)).toEqual({ href: 'https://intranet.nutripartners.co' });
  });
});

describe('Contract generator tile', () => {
  const tiles = (apps: string[]) => sectionsFor({ role: 'user', apps: apps as never }, APPS, 'contracts').flatMap((s) => s.apps.map((a) => a.id));
  it('shows for traders, administration and signers, and only where the module is on', () => {
    expect(tiles(['contracts'])).toContain('contracts');
    expect(tiles(['contracts-admin'])).toContain('contracts');
    expect(tiles(['contracts-sign'])).toContain('contracts');
    expect(tiles(['news'])).not.toContain('contracts');
    expect(sectionsFor({ role: 'user', apps: ['contracts'] }, APPS, '').flatMap((s) => s.apps.map((a) => a.id))).not.toContain('contracts');
  });
});
