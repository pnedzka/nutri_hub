import { describe, expect, it } from 'vitest';
import { APP_IDS } from '../shared/access';
import { APPS, sectionsFor } from './apps';

const MODULES = 'news,leave';
const ids = (user: Parameters<typeof sectionsFor>[0], modules: string | undefined = MODULES) =>
  sectionsFor(user, APPS, modules).map((s) => [s.title, s.apps.map((a) => a.id)]);

describe('sectionsFor', () => {
  it('shows a user only the apps they may use', () => {
    expect(ids({ role: 'user', apps: ['neutralizer', 'intranet'] })).toEqual([['Your apps', ['neutralizer', 'team', 'intranet']]]);
  });

  it('shows only Team to a user without apps', () => {
    expect(ids({ role: 'user', apps: [] })).toEqual([['Your apps', ['team']]]);
  });

  it('shows News and Leave, modules of the hub, as paths inside it', () => {
    expect(ids({ role: 'user', apps: ['leave', 'news'] })).toEqual([['Your apps', ['news', 'leave', 'team']]]);
    expect(APPS.filter((a) => a.id === 'news' || a.id === 'leave').map((a) => a.url)).toEqual(['/news', '/leave']);
  });

  it('hides News and Leave where VITE_HUB_MODULES does not list them (production)', () => {
    expect(ids({ role: 'admin', apps: [] }, '')).toEqual([
      ['Your apps', ['neutralizer', 'signatures', 'owner-lookup', 'team', 'intranet']],
      ['Administration', ['users']],
    ]);
    expect(ids({ role: 'user', apps: ['news', 'leave', 'neutralizer'] }, 'news')).toEqual([['Your apps', ['neutralizer', 'news', 'team']]]);
  });

  it('shows an admin every app and the Administration section', () => {
    expect(ids({ role: 'admin', apps: [] })).toEqual([
      ['Your apps', ['neutralizer', 'signatures', 'owner-lookup', 'news', 'leave', 'team', 'intranet']],
      ['Administration', ['users']],
    ]);
  });
});

describe('APPS', () => {
  it('has a tile for every app id', () => {
    expect(APPS.filter((a) => a.audience === 'app').map((a) => a.id)).toEqual([...APP_IDS]);
  });

  it('has unique ids, https addresses or hub paths', () => {
    expect(new Set(APPS.map((a) => a.id)).size).toBe(APPS.length);
    for (const app of APPS) expect(app.url.startsWith('/') || new URL(app.url).protocol === 'https:').toBe(true);
  });

  it('opens only the intranet in a new tab', () => {
    expect(APPS.filter((a) => a.newTab).map((a) => a.id)).toEqual(['intranet']);
  });
});
