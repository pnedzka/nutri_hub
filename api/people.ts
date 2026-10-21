// People of Nutri Partners: Team (everyone signed in), My profile and the list of offices.
//
//   GET    /api/people   → { people: TeamMember[], offices: Office[], me: string }
//   PATCH  /api/people   body ProfileInput & { id? } → { person: TeamMember }   (own profile; any profile: admins)
//   POST   /api/people   body { id? } → { path, token }   one-time upload link for a profile photo (JPEG)
//   PUT    /api/people   body { id?, name, address } → { offices: Office[] }   add or rename an office (admins)
//   DELETE /api/people   body { id } → { offices: Office[] }   remove an office; its people get none (admins)
//
// Deactivated accounts are left out of Team. One function for all of it: the Hobby plan allows 12 functions.

import { randomUUID } from 'node:crypto';
import { avatarPath, cleanOffice, isUuid, ProfileError, type Office, type ProfileInput } from '../shared/profile.js';
import { requireAdmin, requireUser, type Profile } from './_lib/auth.js';
import { handle, HttpError, json, readJson } from './_lib/http.js';
import { MEMBER_COLUMNS, saveProfile, signAvatars, toTeamMember } from './_lib/profiles.js';
import { db } from './_lib/supabase.js';

async function offices(): Promise<Office[]> {
  const { data, error } = await db().from('offices').select('id, name, address').order('name');
  if (error) throw error;
  return (data ?? []).map((o) => ({ id: String(o.id), name: String(o.name), address: String(o.address ?? '') }));
}

/** The account whose profile is changed: the person themselves, or anyone when an administrator asks. */
function target(viewer: Profile, id: unknown): string {
  if (id === undefined || id === viewer.id) return viewer.id;
  if (!isUuid(id)) throw new HttpError(400, 'User ID is invalid.');
  if (viewer.role !== 'admin') throw new HttpError(403, 'You can change only your own profile.');
  return id;
}

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireUser(request);
    const [{ data, error }, officeList] = await Promise.all([
      db().from('profiles').select(MEMBER_COLUMNS).is('deactivated_at', null),
      offices(),
    ]);
    if (error) throw error;
    const rows = data ?? [];
    const avatars = await signAvatars(rows.map((r) => r.avatar_path));
    const people = rows
      .map((row) => toTeamMember(row, avatars))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'pl'));
    return json({ people, offices: officeList, me: viewer.id });
  });
}

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireUser(request);
    const body = await readJson<ProfileInput & { id?: unknown }>(request);
    const id = target(viewer, body.id);
    return json({ person: await saveProfile(id, body, viewer.id) });
  });
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireUser(request);
    const body = await readJson<{ id?: unknown }>(request);
    const id = target(viewer, body.id);
    const path = avatarPath(id, randomUUID());
    const { data, error } = await db().storage.from('intranet').createSignedUploadUrl(path);
    if (error) throw error;
    return json({ path, token: data.token });
  });
}

const officeInput = (body: { name?: unknown; address?: unknown }) => {
  try {
    return cleanOffice(body);
  } catch (error) {
    if (error instanceof ProfileError) throw new HttpError(400, error.message);
    throw error;
  }
};

export function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const body = await readJson<{ id?: unknown; name?: unknown; address?: unknown }>(request);
    const office = officeInput(body);
    const query = body.id === undefined ? db().from('offices').insert(office) : isUuid(body.id) ? db().from('offices').update(office).eq('id', body.id) : null;
    if (!query) throw new HttpError(400, 'Office ID is invalid.');
    const { error } = await query;
    if (error) {
      if (error.code === '23505') throw new HttpError(400, `There is already an office called ${office.name}.`);
      throw error;
    }
    return json({ offices: await offices() });
  });
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const body = await readJson<{ id?: unknown }>(request);
    if (!isUuid(body.id)) throw new HttpError(400, 'Office ID is invalid.');
    // People of the office keep their accounts and get no office (on delete set null).
    const { error } = await db().from('offices').delete().eq('id', body.id);
    if (error) throw error;
    return json({ offices: await offices() });
  });
}
