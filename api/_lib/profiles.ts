// Profiles on the server: the contact details of accounts (My profile, Team, User management), their photos in the
// private "intranet" bucket and the history of changes (profile_events). Only this server writes them.

import { isAvatarPathOf, profileChanges, ProfileError, type ProfileInput, type TeamMember } from '../../shared/profile.js';
import { HttpError } from './http.js';
import { logError } from './monitoring.js';
import { db } from './supabase.js';

const BUCKET = 'intranet';
const AVATAR_LINK_SECONDS = 24 * 60 * 60;

/** Contact columns of profiles (besides id, email and full_name). */
export const CONTACT_COLUMNS = 'job_title, department, phone, mobile, linkedin_url, office_id, avatar_path';
/** Columns of profiles behind a TeamMember. */
export const MEMBER_COLUMNS = `id, email, full_name, ${CONTACT_COLUMNS}` as const;

/** Signed links to photos (one day), by path; photos that cannot be signed are left out. */
export async function signAvatars(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!unique.length) return new Map();
  const { data, error } = await db().storage.from(BUCKET).createSignedUrls(unique, AVATAR_LINK_SECONDS);
  if (error) {
    // A missing photo must not hide the people: show initials instead.
    logError('profiles.signAvatars', error);
    return new Map();
  }
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}

const str = (value: unknown) => (typeof value === 'string' && value ? value : null);

export function toTeamMember(row: Record<string, unknown>, avatars: Map<string, string>): TeamMember {
  const path = str(row.avatar_path);
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    name: str(row.full_name)?.trim() || null,
    jobTitle: str(row.job_title),
    department: str(row.department),
    phone: str(row.phone),
    mobile: str(row.mobile),
    linkedin: str(row.linkedin_url),
    officeId: str(row.office_id),
    avatarUrl: path ? (avatars.get(path) ?? null) : null,
  };
}

/** Adds an entry to the account's history; a failure is logged and does not stop the change itself. */
export async function logProfileEvent(profileId: string, actorId: string | null, action: string, details: Record<string, unknown> = {}) {
  const { error } = await db().from('profile_events').insert({ profile_id: profileId, actor_id: actorId, action, details });
  if (error) logError('profiles.event', error, { action });
}

/** Deletes photos from storage (a failure is logged: a leftover file does no harm). */
async function removeAvatars(paths: string[]) {
  if (!paths.length) return;
  const { error } = await db().storage.from(BUCKET).remove(paths);
  if (error) logError('profiles.removeAvatars', error);
}

const FIELD_LABELS: Record<string, string> = {
  full_name: 'name',
  job_title: 'job title',
  department: 'department',
  phone: 'phone',
  mobile: 'mobile',
  linkedin_url: 'LinkedIn',
  office_id: 'office',
  avatar_path: 'photo',
};

/**
 * Saves the contact details of `targetId` (checked by the caller: the person themselves or an administrator) and
 * notes the change in the history. Returns the profile as Team shows it.
 */
export async function saveProfile(targetId: string, input: ProfileInput, actorId: string): Promise<TeamMember> {
  let changes: Record<string, string | null>;
  try {
    changes = profileChanges(input);
  } catch (error) {
    if (error instanceof ProfileError) throw new HttpError(400, error.message);
    throw error;
  }
  const { data: before, error: readError } = await db().from('profiles').select(MEMBER_COLUMNS).eq('id', targetId).maybeSingle();
  if (readError) throw readError;
  if (!before) throw new HttpError(404, 'User not found.');

  if (input.avatarPath !== undefined) {
    if (input.avatarPath !== null && (typeof input.avatarPath !== 'string' || !isAvatarPathOf(targetId, input.avatarPath))) {
      throw new HttpError(400, 'The photo could not be saved. Add it again.');
    }
    changes.avatar_path = input.avatarPath;
  }
  if (changes.office_id) {
    const { data: office, error } = await db().from('offices').select('id').eq('id', changes.office_id).maybeSingle();
    if (error) throw error;
    if (!office) throw new HttpError(400, 'This office no longer exists. Choose another one.');
  }
  const changed = Object.keys(changes).filter((key) => (before as Record<string, unknown>)[key] !== changes[key]);
  if (!changed.length) return toTeamMember(before, await signAvatars([before.avatar_path]));

  const { data: row, error } = await db()
    .from('profiles')
    .update(Object.fromEntries(changed.map((key) => [key, changes[key]])))
    .eq('id', targetId)
    .select(MEMBER_COLUMNS)
    .single();
  if (error) throw error;
  if (changed.includes('full_name')) {
    // The other apps of the shared user base (e.g. HubSpot owner lookup) read the name from the account's metadata.
    const { error: metaError } = await db().auth.admin.updateUserById(targetId, { user_metadata: { full_name: changes.full_name } });
    if (metaError) logError('profiles.metadata', metaError);
  }
  if (changed.includes('avatar_path') && before.avatar_path) await removeAvatars([before.avatar_path]);
  await logProfileEvent(targetId, actorId, 'profile', { fields: changed.map((key) => FIELD_LABELS[key] ?? key) });
  return toTeamMember(row, await signAvatars([row.avatar_path]));
}
