import { describe, expect, it } from 'vitest';
import { accountMessage } from './mail';

const base = { email: 'anna@nutripartners.co', url: 'https://nutripartners.vercel.app/?link=x&type=invite', appUrl: 'https://nutripartners.vercel.app' };

describe('accountMessage', () => {
  it('lists the granted apps in an invitation', () => {
    const { subject, text, html } = accountMessage({ ...base, kind: 'invite', apps: ['neutralizer', 'owner-lookup'], invitedBy: 'Paweł' });
    expect(subject).toBe('Invitation to the Nutri Partners apps');
    expect(text).toContain('Your apps: Document neutralizer, HubSpot owner lookup');
    expect(text).toContain('Invited by: Paweł');
    expect(html).toContain(base.url.replace(/&/g, '&amp;'));
  });

  it('says "all apps" for an administrator and leaves the list out of a reset', () => {
    expect(accountMessage({ ...base, kind: 'invite', apps: 'all' }).text).toContain('Your apps: all apps (administrator)');
    expect(accountMessage({ ...base, kind: 'recovery', apps: ['intranet'] }).text).not.toContain('Your apps');
  });
});
