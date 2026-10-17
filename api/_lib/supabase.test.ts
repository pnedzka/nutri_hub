import { describe, expect, it } from 'vitest';
import { isPublicKey } from './supabase';

const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;

describe('isPublicKey', () => {
  it('rejects publishable and anon keys', () => {
    expect(isPublicKey('sb_publishable_abc')).toBe(true);
    expect(isPublicKey(jwt('anon'))).toBe(true);
  });

  it('accepts secret and service role keys', () => {
    expect(isPublicKey('sb_secret_abc')).toBe(false);
    expect(isPublicKey(jwt('service_role'))).toBe(false);
  });
});
