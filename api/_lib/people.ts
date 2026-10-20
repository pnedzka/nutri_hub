// The people of a module (News, Leave) with their names, for lists, approvers and e-mails.

import { canUse, toApps, type AppId } from '../../shared/access.js';
import type { Person } from '../../shared/leaveApi.js';
import { db } from './supabase.js';

export interface PersonRow extends Person {
  isAdmin: boolean;
}

/** Everyone who may use the module (administrators and people with it in `profiles.apps`), by name. */
export async function appPeople(app: AppId): Promise<PersonRow[]> {
  const { data, error } = await db().from('profiles').select('id, email, full_name, role, apps');
  if (error) throw error;
  return (data ?? [])
    .filter((row) => canUse({ role: row.role === 'admin' ? 'admin' : 'user', apps: toApps(row.apps) }, app))
    .map((row) => ({
      id: String(row.id),
      email: String(row.email ?? ''),
      name: (row.full_name as string | null)?.trim() || String(row.email ?? ''),
      isAdmin: row.role === 'admin',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

export const toPerson = ({ id, name, email }: PersonRow): Person => ({ id, name, email });

/** A person by id for the browser; unknown ids are people who no longer have access. */
export function personOf(people: Map<string, PersonRow>, id: unknown): Person | null {
  if (!id) return null;
  const found = people.get(String(id));
  return found ? toPerson(found) : { id: String(id), name: 'Former user', email: '' };
}
