import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { firstName, toAppUser, toRole } from './user';

const authUser = (meta: Record<string, unknown> = {}) =>
  ({ id: 'u1', email: 'Anna.Kowalska@NutriPartners.co', user_metadata: meta }) as unknown as User;

describe('toRole', () => {
  it('recognises admins and treats anything else as a user', () => {
    expect(toRole('admin')).toBe('admin');
    expect(toRole('user')).toBe('user');
    expect(toRole(null)).toBe('user');
    expect(toRole('Admin')).toBe('user');
  });
});

describe('toAppUser', () => {
  it('takes the name and role from the profile', () => {
    expect(toAppUser(authUser(), { full_name: 'Anna Kowalska', role: 'admin' })).toEqual({
      id: 'u1',
      email: 'anna.kowalska@nutripartners.co',
      name: 'Anna Kowalska',
      role: 'admin',
    });
  });

  it('falls back to the sign-in metadata, and to a user without a profile', () => {
    expect(toAppUser(authUser({ full_name: 'Anna K.' }), null)).toMatchObject({ name: 'Anna K.', role: 'user' });
    expect(toAppUser(authUser(), { full_name: '  ' })).toMatchObject({ name: null, role: 'user' });
  });
});

describe('firstName', () => {
  it('returns the first word of the name', () => {
    expect(firstName({ name: 'Anna Kowalska' })).toBe('Anna');
    expect(firstName({ name: null })).toBeNull();
  });
});
