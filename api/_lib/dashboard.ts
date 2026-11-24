// The widgets of the hub's home page that need the server: "Contracts this month" and "Sales leaderboard".
// Served by api/people.ts with ?resource=dashboard (the Hobby plan allows 12 functions and all are used):
//
//   GET /api/people?resource=dashboard&widget=contracts&month=YYYY-MM   → ContractsSummary   (shared/dashboard.ts)
//   GET /api/people?resource=dashboard&widget=leaderboard&month=YYYY-MM → Leaderboard
//   GET /api/people?resource=dashboard&widget=contest                   → { result: ContestResult | null } (shared/contest.ts)
//   GET /api/people?resource=dashboard&widget=calendar&from=YYYY-MM-DD  → CalendarWeek (7 days from `from`, default today)
//
// Who sees which widget is decided by canSeeWidget (shared/dashboard.ts) from the person's role and department; a
// widget the person may not see answers 403 without data. The contracts are those of the old intranet, read from the
// central database (dashboard_api.intranet_contracts, db/central/dashboard_api.sql). Only sums and counts leave the
// server: no clients, no single contracts.

import { canUse, isAvailable } from '../../shared/access.js';
import {
  CALENDAR_DAYS,
  canSeeWidget,
  dayOf,
  dayStart,
  isDay,
  seesCompanyCalendar,
  shiftDay,
  type CalendarItem,
  type CalendarWeek,
  type Viewer,
  isMonth,
  monthOf,
  monthStart,
  rank,
  shiftMonth,
  summarize,
  type LeaderboardPerson,
  type WidgetId,
} from '../../shared/dashboard.js';
import { eachDate, holidayName, LEAVE_TYPE_NAMES, type LeaveType } from '../../shared/leave.js';
import { requireUser } from './auth.js';
import { activeContestFor } from './contests.js';
import { listEvents } from './googleCalendar.js';
import { contractsBetween } from './intranetContracts.js';
import { allSettings, seesType, tripApprovers } from './leave.js';
import { logError } from './monitoring.js';
import { HttpError, handle, json } from './http.js';
import { signAvatars } from './profiles.js';
import { db } from './supabase.js';

export const isDashboardRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'dashboard';

const contracts = (month: string) => contractsBetween(monthStart(month), monthStart(shiftMonth(month, 1)));

/** Active people of the hub with what the leaderboard shows of them. */
async function people(): Promise<LeaderboardPerson[]> {
  const { data, error } = await db().from('profiles').select('id, email, full_name, department, job_title, avatar_path').is('deactivated_at', null);
  if (error) throw error;
  const rows = data ?? [];
  const avatars = await signAvatars(rows.map((r) => r.avatar_path as string | null));
  return rows
    .filter((r) => typeof r.full_name === 'string' && r.full_name.trim())
    .map((r) => ({
      id: String(r.id),
      name: String(r.full_name).trim(),
      department: (r.department as string | null) || null,
      jobTitle: (r.job_title as string | null) || null,
      avatarUrl: (r.avatar_path && avatars.get(r.avatar_path as string)) || null,
    }));
}

async function departmentOf(id: string): Promise<string | null> {
  const { data, error } = await db().from('profiles').select('department').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data?.department as string | null) ?? null;
}

const leaveOn = () => isAvailable('leave', process.env.VITE_HUB_MODULES);

/** Approved leave in the days, as the widget shows it: the type only to those who see it in Leave, else "Absent". */
async function absences(viewer: { id: string; isAdmin: boolean }, from: string, to: string): Promise<CalendarItem[]> {
  const [{ data, error }, settings, trips] = await Promise.all([
    db().from('leave_requests').select('id, user_id, type, start_date, end_date, half_day').eq('status', 'approved').lte('start_date', to).gte('end_date', from),
    allSettings(),
    tripApprovers(),
  ]);
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => String(r.user_id)))];
  const { data: people, error: peopleError } = await db().from('profiles').select('id, full_name, email').in('id', ids);
  if (peopleError) throw peopleError;
  const names = new Map((people ?? []).map((p) => [String(p.id), (p.full_name as string | null)?.trim() || String(p.email ?? 'Former user')]));
  return rows.map((r) => {
    const owner = String(r.user_id);
    const detailed = seesType({ id: viewer.id, email: '', name: null, isAdmin: viewer.isAdmin }, owner, settings.get(owner), { type: String(r.type), tripApprovers: trips });
    const what = detailed ? LEAVE_TYPE_NAMES[r.type as LeaveType] ?? 'Absent' : 'Absent';
    return {
      id: `leave-${r.id}`,
      kind: 'absence' as const,
      title: names.get(owner) ?? 'Former user',
      detail: r.half_day ? `${what} (half day)` : what,
      start: String(r.start_date),
      end: shiftDay(String(r.end_date), 1),
      allDay: true,
      location: null,
    };
  });
}

/** The calendar widget: holidays, who is away (people with Leave) and the company calendar (seesCompanyCalendar). */
async function calendarWeek(viewer: Viewer & { id: string }, from: string): Promise<CalendarWeek> {
  const to = shiftDay(from, CALENDAR_DAYS - 1);
  const holidays: CalendarItem[] = eachDate(from, to).flatMap((day) => {
    const name = holidayName(day);
    return name ? [{ id: `holiday-${day}`, kind: 'holiday' as const, title: name, detail: null, start: day, end: shiftDay(day, 1), allDay: true, location: null }] : [];
  });
  const seesLeave = leaveOn() && canUse(viewer, 'leave');
  const [away, google] = await Promise.all([
    seesLeave ? absences({ id: viewer.id, isAdmin: viewer.role === 'admin' }, from, to) : Promise.resolve([]),
    seesCompanyCalendar(viewer)
      ? listEvents(dayStart(from), dayStart(shiftDay(to, 1))).then(
          (rows) => ({ state: rows ? ('on' as const) : ('off' as const), rows: rows ?? [] }),
          (error) => {
            logError('dashboard.calendar', error);
            return { state: 'error' as const, rows: [] };
          },
        )
      : Promise.resolve(null),
  ]);
  const events: CalendarItem[] = (google?.rows ?? []).map((e) => ({ ...e, id: `event-${e.id}`, kind: 'event' as const, detail: null }));
  return { from, google: google?.state ?? null, items: [...holidays, ...away, ...events] };
}

export function dashboardGet(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireUser(request);
    const params = new URL(request.url).searchParams;
    const widget = params.get('widget') as WidgetId | null;
    // The contest running today that the person takes part in (administrators: any), or null.
    if (widget === 'contest') return json({ result: await activeContestFor({ id: viewer.id, isAdmin: viewer.role === 'admin' }) });
    if (widget === 'calendar') {
      const from = params.get('from') || dayOf(new Date());
      if (!isDay(from)) throw new HttpError(400, 'The day is invalid (expected YYYY-MM-DD).');
      const department = await departmentOf(viewer.id);
      const who = { id: viewer.id, role: viewer.role, apps: viewer.apps, department };
      if (!canSeeWidget(who, 'calendar', leaveOn())) throw new HttpError(403, 'This widget is not available to you.');
      return json(await calendarWeek(who, from));
    }
    if (widget !== 'contracts' && widget !== 'leaderboard') throw new HttpError(400, 'Unknown widget.');
    const month = params.get('month') || monthOf(new Date());
    if (!isMonth(month)) throw new HttpError(400, 'The month is invalid (expected YYYY-MM).');
    if (month > monthOf(new Date())) throw new HttpError(400, 'This month has not started yet.');

    const department = await departmentOf(viewer.id);
    if (!canSeeWidget({ role: viewer.role, apps: viewer.apps, department }, widget)) {
      throw new HttpError(403, 'This widget is not available to you.');
    }

    if (widget === 'contracts') {
      const [rows, previous] = await Promise.all([contracts(month), contracts(shiftMonth(month, -1))]);
      return json(summarize(month, rows, previous));
    }
    const [rows, everyone] = await Promise.all([contracts(month), people()]);
    return json(rank(everyone, rows, viewer.role === 'admin', month));
  });
}
