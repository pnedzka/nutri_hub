//   GET  /api/leave?year=YYYY  → LeaveOverview (shared/leaveApi.ts)
//   POST  /api/leave           body NewLeaveRequest → { request }
//   PATCH /api/leave           body LeaveDecision → { request }
//
// A request of one's own waits for the manager or an administrator (pending); an administrator entering leave for
// someone else saves it approved. The days are counted here, never taken from the browser.
//
// Decisions (PATCH): approve / reject a pending request, by the person's manager or an administrator, and the person
// gets an e-mail; cancel the person's own pending request, or any pending or approved leave by an administrator.

import {
  ADMIN_ONLY,
  datesProblem,
  formatDays,
  formatRange,
  isLeaveType,
  LEAVE_TYPE_NAMES,
  limitProblem,
  overlaps,
  workingDays,
  type LeaveType,
} from '../../shared/leave.js';
import type { LeaveDecision, LeaveOverview, NewLeaveRequest } from '../../shared/leaveApi.js';
import { requireApp } from '../_lib/auth.js';
import { appUrl, handle, HttpError, json, readJson } from '../_lib/http.js';
import { allSettings, approversOf, balances, canDecide, REQUEST_COLUMNS, todayInPoland, toRequestView } from '../_lib/leave.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { sendMail } from '../_lib/notify.js';
import { db } from '../_lib/supabase.js';

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'leave');
    const today = todayInPoland();
    const asked = Number(new URL(request.url).searchParams.get('year'));
    const year = Number.isInteger(asked) && asked >= 2020 && asked <= 2100 ? asked : Number(today.slice(0, 4));

    const [people, settings] = await Promise.all([appPeople('leave'), allSettings()]);
    const byId = new Map(people.map((p) => [p.id, p]));

    const [{ data: mine, error: mineError }, { data: pending, error: pendingError }] = await Promise.all([
      db()
        .from('leave_requests')
        .select(REQUEST_COLUMNS)
        .eq('user_id', viewer.id)
        .gte('start_date', `${year}-01-01`)
        .lte('start_date', `${year}-12-31`)
        .order('start_date', { ascending: false }),
      db().from('leave_requests').select(REQUEST_COLUMNS).eq('status', 'pending').order('start_date'),
    ]);
    if (mineError) throw mineError;
    if (pendingError) throw pendingError;

    const toDecide = (pending ?? []).filter((row) => canDecide(viewer, settings.get(String(row.user_id))));
    const balanceYears = new Map<number, string[]>();
    for (const row of toDecide) {
      const y = Number(String(row.start_date).slice(0, 4));
      balanceYears.set(y, [...new Set([...(balanceYears.get(y) ?? []), String(row.user_id)])]);
    }
    const own = await balances([viewer.id], year, settings);
    const others = new Map<string, Awaited<ReturnType<typeof balances>>>();
    for (const [y, ids] of balanceYears) others.set(String(y), await balances(ids, y, settings));

    const overview: LeaveOverview = {
      year,
      today,
      balance: own.get(viewer.id)!,
      requests: (mine ?? []).map((row) => toRequestView(row, byId)),
      approvals: toDecide.map((row) => ({
        request: toRequestView(row, byId),
        balance: others.get(String(row.start_date).slice(0, 4))!.get(String(row.user_id))!,
      })),
      isApprover: viewer.isAdmin || [...settings.values()].some((s) => s.managerId === viewer.id),
      isAdmin: viewer.isAdmin,
      people: viewer.isAdmin ? people.map(toPerson) : [],
    };
    return json(overview);
  });
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'leave');
    const body = await readJson<Partial<NewLeaveRequest>>(request);
    if (!isLeaveType(body.type)) throw new HttpError(400, 'Choose the type of leave.');
    const type = body.type;
    const start = String(body.start ?? '');
    const end = String(body.end ?? '');
    const halfDay = body.halfDay === true;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;

    const userId = typeof body.userId === 'string' && body.userId ? body.userId : viewer.id;
    const forSomeoneElse = userId !== viewer.id;
    if ((forSomeoneElse || ADMIN_ONLY.includes(type)) && !viewer.isAdmin) {
      throw new HttpError(403, forSomeoneElse ? 'Only administrators can enter leave for someone else.' : `${LEAVE_TYPE_NAMES[type]} is entered by an administrator.`);
    }

    const problem = datesProblem({ start, end, halfDay });
    if (problem) throw new HttpError(400, problem);
    const days = workingDays(start, end, halfDay);

    const [people, settings] = await Promise.all([appPeople('leave'), allSettings()]);
    const owner = people.find((p) => p.id === userId);
    if (!owner) throw new HttpError(404, 'This person has no access to Leave.');

    const { data: active, error: activeError } = await db()
      .from('leave_requests')
      .select('start_date, end_date')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved'])
      .lte('start_date', end)
      .gte('end_date', start);
    if (activeError) throw activeError;
    if ((active ?? []).some((r) => overlaps({ start, end }, { start: String(r.start_date), end: String(r.end_date) }))) {
      throw new HttpError(409, forSomeoneElse ? `${owner.name} already has leave on some of these days.` : 'You already have leave or a request on some of these days.');
    }

    const year = Number(start.slice(0, 4));
    const balance = (await balances([userId], year, settings)).get(userId)!;
    const limit = limitProblem(type, days, balance);
    if (limit) throw new HttpError(400, limit);

    const now = new Date().toISOString();
    const { data: row, error } = await db()
      .from('leave_requests')
      .insert({
        user_id: userId,
        type,
        start_date: start,
        end_date: end,
        half_day: halfDay,
        days,
        note,
        status: forSomeoneElse ? 'approved' : 'pending',
        created_by: viewer.id,
        ...(forSomeoneElse ? { decided_by: viewer.id, decided_at: now } : {}),
      })
      .select(REQUEST_COLUMNS)
      .single();
    if (error) throw error;

    if (!forSomeoneElse) {
      const approvers = approversOf(userId, settings.get(userId), people);
      await sendMail({
        to: approvers.map((p) => p.email),
        label: 'Leave request',
        subject: `Leave request: ${owner.name}, ${formatRange(start, end, halfDay)}`,
        paragraphs: ['Hello,', `${owner.name} has asked for leave. Approve or reject the request in the Nutri Partners apps.`],
        details: [
          ['Employee', owner.name],
          ['Type', LEAVE_TYPE_NAMES[type]],
          ['Dates', formatRange(start, end, halfDay)],
          ['Working days', formatDays(days)],
          ...(note ? ([['Note', note]] as [string, string][]) : []),
        ],
        button: { label: 'Review the request', url: `${appUrl(request)}/leave/approvals` },
      });
    }

    return json({ request: toRequestView(row, new Map(people.map((p) => [p.id, p]))) }, 201);
  });
}

const ACTIONS = ['approve', 'reject', 'cancel'] as const;

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'leave');
    const body = await readJson<Partial<LeaveDecision>>(request);
    const action = ACTIONS.find((a) => a === body.action);
    if (!action || typeof body.id !== 'string') throw new HttpError(400, 'Invalid request.');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;

    const { data: row, error } = await db().from('leave_requests').select(REQUEST_COLUMNS).eq('id', body.id).maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, 'This request no longer exists.');
    const ownerId = String(row.user_id);
    const settings = await allSettings();

    let status: 'approved' | 'rejected' | 'cancelled';
    if (action === 'cancel') {
      const own = ownerId === viewer.id && row.status === 'pending';
      const byAdmin = viewer.isAdmin && (row.status === 'pending' || row.status === 'approved');
      if (!own && !byAdmin) {
        throw new HttpError(403, row.status === 'pending' ? 'You cannot cancel this request.' : 'Only pending requests can be cancelled. Ask an administrator.');
      }
      status = 'cancelled';
    } else {
      if (!canDecide(viewer, settings.get(ownerId))) throw new HttpError(403, "Only the person's manager or an administrator can decide.");
      if (row.status !== 'pending') throw new HttpError(409, 'This request has already been decided or cancelled.');
      status = action === 'approve' ? 'approved' : 'rejected';
    }

    // Only if nothing changed it meanwhile (two approvers at once).
    const { data: updated, error: updateError } = await db()
      .from('leave_requests')
      .update({ status, decided_by: viewer.id, decided_at: new Date().toISOString(), decision_note: note })
      .eq('id', body.id)
      .eq('status', String(row.status))
      .select(REQUEST_COLUMNS)
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new HttpError(409, 'Someone else has just changed this request. Refresh the page.');

    const people = await appPeople('leave');
    const byId = new Map(people.map((p) => [p.id, p]));
    const owner = byId.get(ownerId);
    const decider = byId.get(viewer.id)?.name ?? viewer.email;
    if (owner && ownerId !== viewer.id && (status !== 'cancelled' || row.status === 'approved')) {
      const range = formatRange(String(row.start_date), String(row.end_date), Boolean(row.half_day));
      const word = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'cancelled';
      await sendMail({
        to: [owner.email],
        label: 'Leave',
        subject: `Your leave ${status === 'cancelled' ? 'was cancelled' : `request was ${word}`}: ${range}`,
        paragraphs: [
          'Hello,',
          status === 'cancelled' ? `${decider} has cancelled your approved leave.` : `${decider} has ${word} your leave request.`,
        ],
        details: [
          ['Type', LEAVE_TYPE_NAMES[row.type as LeaveType]],
          ['Dates', range],
          ['Working days', formatDays(Number(row.days))],
          ['Status', word[0].toUpperCase() + word.slice(1)],
          ...(note ? ([['Comment', note]] as [string, string][]) : []),
        ],
        button: { label: 'Open your leave', url: `${appUrl(request)}/leave` },
      });
    }

    return json({ request: toRequestView(updated, byId) });
  });
}
