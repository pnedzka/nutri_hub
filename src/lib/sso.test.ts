import { afterEach, describe, expect, it, vi } from 'vitest';
import { ssoTarget, withToken } from './sso';

const PREVIEWS = 'https://(nutridocumentation-nxdi|whoisowner|nutri-signatures)-[a-z0-9-]+-nutri-partners\\.vercel\\.app';

describe('ssoTarget', () => {
  it('opens the requested page of the app', () => {
    expect(ssoTarget('owner-lookup', '/?q=wellu.eu', null, undefined)?.url.href).toBe('https://whoisowner.vercel.app/?q=wellu.eu');
    expect(ssoTarget('neutralizer', null, null, undefined)?.url.href).toBe('https://nutridocumentation-nxdi.vercel.app/');
  });

  it('refuses unknown apps and the old intranet', () => {
    expect(ssoTarget('intranet', '/', null, undefined)).toBeNull();
    expect(ssoTarget('evil', '/', null, undefined)).toBeNull();
    expect(ssoTarget(null, '/', null, undefined)).toBeNull();
  });

  it('never leaves the app', () => {
    for (const to of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)']) {
      expect(ssoTarget('signatures', to, null, undefined)?.url.origin).toBe('https://nutri-signatures.vercel.app');
    }
  });

  it('goes back to a preview only when previews are allowed', () => {
    const back = 'https://whoisowner-git-claude-x-nutri-partners.vercel.app';
    expect(ssoTarget('owner-lookup', '/', back, PREVIEWS)?.url.origin).toBe(back);
    expect(ssoTarget('owner-lookup', '/', back, undefined)?.url.origin).toBe('https://whoisowner.vercel.app');
    expect(ssoTarget('owner-lookup', '/', 'https://evil-nutri-partners.vercel.app.example.com', PREVIEWS)?.url.origin).toBe('https://whoisowner.vercel.app');
  });
});

describe('the new intranet (VITE_INTRANET_URL, previews only until its release)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('signs people in to it from its tile, in the same tab', async () => {
    vi.stubEnv('VITE_INTRANET_URL', 'https://nutri-intranet-git-develop-nutri-partners.vercel.app/');
    vi.resetModules();
    const { APPS } = await import('../apps');
    const sso = await import('./sso');
    expect(APPS.find((a) => a.id === 'intranet')).toMatchObject({ url: 'https://nutri-intranet-git-develop-nutri-partners.vercel.app' });
    expect(APPS.find((a) => a.id === 'intranet')?.newTab).toBeUndefined();
    expect(sso.ssoTarget('intranet', '/news', null, undefined)?.url.href).toBe('https://nutri-intranet-git-develop-nutri-partners.vercel.app/news');
  });
});

describe('withToken', () => {
  it('puts the token in the fragment', () => {
    expect(withToken(new URL('https://whoisowner.vercel.app/?q=a'), 'abc')).toBe('https://whoisowner.vercel.app/?q=a#sso=abc');
  });
});
