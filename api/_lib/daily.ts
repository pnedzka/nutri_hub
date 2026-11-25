// The daily run (Vercel Cron, vercel.json → GET /api/daily, rewritten to api/sso.ts because of the 12-function limit).
// Reminders that depend on the date (README "Powiadomienia"): L9 a request waiting 2 working days, L10 people starting
// leave on the next working day; the morning look at the day in the bell (who is away, company events); C4 results of sales contests that have ended. Vercel calls it with "Authorization: Bearer $CRON_SECRET".

import { isAvailable, toApps } from '../../shared/access.js';
import { dayStart, seesCompanyCalendar, shiftDay } from '../../shared/dashboard.js';
import { formatRange, isWorkingDay, parseDate, toIso, type LeaveType } from '../../shared/leave.js';
import { finishContests } from './contestNotices.js';
import { morningDigest, type AwayToday, type DigestPerson } from './dayNotices.js';
import { calendarLeave, calendarConfig, listEvents, syncToCalendar } from './googleCalendar.js';
import { recentlyEnded } from './contests.js';
import { HttpError } from './http.js';
import { logError } from './monitoring.js';
import { allSettings, approversOf, mailedApprovers, todayInPoland, tripApprovers } from './leave.js';
import { requestWaiting, teamAwayNext, type LeaveFacts } from './leaveNotices.js';
import { notify } from './notifications.js';
import { appPeople } from './people.js';
import { db } from './supabase.js';

/** The working day after `day` (YYYY-MM-DD). */
export function nextWorkingDay(day: string): string {
  const date = parseDate(day)!;
  do date.setUTCDate(date.getUTCDate() + 1);
  while (!isWorkingDay(date));
  return toIso(date);
}

/** The day `n` working days before `day`. */
export function workingDaysBefore(day: string, n: number): string {
  const date = parseDate(day)!;
  let left = n;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    if (isWorkingDay(date)) left--;
  }
  return toIso(date);
}

const POLAND = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' });
/** The day (YYYY-MM-DD) of a timestamp in Poland. */
export const dayInPoland = (iso: string) => POLAND.format(new Date(iso));

/** Only Vercel Cron (or someone with the secret) may start the run. */
export function checkCron(request: Request): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Not allowed.');
}

const facts = (row: Record<string, unknown>): LeaveFacts => ({
  type: row.type as LeaveType,
  start: String(row.start_date),
  end: String(row.end_date),
  halfDay: Boolean(row.half_day),
  days: Number(row.days),
  note: (row.note as string | null) ?? null,
});

/**
 * The shared Google Calendar again (api/_lib/googleCalendar.ts): every approved leave that has not ended, and leave
 * cancelled in the last week. Repairs a failed call and, on the first run, copies the leave approved before.
 */
export async function resyncCalendar(baseUrl: string): Promise<number> {
  if (!calendarConfig()) return 0;
  const today = todayInPoland();
  const weekAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const columns = 'id, user_id, type, start_date, end_date, half_day, status';
  const [{ data: approved, error }, { data: cancelled, error: cancelledError }, people] = await Promise.all([
    db().from('leave_requests').select(columns).eq('status', 'approved').gte('end_date', today),
    db().from('leave_requests').select(columns).eq('status', 'cancelled').gte('decided_at', weekAgo),
    appPeople('leave'),
  ]);
  if (error) throw error;
  if (cancelledError) throw cancelledError;
  const names = new Map(people.map((p) => [p.id, p.name]));
  const rows = [...(approved ?? []), ...(cancelled ?? [])];
  const { synced } = await syncToCalendar(rows.map((row) => calendarLeave(row, names.get(String(row.user_id)) ?? 'Pracownik')), baseUrl);
  return synced;
}

/** The morning look at the day in the bell (dayNotices.ts): who is away today and today's company events. */
export async function sendDigests(baseUrl: string, today: string): Promise<number> {
  const leaveOn = isAvailable('leave', process.env.VITE_HUB_MODULES);
  const { data: profiles, error } = await db().from('profiles').select('id, email, full_name, role, apps, department').is('deactivated_at', null);
  if (error) throw error;
  const people: DigestPerson[] = (profiles ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email ?? ''),
    name: (row.full_name as string | null)?.trim() || String(row.email ?? ''),
    role: row.role === 'admin' ? 'admin' : 'user',
    apps: toApps(row.apps),
    department: (row.department as string | null) ?? null,
  }));
  const names = new Map(people.map((p) => [p.id, p.name]));
  let away: AwayToday[] = [];
  if (leaveOn) {
    const { data, error: leaveError } = await db().from('leave_requests').select('user_id, half_day').eq('status', 'approved').lte('start_date', today).gte('end_date', today);
    if (leaveError) throw leaveError;
    // One line per person (two half days on one day = one absence); only people who still have an account.
    const byPerson = new Map<string, AwayToday>();
    for (const row of data ?? []) {
      const id = String(row.user_id);
      if (!names.has(id)) continue;
      const halfDay = Boolean(row.half_day) && (byPerson.get(id)?.halfDay ?? true);
      byPerson.set(id, { userId: id, name: names.get(id)!, halfDay });
    }
    away = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }
  const events = people.some(seesCompanyCalendar)
    ? await listEvents(dayStart(today), dayStart(shiftDay(today, 1))).catch((e) => (logError('daily.digest', e), null))
    : null;
  let sent = 0;
  for (const person of people) {
    const notice = morningDigest(person, away, events, today, leaveOn);
    if (notice) {
      await notify(baseUrl, notice);
      sent++;
    }
  }
  return sent;
}

export async function runDaily(baseUrl: string): Promise<{ reminders: number; teamAway: number; contestsEnded: number; calendar: number; digests: number }> {
  // C4 every day (a contest can end on a Friday): results of contests that ended recently, once each.
  const contestsEnded = await recentlyEnded()
    .then((ended) => finishContests(baseUrl, ended))
    .catch((error) => (logError('daily.contests', error), 0));
  const calendar = await resyncCalendar(baseUrl).catch((error) => (logError('daily.calendar', error), 0));
  const today = todayInPoland();
  if (!isWorkingDay(parseDate(today)!)) return { reminders: 0, teamAway: 0, contestsEnded, calendar, digests: 0 };
  const digests = await sendDigests(baseUrl, today).catch((error) => (logError('daily.digest', error), 0));
  const [people, settings, trips] = await Promise.all([appPeople('leave'), allSettings(), tripApprovers()]);
  const byId = new Map(people.map((p) => [p.id, p]));

  // L9: sent exactly 2 working days ago (so each request is reminded once).
  const sentOn = workingDaysBefore(today, 2);
  const { data: pending, error } = await db().from('leave_requests').select('user_id, type, start_date, end_date, half_day, days, note, created_at').eq('status', 'pending');
  if (error) throw error;
  const waiting = (pending ?? []).filter((row) => dayInPoland(String(row.created_at)) === sentOn);
  let reminders = 0;
  for (const row of waiting) {
    const owner = byId.get(String(row.user_id));
    if (!owner) continue;
    const deciders = { type: String(row.type), tripApprovers: trips };
    const approvers = approversOf(owner.id, settings.get(owner.id), people, deciders);
    await notify(baseUrl, requestWaiting(facts(row), owner, approvers, mailedApprovers(approvers, settings.get(owner.id), deciders)));
    reminders++;
  }

  // L10: approved leave starting on the next working day, one notification per manager.
  const next = nextWorkingDay(today);
  const { data: starting, error: startError } = await db()
    .from('leave_requests')
    .select('user_id, start_date, end_date, half_day')
    .eq('status', 'approved')
    .gt('start_date', today)
    .lte('start_date', next);
  if (startError) throw startError;
  const byManager = new Map<string, { name: string; range: string }[]>();
  for (const row of starting ?? []) {
    const managerId = settings.get(String(row.user_id))?.managerId;
    const person = byId.get(String(row.user_id));
    if (!managerId || !person || !byId.has(managerId)) continue;
    byManager.set(managerId, [...(byManager.get(managerId) ?? []), { name: person.name, range: formatRange(String(row.start_date), String(row.end_date), Boolean(row.half_day)) }]);
  }
  for (const [managerId, away] of byManager) {
    const notice = teamAwayNext(byId.get(managerId)!, away, next);
    if (notice) await notify(baseUrl, notice);
  }
  return { reminders, teamAway: byManager.size, contestsEnded, calendar, digests };
}
