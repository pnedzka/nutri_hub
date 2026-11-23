// The widgets of the hub's home page that need the server: "Contracts this month" and "Sales leaderboard".
// Served by api/people.ts with ?resource=dashboard (the Hobby plan allows 12 functions and all are used):
//
//   GET /api/people?resource=dashboard&widget=contracts&month=YYYY-MM   → ContractsSummary   (shared/dashboard.ts)
//   GET /api/people?resource=dashboard&widget=leaderboard&month=YYYY-MM → Leaderboard
//   GET /api/people?resource=dashboard&widget=contest                   → { result: ContestResult | null } (shared/contest.ts)
//
// Who sees which widget is decided by canSeeWidget (shared/dashboard.ts) from the person's role and department; a
// widget the person may not see answers 403 without data. The contracts are those of the old intranet, read from the
// central database (dashboard_api.intranet_contracts, db/central/dashboard_api.sql). Only sums and counts leave the
// server: no clients, no single contracts.

import {
  canSeeWidget,
  isMonth,
  monthOf,
  monthStart,
  rank,
  shiftMonth,
  summarize,
  type LeaderboardPerson,
  type WidgetId,
} from '../../shared/dashboard.js';
import { requireUser } from './auth.js';
import { activeContestFor } from './contests.js';
import { contractsBetween } from './intranetContracts.js';
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

export function dashboardGet(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireUser(request);
    const params = new URL(request.url).searchParams;
    const widget = params.get('widget') as WidgetId | null;
    // The contest running today that the person takes part in (administrators: any), or null.
    if (widget === 'contest') return json({ result: await activeContestFor({ id: viewer.id, isAdmin: viewer.role === 'admin' }) });
    if (widget !== 'contracts' && widget !== 'leaderboard') throw new HttpError(400, 'Unknown widget.');
    const month = params.get('month') || monthOf(new Date());
    if (!isMonth(month)) throw new HttpError(400, 'The month is invalid (expected YYYY-MM).');
    if (month > monthOf(new Date())) throw new HttpError(400, 'This month has not started yet.');

    const { data: me, error } = await db().from('profiles').select('department').eq('id', viewer.id).maybeSingle();
    if (error) throw error;
    const department = (me?.department as string | null) ?? null;
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
