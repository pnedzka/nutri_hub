// Sales contests (shared/contest.ts). Administrators manage them on /contests through api/admin/users.ts with
// ?resource=contests; the home page widget asks api/people.ts (?resource=dashboard&widget=contest). Both because the
// Hobby plan allows 12 functions and all are used.
//
//   GET    /api/admin/users?resource=contests          → { contests: (Contest & { status })[], people: ContestCandidate[] }
//   GET    /api/admin/users?resource=contests&id=<id>  → ContestResult (full ranking with values)
//   POST   /api/admin/users?resource=contests  body ContestInput & { id? } → { contest }   (create, or update with id)
//   DELETE /api/admin/users?resource=contests  body { id } → { deleted: id }
//
// The contracts come from the old intranet, as for the other sales widgets (api/_lib/dashboard.ts).

import { cleanContest, contestStatus, ContestInputError, nextDay, scoreContest, todayInPoland, type Contest, type ContestPerson, type ContestResult } from '../../shared/contest.js';
import { dayStart } from '../../shared/dashboard.js';
import { isUuid } from '../../shared/profile.js';
import { requireAdmin } from './auth.js';
import { contractsBetween } from './intranetContracts.js';
import { announceContest } from './contestNotices.js';
import { HttpError, appUrl, handle, json, readJson } from './http.js';
import { logError } from './monitoring.js';
import { signAvatars } from './profiles.js';
import { db } from './supabase.js';

export const isContestsRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'contests';

export interface ContestCandidate {
  id: string;
  name: string;
  department: string | null;
}

const COLUMNS = 'id, name, starts_on, ends_on, weight_count, prize, participant_ids, created_at';

function toContest(row: Record<string, unknown>): Contest {
  return {
    id: String(row.id),
    name: String(row.name),
    startsOn: String(row.starts_on),
    endsOn: String(row.ends_on),
    weightCount: Number(row.weight_count),
    prize: String(row.prize ?? ''),
    participantIds: (row.participant_ids as string[] | null) ?? [],
    createdAt: String(row.created_at),
  };
}

async function people(): Promise<(ContestPerson & { department: string | null })[]> {
  const { data, error } = await db().from('profiles').select('id, full_name, department, avatar_path').is('deactivated_at', null);
  if (error) throw error;
  const rows = (data ?? []).filter((r) => typeof r.full_name === 'string' && r.full_name.trim());
  const avatars = await signAvatars(rows.map((r) => r.avatar_path as string | null));
  return rows
    .map((r) => ({
      id: String(r.id),
      name: String(r.full_name).trim(),
      department: (r.department as string | null) || null,
      avatarUrl: (r.avatar_path && avatars.get(r.avatar_path as string)) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** The ranking of one contest, as the viewer may see it. */
export async function contestResult(contest: Contest, viewer: { id: string; isAdmin: boolean }): Promise<ContestResult> {
  const [everyone, rows] = await Promise.all([people(), contractsBetween(dayStart(contest.startsOn), dayStart(nextDay(contest.endsOn)))]);
  return scoreContest(contest, everyone, rows, todayInPoland(), viewer);
}

/** The contest running today that the viewer takes part in (administrators: any), or null. */
export async function activeContestFor(viewer: { id: string; isAdmin: boolean }): Promise<ContestResult | null> {
  const today = todayInPoland();
  const { data, error } = await db().from('contests').select(COLUMNS).lte('starts_on', today).gte('ends_on', today).order('ends_on');
  if (error) throw error;
  const contest = (data ?? []).map(toContest).find((c) => viewer.isAdmin || c.participantIds.includes(viewer.id));
  return contest ? contestResult(contest, viewer) : null;
}

export function contestsGet(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      if (!isUuid(id)) throw new HttpError(400, 'Contest ID is invalid.');
      const { data, error } = await db().from('contests').select(COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, 'This contest does not exist.');
      return json(await contestResult(toContest(data), { id: admin.id, isAdmin: true }));
    }
    const [{ data, error }, candidates] = await Promise.all([db().from('contests').select(COLUMNS).order('starts_on', { ascending: false }), people()]);
    if (error) throw error;
    const today = todayInPoland();
    return json({
      contests: (data ?? []).map(toContest).map((c) => ({ ...c, status: contestStatus(c, today) })),
      people: candidates.map(({ id, name, department }): ContestCandidate => ({ id, name, department })),
    });
  });
}

/** C1 to the people new in the contest; a failure here must not undo the saved contest. */
async function announce(request: Request, contest: Contest, before: string[], adminId: string): Promise<void> {
  try {
    await announceContest(appUrl(request), contest, before, adminId);
  } catch (error) {
    logError('contests.announce', error);
  }
}

/** Contests whose last day was in the 7 days before today (the daily run tells their results). */
export async function recentlyEnded(): Promise<Contest[]> {
  const today = todayInPoland();
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await db().from('contests').select(COLUMNS).gte('ends_on', weekAgo).lt('ends_on', today);
  if (error) throw error;
  return (data ?? []).map(toContest);
}

export function contestsPost(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const body = await readJson<Record<string, unknown>>(request);
    let input;
    try {
      input = cleanContest(body);
    } catch (error) {
      if (error instanceof ContestInputError) throw new HttpError(400, error.message);
      throw error;
    }
    const row = {
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      weight_count: input.weightCount,
      prize: input.prize,
      participant_ids: input.participantIds,
    };
    if (body.id !== undefined) {
      if (!isUuid(body.id)) throw new HttpError(400, 'Contest ID is invalid.');
      const { data: old, error: oldError } = await db().from('contests').select('participant_ids').eq('id', body.id).maybeSingle();
      if (oldError) throw oldError;
      const { data, error } = await db().from('contests').update({ ...row, updated_at: new Date().toISOString() }).eq('id', body.id).select(COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, 'This contest does not exist.');
      const contest = toContest(data);
      await announce(request, contest, (old?.participant_ids as string[] | null) ?? [], admin.id);
      return json({ contest });
    }
    const { data, error } = await db().from('contests').insert({ ...row, created_by: admin.id }).select(COLUMNS).single();
    if (error) throw error;
    const contest = toContest(data);
    await announce(request, contest, [], admin.id);
    return json({ contest }, 201);
  });
}

export function contestsDelete(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const body = await readJson<{ id?: unknown }>(request);
    if (!isUuid(body.id)) throw new HttpError(400, 'Contest ID is invalid.');
    const { error } = await db().from('contests').delete().eq('id', body.id);
    if (error) throw error;
    return json({ deleted: body.id });
  });
}
