//   GET /api/leave/calendar?month=YYYY-MM → CalendarResponse (shared/leaveApi.ts)
//
// Everyone sees who is away (approved leave) without the type; the person, their manager and administrators also
// see the type and the pending requests.

import { eachDate, polishHolidays, type LeaveType } from '../../shared/leave.js';
import type { CalendarEntry, CalendarResponse } from '../../shared/leaveApi.js';
import { requireApp } from '../_lib/auth.js';
import { handle, HttpError, json } from '../_lib/http.js';
import { allSettings, seesType, todayInPoland } from '../_lib/leave.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { db } from '../_lib/supabase.js';

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'leave');
    const today = todayInPoland();
    const month = new URL(request.url).searchParams.get('month') ?? today.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Invalid month.');
    const [year, monthNumber] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;

    const [people, settings, { data, error }] = await Promise.all([
      appPeople('leave'),
      allSettings(),
      db()
        .from('leave_requests')
        .select('user_id, type, start_date, end_date, half_day, status')
        .in('status', ['approved', 'pending'])
        .lte('start_date', last)
        .gte('end_date', first),
    ]);
    if (error) throw error;

    const entries: CalendarEntry[] = [];
    for (const row of data ?? []) {
      const ownerId = String(row.user_id);
      const detailed = seesType(viewer, ownerId, settings.get(ownerId));
      if (row.status === 'pending' && !detailed) continue;
      entries.push({
        personId: ownerId,
        start: String(row.start_date),
        end: String(row.end_date),
        halfDay: Boolean(row.half_day),
        status: row.status as CalendarEntry['status'],
        type: detailed ? (row.type as LeaveType) : null,
      });
    }

    const holidays = eachDate(first, last).filter((d) => polishHolidays(year).has(d));
    const response: CalendarResponse = { month, today, people: people.map(toPerson), entries, holidays };
    return json(response);
  });
}
