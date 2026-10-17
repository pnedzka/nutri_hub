import type { User } from '@supabase/supabase-js';
import { toApps, type AppId, type Role } from '../../shared/access.ts';

export type { Role };

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** Apps the person may use; administrators may use every app regardless. */
  apps: AppId[];
}

/** The row of the neutralizer's `profiles` table that the hub reads (row level security returns only the user's own). */
export interface Profile {
  full_name?: string | null;
  role?: string | null;
  apps?: unknown;
}

/** `profiles.role` is 'admin' or 'user'; anything else (a missing row or column) counts as a regular user. */
export function toRole(value: unknown): Role {
  return value === 'admin' ? 'admin' : 'user';
}

export function toAppUser(user: User, profile: Profile | null): AppUser {
  const metaName = user.user_metadata?.full_name as string | undefined;
  return {
    id: user.id,
    email: (user.email ?? '').toLowerCase(),
    name: profile?.full_name?.trim() || metaName?.trim() || null,
    role: toRole(profile?.role),
    apps: toApps(profile?.apps),
  };
}

/** "Anna" for a greeting: the first word of the name, or nothing when the profile has no name. */
export function firstName(user: Pick<AppUser, 'name'>): string | null {
  return user.name?.split(/\s+/)[0] || null;
}
