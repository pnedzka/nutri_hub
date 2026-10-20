//   GET /api/leave/employees → EmployeesResponse   (administrators)
//   PUT /api/leave/employees  body EmployeeSettingsUpdate → { ok: true }
//
// Each person's manager, yearly leave, first year tracked and the days carried over into it, plus the days granted
// for the current year. Everyone with access to Leave is listed; people never set up show the defaults.

import type { EmployeeRow, EmployeeSettingsUpdate, EmployeesResponse } from '../../shared/leaveApi.js';
import { requireApp } from '../_lib/auth.js';
import { handle, HttpError, json, readJson } from '../_lib/http.js';
import { allSettings, balances, defaultSettings, todayInPoland } from '../_lib/leave.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { db } from '../_lib/supabase.js';

async function requireAdmin(request: Request) {
  const viewer = await requireApp(request, 'leave');
  if (!viewer.isAdmin) throw new HttpError(403, 'Only administrators can manage leave settings.');
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
    const [people, settings] = await Promise.all([appPeople('leave'), allSettings()]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const all = new Map(people.map((p) => [p.id, settings.get(p.id) ?? defaultSettings(year)]));
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
        configured: settings.has(p.id),
        settings: s,
        manager: manager ? toPerson(manager) : null,
        balance: balanceById.get(p.id)!,
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
    const managerId = body.managerId ? String(body.managerId) : null;
    if (managerId === userId) throw new HttpError(400, 'A person cannot be their own manager.');
    if (managerId && !people.some((p) => p.id === managerId)) throw new HttpError(400, 'The manager must have access to Leave.');
    const annualDays = halfDays(body.annualDays, 60);
    const allowance = halfDays(body.allowance, 60);
    const carriedOver = halfDays(body.carriedOver, 999);
    const startYear = Number(body.startYear);
    if (annualDays === null || allowance === null) throw new HttpError(400, 'Days of leave: a number from 0 to 60, in half days.');
    if (carriedOver === null) throw new HttpError(400, 'Days carried over: a number from 0, in half days.');
    if (!Number.isInteger(startYear) || startYear < 2020 || startYear > year) throw new HttpError(400, `First year: 2020 to ${year}.`);

    const { error } = await db().from('leave_settings').upsert({
      user_id: userId,
      manager_id: managerId,
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
    return json({ ok: true });
  });
}
