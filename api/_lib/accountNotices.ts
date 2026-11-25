// Notifications about accounts (README "Powiadomienia", U1–U3): new access or role, a person who joined.
// Bell only, no e-mail.

import { APP_NAMES, isAvailable, type AppId } from '../../shared/access.js';
import { logError } from './monitoring.js';
import { notify, type Recipient } from './notifications.js';
import { db } from './supabase.js';

interface Account {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  apps: AppId[];
}

const recipient = (a: Pick<Account, 'id' | 'email' | 'full_name'>): Recipient => ({ id: a.id, email: a.email, name: a.full_name?.trim() || a.email });

/** What changed for the person, in words (pure; tested). */
export function accessChanges(before: Pick<Account, 'role' | 'apps'>, after: Pick<Account, 'role' | 'apps'>, modules = process.env.VITE_HUB_MODULES): string[] {
  const changes: string[] = [];
  if (before.role !== after.role) changes.push(after.role === 'admin' ? 'You are now an administrator (all apps)' : 'You are no longer an administrator');
  if (after.role !== 'admin') {
    const added = after.apps.filter((a) => !before.apps.includes(a) && a !== 'create-users' && a !== 'edit-users' && isAvailable(a, modules));
    if (added.length) changes.push(`New: ${added.map((a) => APP_NAMES[a]).join(', ')}`);
    if (after.apps.includes('create-users') && !before.apps.includes('create-users')) changes.push('You can invite new people');
    if (after.apps.includes('edit-users') && !before.apps.includes('edit-users')) changes.push('You can edit user profiles');
  }
  return changes;
}

/** U1: an administrator gave the person new apps or changed their role. */
export async function notifyAccessChanged(baseUrl: string, adminId: string, before: Account, after: Account): Promise<void> {
  const changes = accessChanges(before, after);
  if (!changes.length) return;
  await notify(baseUrl, {
    module: 'account',
    kind: 'account.access',
    to: [recipient(after)],
    actorId: adminId,
    title: changes[0],
    body: changes.slice(1).join('. ') || 'Your apps are in the side menu and on the home page.',
    link: '/',
  });
}

/**
 * U2 + U3: someone opened their invitation for the first time. The person who invited them and the rest of the team
 * get it in the bell (once per account: the 'joined' entry in profile_events).
 */
export async function notifyJoined(baseUrl: string, userId: string): Promise<void> {
  try {
    const { data: events, error } = await db().from('profile_events').select('actor_id, action').eq('profile_id', userId).in('action', ['created', 'joined']);
    if (error) throw error;
    if ((events ?? []).some((e) => e.action === 'joined')) return;
    const { error: logErr } = await db().from('profile_events').insert({ profile_id: userId, actor_id: userId, action: 'joined' });
    if (logErr) throw logErr;
    const inviterId = (events ?? []).find((e) => e.action === 'created')?.actor_id as string | null | undefined;

    const { data: people, error: peopleError } = await db().from('profiles').select('id, email, full_name').is('deactivated_at', null);
    if (peopleError) throw peopleError;
    const all = (people ?? []).map((p) => recipient({ id: String(p.id), email: String(p.email ?? ''), full_name: (p.full_name as string | null) ?? null }));
    const person = all.find((p) => p.id === userId);
    if (!person) return;
    const inviter = inviterId ? all.find((p) => p.id === inviterId) : undefined;
    if (inviter) {
      await notify(baseUrl, {
        module: 'account',
        kind: 'account.invite_accepted',
        to: [inviter],
        actorId: userId,
        title: `${person.name} accepted your invitation`,
        body: 'They can now sign in to the Nutri Partners apps.',
        link: '/team',
      });
    }
    await notify(baseUrl, {
      module: 'account',
      kind: 'account.joined',
      to: all.filter((p) => p.id !== inviter?.id),
      actorId: userId,
      title: `${person.name} joined the Nutri Partners apps`,
      body: 'Say hello! Their profile is in Team.',
      link: '/team',
    });
  } catch (error) {
    logError('notifications', error, { kind: 'account.joined' });
  }
}
