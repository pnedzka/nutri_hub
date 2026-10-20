import { APP_NAMES, canUse, toApps, type AppId, type Role } from '../../shared/access.js';
import { HttpError } from './http.js';
import { db } from './supabase.js';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  apps: AppId[];
}

export const PROFILE_COLUMNS = 'id, email, full_name, role, apps';

export function toProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    full_name: (row.full_name as string | null) ?? null,
    role: row.role === 'admin' ? 'admin' : 'user',
    apps: toApps(row.apps),
  };
}

/** The signed-in user (from the Supabase access token in the Authorization header) and their profile. */
export async function requireUser(request: Request): Promise<Profile> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please sign in.');
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  const { data: row, error: readError } = await db().from('profiles').select(PROFILE_COLUMNS).eq('id', data.user.id).maybeSingle();
  if (readError) throw readError;
  if (!row) throw new HttpError(403, 'Your account has no profile yet. Ask your administrator.');
  return toProfile(row);
}

export async function requireAdmin(request: Request): Promise<Profile> {
  const profile = await requireUser(request);
  if (profile.role !== 'admin') throw new HttpError(403, 'This feature is available to administrators only.');
  return profile;
}

/** A person using one of the hub's own modules (News, Leave). */
export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

/** The signed-in user, if they may use this module of the hub (administrators, or the module in `profiles.apps`). */
export async function requireApp(request: Request, app: AppId): Promise<AppUser> {
  const profile = await requireUser(request);
  if (!canUse(profile, app)) throw new HttpError(403, `You don't have access to ${APP_NAMES[app]}. Ask your administrator.`);
  return { id: profile.id, email: profile.email.toLowerCase(), name: profile.full_name?.trim() || null, isAdmin: profile.role === 'admin' };
}
