// User accounts (administrator only). There is no public sign-up: an administrator creates every account, or someone
// with the "Create user accounts" permission (POST only: invitations to users with apps they have themselves,
// newAccountProblem in shared/access.ts).
//
// By default a new account gets an invitation e-mail with a link to set the password (see _lib/mail.ts). A start
// password set by the administrator remains as a fallback.
//
// `apps` is the list of apps the person may use (ids from shared/access.ts); administrators may use every app.
//
// Contact details (job title, phones, office, photo) are saved with PATCH /api/people, by the person or an
// administrator; every change of an account is noted in its history (profile_events).
//
//   GET   /api/admin/users              → { users: (Profile & { created_at, documents, status, last_sign_in_at, profile })[] }
//   GET   /api/admin/users?history=<id> → { events: ProfileEvent[] }
//   POST  /api/admin/users   body { email, fullName?, role?, apps?, invite?, password? } → { user, invited }
//   PATCH /api/admin/users   body { id, role?, fullName?, apps?, password?, sendLink?, active? } → { user, sent? }
//   DELETE /api/admin/users  body { id } → { deleted: email }
//
// `active: false` deactivates an account (someone who left): it is banned in Supabase Auth, cannot sign in and is
// hidden from Team and the modules, while its documents, leave and posts stay. `active: true` restores it.
//
// `?resource=calls` is Phone calls analyser (api/_lib/calls.ts) and `?resource=purchase` Purchase Manager
// (api/_lib/purchase.ts, not only administrators), here because the Hobby plan's 12 functions are used.

import type { User } from '@supabase/supabase-js';
import { newAccountProblem, toApps } from '../../shared/access.js';
import { PROFILE_COLUMNS, requireAdmin, requireUser, toProfile, type Profile } from '../_lib/auth.js';
import { HttpError, appUrl, handle, json, readJson } from '../_lib/http.js';
import { createInvitedUser, issueAccountLink } from '../_lib/accountLinks.js';
import { sendAccountMail } from '../_lib/mail.js';
import { db } from '../_lib/supabase.js';
import { logError } from '../_lib/monitoring.js';
import { isUuid, type ProfileEvent } from '../../shared/profile.js';
import { CONTACT_COLUMNS, logProfileEvent, signAvatars, toTeamMember } from '../_lib/profiles.js';
import { callsGet, callsPost, isCallsRequest } from '../_lib/calls.js';
import { isPurchaseRequest, purchaseGet, purchasePost } from '../_lib/purchase.js';

const MIN_PASSWORD = 10;

/** active: has signed in; invited: invitation not used yet; created: start password, never signed in. */
export type AccountStatus = 'active' | 'invited' | 'created' | 'deactivated';

/** "Never" for a ban: Supabase Auth takes a duration, 100 years is the usual way to block an account for good. */
const BAN_FOREVER = '876000h';

function accountStatus(user: User | undefined, deactivated = false): AccountStatus {
  if (deactivated) return 'deactivated';
  if (user?.last_sign_in_at) return 'active';
  return user?.invited_at && !user.email_confirmed_at ? 'invited' : 'created';
}

async function authUsers(): Promise<Map<string, User>> {
  const users = new Map<string, User>();
  for (let page = 1; ; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) users.set(user.id, user);
    if (data.users.length < 1000) return users;
  }
}

/** The history of one account, newest first, with the names of who made each change. */
async function history(id: string): Promise<ProfileEvent[]> {
  const { data, error } = await db()
    .from('profile_events')
    .select('id, action, details, created_at, actor:profiles!profile_events_actor_id_fkey(full_name, email)')
    .eq('profile_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((e) => {
    const actor = (Array.isArray(e.actor) ? e.actor[0] : e.actor) as { full_name?: string | null; email?: string } | null;
    return {
      id: String(e.id),
      action: String(e.action),
      details: (e.details ?? {}) as Record<string, unknown>,
      createdAt: String(e.created_at),
      actor: actor ? actor.full_name?.trim() || actor.email || null : null,
    };
  });
}

export function GET(request: Request): Promise<Response> {
  if (isCallsRequest(request)) return callsGet(request);
  if (isPurchaseRequest(request)) return purchaseGet(request);
  return handle(async () => {
    await requireAdmin(request);
    const historyOf = new URL(request.url).searchParams.get('history');
    if (historyOf !== null) {
      if (!isUuid(historyOf)) throw new HttpError(400, 'User ID is invalid.');
      return json({ events: await history(historyOf) });
    }
    const { data, error } = await db().from('profiles').select(`${PROFILE_COLUMNS}, ${CONTACT_COLUMNS}, created_at, deactivated_at`).order('email');
    if (error) throw error;
    const { data: docs, error: docsError } = await db().from('documents').select('owner_id');
    if (docsError) throw docsError;
    const counts = new Map<string, number>();
    for (const d of docs ?? []) counts.set(d.owner_id, (counts.get(d.owner_id) ?? 0) + 1);
    const [accounts, avatars] = await Promise.all([authUsers(), signAvatars((data ?? []).map((u) => u.avatar_path))]);
    return json({
      users: (data ?? []).map((u) => {
        const account = accounts.get(u.id);
        return {
          ...toProfile(u),
          created_at: u.created_at,
          documents: counts.get(u.id) ?? 0,
          status: accountStatus(account, Boolean(u.deactivated_at)),
          last_sign_in_at: account?.last_sign_in_at ?? null,
          profile: toTeamMember(u, avatars),
        };
      }),
    });
  });
}

const role = (value: unknown): Profile['role'] => (value === 'admin' ? 'admin' : 'user');

export function POST(request: Request): Promise<Response> {
  if (isCallsRequest(request)) return callsPost(request);
  if (isPurchaseRequest(request)) return purchasePost(request);
  return handle(async () => {
    const creator = await requireUser(request);
    const body = await readJson<{ email?: unknown; fullName?: unknown; password?: unknown; role?: unknown; apps?: unknown; invite?: unknown }>(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim().slice(0, 200) : null;
    const invite = body.invite !== false;
    const password = typeof body.password === 'string' ? body.password : '';
    const problem = newAccountProblem(creator, { role: role(body.role), apps: toApps(body.apps), invite });
    if (problem) throw new HttpError(403, problem);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Invalid e-mail address.');
    if (!invite && password.length < MIN_PASSWORD) throw new HttpError(400, `The password must be at least ${MIN_PASSWORD} characters long.`);
    // Supabase reuses an account that was invited but never signed in, so without this the profile below would
    // overwrite its role and apps.
    const { data: existing, error: existingError } = await db().from('profiles').select('id').eq('email', email).maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw new HttpError(400, 'A user with this address already exists.');

    const created = invite
      ? await createInvitedUser(email, fullName)
      : await db().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }).then(({ data, error }) => ({ user: data.user, error }));
    if (created.error || !created.user) {
      const error = created.error as { code?: string; message?: string } | null;
      if (error && (error.code === 'email_exists' || /already/i.test(error.message ?? ''))) throw new HttpError(400, 'A user with this address already exists.');
      logError('users.create', error);
      throw new HttpError(400, 'Could not create the account.');
    }
    const profile: Profile = { id: created.user.id, email, full_name: fullName, role: role(body.role), apps: toApps(body.apps) };
    const { error: profileError } = await db().from('profiles').upsert(profile);
    if (profileError) throw profileError;
    await logProfileEvent(profile.id, creator.id, 'created', { role: profile.role, apps: profile.apps });
    if (invite) {
      try {
        const url = await issueAccountLink('invite', created.user.id, appUrl(request));
        await sendAccountMail({
          kind: 'invite',
          email,
          url,
          appUrl: appUrl(request),
          invitedBy: creator.full_name || creator.email,
          apps: profile.role === 'admin' ? 'all' : profile.apps,
        });
        await logProfileEvent(profile.id, creator.id, 'invited');
      } catch (error) {
        const reason = error instanceof HttpError ? error.message : 'sending failed.';
        const again = creator.role === 'admin' ? 'Send it again from the account list ("⋯" → Resend invitation).' : 'Ask an administrator to send it again.';
        throw new HttpError(502, `The account was created, but the invitation was not sent: ${reason} ${again}`);
      }
    }
    return json({ user: profile, invited: invite }, 201);
  });
}

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const body = await readJson<{ id?: unknown; role?: unknown; fullName?: unknown; apps?: unknown; password?: unknown; sendLink?: unknown; active?: unknown }>(request);
    if (typeof body.id !== 'string') throw new HttpError(400, 'User ID is missing.');
    if (body.id === admin.id && body.role !== undefined && role(body.role) !== 'admin') {
      throw new HttpError(400, 'You cannot remove administrator rights from yourself.');
    }
    if (body.id === admin.id && body.active === false) throw new HttpError(400, 'You cannot deactivate your own account.');
    const { data: current, error: currentError } = await db().from('profiles').select(`${PROFILE_COLUMNS}, deactivated_at`).eq('id', body.id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new HttpError(404, 'User not found.');
    if (current.deactivated_at && body.sendLink === true) {
      throw new HttpError(400, 'This account is deactivated. Reactivate it before sending an e-mail link.');
    }
    const changes: Partial<Profile> & { deactivated_at?: string | null } = {};
    if (body.role !== undefined) changes.role = role(body.role);
    if (typeof body.fullName === 'string') changes.full_name = body.fullName.trim().slice(0, 200) || null;
    if (body.apps !== undefined) {
      if (!Array.isArray(body.apps)) throw new HttpError(400, 'Invalid list of apps.');
      changes.apps = toApps(body.apps);
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD) {
        throw new HttpError(400, `The password must be at least ${MIN_PASSWORD} characters long.`);
      }
      const { error } = await db().auth.admin.updateUserById(body.id, { password: body.password });
      if (error) throw new HttpError(400, 'Could not change the password.');
      await logProfileEvent(body.id, admin.id, 'password');
    }
    if (typeof body.active === 'boolean' && body.active === Boolean(current.deactivated_at)) {
      const { error } = await db().auth.admin.updateUserById(body.id, { ban_duration: body.active ? 'none' : BAN_FOREVER });
      if (error) {
        logError('users.ban', error);
        throw new HttpError(500, body.active ? 'Could not reactivate the account.' : 'Could not deactivate the account.');
      }
      changes.deactivated_at = body.active ? null : new Date().toISOString();
    }
    if ('full_name' in changes) {
      // The other apps of the shared user base (e.g. HubSpot owner lookup) read the name from the account's metadata.
      const { error } = await db().auth.admin.updateUserById(body.id, { user_metadata: { full_name: changes.full_name } });
      if (error) throw new HttpError(400, 'Could not change the name.');
    }
    let sent: 'invite' | 'recovery' | undefined;
    if (body.sendLink === true) {
      const { data: found, error } = await db().auth.admin.getUserById(body.id);
      if (error || !found.user?.email) throw new HttpError(404, 'User not found.');
      const person = toProfile(current);
      // An unused invitation is sent again; anyone else gets a password-reset link.
      sent = accountStatus(found.user) === 'invited' ? 'invite' : 'recovery';
      const url = await issueAccountLink(sent, found.user.id, appUrl(request));
      await sendAccountMail({
        kind: sent,
        email: found.user.email,
        url,
        appUrl: appUrl(request),
        invitedBy: admin.full_name || admin.email,
        apps: person.role === 'admin' ? 'all' : person.apps,
      });
      await logProfileEvent(body.id, admin.id, 'link', { kind: sent });
    }
    const query = Object.keys(changes).length ? db().from('profiles').update(changes) : db().from('profiles').select();
    const { data, error } = await query.eq('id', body.id).select(PROFILE_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'User not found.');
    const before = toProfile(current);
    const after = toProfile(data);
    if (after.role !== before.role) await logProfileEvent(body.id, admin.id, 'role', { from: before.role, to: after.role });
    if (after.apps.join() !== before.apps.join()) await logProfileEvent(body.id, admin.id, 'apps', { from: before.apps, to: after.apps });
    if (after.full_name !== before.full_name) await logProfileEvent(body.id, admin.id, 'profile', { fields: ['name'] });
    if ('deactivated_at' in changes) await logProfileEvent(body.id, admin.id, changes.deactivated_at ? 'deactivated' : 'reactivated');
    return json({ user: after, sent });
  });
}

/**
 * Deletes an account. Only accounts without documents and without entries in any document's history: documents
 * are binding and their history must stay complete, so such accounts are kept (they can be given a new password or
 * left unused instead).
 */
export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const body = await readJson<{ id?: unknown }>(request);
    if (typeof body.id !== 'string') throw new HttpError(400, 'User ID is missing.');
    if (body.id === admin.id) throw new HttpError(400, 'You cannot delete your own account.');

    const { data: found, error: findError } = await db().auth.admin.getUserById(body.id);
    if (findError || !found.user) throw new HttpError(404, 'User not found.');
    const count = async (table: 'documents' | 'document_events', column: string) => {
      const { count: n, error } = await db().from(table).select('id', { count: 'exact', head: true }).eq(column, body.id);
      if (error) throw error;
      return n ?? 0;
    };
    const [documents, finalized, events] = await Promise.all([
      count('documents', 'owner_id'),
      count('documents', 'finalized_by'),
      count('document_events', 'actor_id'),
    ]);
    if (documents) throw new HttpError(409, `This account cannot be deleted: it has ${documents} document(s) in Document neutralizer. Documents and their history must be kept.`);
    if (finalized || events) throw new HttpError(409, 'This account cannot be deleted: it appears in the change history of documents, which must be kept.');

    // The profile and the account's e-mail links are deleted with the account (foreign keys with ON DELETE CASCADE).
    const { error } = await db().auth.admin.deleteUser(body.id);
    if (error) {
      logError('users.delete', error);
      throw new HttpError(500, 'Could not delete the account.');
    }
    console.info('[users] deleted', found.user.email, 'by', admin.email);
    return json({ deleted: found.user.email });
  });
}
