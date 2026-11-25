//   GET /api/leave/employees → EmployeesResponse   (administrators and Leave administration, leave-admin)
//   PUT /api/leave/employees  body EmployeeSettingsUpdate → { ok: true }
//
// Each person's yearly leave, first year tracked and the days carried over into it, plus the days granted
// for the current year, the manager (read only: set in User management, profiles.manager_id), and whether the person approves everyone's business trips (besides the manager and the
// administrators). Everyone with access to Leave is listed; people never set up show the defaults.

import type { EmployeeRow, EmployeeSettingsUpdate, EmployeesResponse } from '../../shared/leaveApi.js';
import { requireApp } from '../_lib/auth.js';
import { appUrl, handle, HttpError, json, readJson } from '../_lib/http.js';
import { allSettings, balances, isSaved, managesLeave, settingsFor, todayInPoland, tripApprovers } from '../_lib/leave.js';
import { settingsChanged } from '../_lib/leaveNotices.js';
import { notify } from '../_lib/notifications.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { db } from '../_lib/supabase.js';

async function requireAdmin(request: Request) {
  const viewer = await requireApp(request, 'leave');
  if (!managesLeave(viewer)) throw new HttpError(403, 'Only administrators and Leave administration can manage leave settings.');
  return viewer;
}

const halfDays = (value: unknown, max: number): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max && Number.isInteger(n * 2) ? n : null;
};

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const year = Number(todayInPoland().slice(0, 4));
    const [people, settings, trips] = await Promise.all([appPeople('leave'), allSettings(), tripApprovers()]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const all = new Map(people.map((p) => [p.id, settingsFor(settings.get(p.id), year)]));
    const balanceById = await balances(
      people.map((p) => p.id),
      year,
      all,
    );
    const employees: EmployeeRow[] = people.map((p) => {
      const s = all.get(p.id)!;
      const manager = s.managerId ? byId.get(s.managerId) : undefined;
      return {
        person: toPerson(p),
        isAdmin: p.isAdmin,
        managesLeave: managesLeave(p),
        configured: isSaved(settings.get(p.id)),
        settings: s,
        manager: manager ? toPerson(manager) : null,
        balance: balanceById.get(p.id)!,
        approvesTrips: trips.has(p.id),
      };
    });
    const response: EmployeesResponse = { year, employees };
    return json(response);
  });
}

export function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireAdmin(request);
    const body = await readJson<Partial<EmployeeSettingsUpdate>>(request);
    const year = Number(todayInPoland().slice(0, 4));
    const people = await appPeople('leave');
    const userId = String(body.userId ?? '');
    if (!people.some((p) => p.id === userId)) throw new HttpError(404, 'This person has no access to Leave.');
    const annualDays = halfDays(body.annualDays, 60);
    const allowance = halfDays(body.allowance, 60);
    const carriedOver = halfDays(body.carriedOver, 999);
    const startYear = Number(body.startYear);
    if (annualDays === null || allowance === null) throw new HttpError(400, 'Days of leave: a number from 0 to 60, in half days.');
    if (carriedOver === null) throw new HttpError(400, 'Days carried over: a number from 0, in half days.');
    if (!Number.isInteger(startYear) || startYear < 2020 || startYear > year) throw new HttpError(400, `First year: 2020 to ${year}.`);

    const [before, { data: allowanceRow, error: readError }, trips] = await Promise.all([
      allSettings().then((all) => settingsFor(all.get(userId), year)),
      db().from('leave_allowances').select('days').eq('user_id', userId).eq('year', year).maybeSingle(),
      tripApprovers(),
    ]);
    if (readError) throw readError;
    const beforeAllowance = allowanceRow ? Number(allowanceRow.days) : before.annualDays;

    const { error } = await db().from('leave_settings').upsert({
      user_id: userId,
      annual_days: annualDays,
      start_year: startYear,
      carried_over: carriedOver,
      updated_at: new Date().toISOString(),
      updated_by: viewer.id,
    });
    if (error) throw error;
    // Years before the first one tracked no longer count; the current year gets the days given.
    const { error: cleanError } = await db().from('leave_allowances').delete().eq('user_id', userId).lt('year', startYear);
    if (cleanError) throw cleanError;
    const { error: allowanceError } = await db().from('leave_allowances').upsert({ user_id: userId, year, days: allowance }, { onConflict: 'user_id,year' });
    if (allowanceError) throw allowanceError;
    const approvesTrips = typeof body.approvesTrips === 'boolean' ? body.approvesTrips : trips.has(userId);
    if (approvesTrips !== trips.has(userId)) {
      const { error: tripError } = approvesTrips
        ? await db().from('leave_trip_approvers').upsert({ user_id: userId, added_by: viewer.id })
        : await db().from('leave_trip_approvers').delete().eq('user_id', userId);
      if (tripError) throw tripError;
    }

    // L11: the person learns what changed (README "Powiadomienia").
    const changes = [
      ...(before.annualDays !== annualDays ? [`Days of leave a year: ${annualDays}`] : []),
      ...(before.carriedOver !== carriedOver || before.startYear !== startYear ? [`Days carried over into ${startYear}: ${carriedOver}`] : []),
      ...(beforeAllowance !== allowance && before.annualDays === annualDays ? [`Days for ${year}: ${allowance}`] : []),
      ...(approvesTrips !== trips.has(userId) ? [approvesTrips ? "You now approve everyone's business trips" : "You no longer approve everyone's business trips"] : []),
    ];
    const owner = people.find((p) => p.id === userId)!;
    const admin = people.find((p) => p.id === viewer.id) ?? { id: viewer.id, email: viewer.email, name: viewer.email };
    for (const notice of settingsChanged(owner, admin, changes)) await notify(appUrl(request), notice);
    return json({ ok: true });
  });
}
