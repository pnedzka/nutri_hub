// Leave data on the server. The tables have RLS with no policies; this module reads and writes them with the secret
// key (db()) and every endpoint checks the signed-in person first (requireApp). Who may do what is decided here.

import {
  DEFAULT_ANNUAL_DAYS,
  leaveBalance,
  type Balance,
  type CountedRequest,
  type LeaveSettings,
  type LeaveStatus,
  type LeaveType,
} from '../../shared/leave.js';
import type { LeaveRequestView } from '../../shared/leaveApi.js';
import type { AppUser } from './auth.js';
import { personOf, type PersonRow } from './people.js';
import { db } from './supabase.js';

/** Today in Poland (YYYY-MM-DD). */
export const todayInPoland = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());

export function defaultSettings(year: number): LeaveSettings {
  return { managerId: null, annualDays: DEFAULT_ANNUAL_DAYS, startYear: year, carriedOver: 0 };
}

const toSettings = (row: Record<string, unknown>): LeaveSettings => ({
  managerId: (row.manager_id as string | null) ?? null,
  annualDays: Number(row.annual_days),
  startYear: Number(row.start_year),
  carriedOver: Number(row.carried_over),
});

/** Saved settings by person (people without a row use defaultSettings). */
export async function allSettings(): Promise<Map<string, LeaveSettings>> {
  const { data, error } = await db().from('leave_settings').select('user_id, manager_id, annual_days, start_year, carried_over');
  if (error) throw error;
  return new Map((data ?? []).map((row) => [String(row.user_id), toSettings(row)]));
}

/** Writes the yearly allowance for every year from the start year to `year` that has none yet. */
async function ensureAllowances(userId: string, settings: LeaveSettings, year: number): Promise<void> {
  if (year < settings.startYear) return;
  const rows = [];
  for (let y = settings.startYear; y <= year; y++) rows.push({ user_id: userId, year: y, days: settings.annualDays });
  const { error } = await db().from('leave_allowances').upsert(rows, { onConflict: 'user_id,year', ignoreDuplicates: true });
  if (error) throw error;
}

/** Annual leave balances for some people in a year. */
export async function balances(userIds: string[], year: number, settingsById: Map<string, LeaveSettings>): Promise<Map<string, Balance>> {
  const result = new Map<string, Balance>();
  if (!userIds.length) return result;
  for (const id of userIds) await ensureAllowances(id, settingsById.get(id) ?? defaultSettings(year), year);
  const [{ data: allowanceRows, error: allowanceError }, { data: requestRows, error: requestError }] = await Promise.all([
    db().from('leave_allowances').select('user_id, year, days').in('user_id', userIds).lte('year', year),
    db()
      .from('leave_requests')
      .select('user_id, type, start_date, days, status')
      .in('user_id', userIds)
      .in('status', ['approved', 'pending'])
      .lte('start_date', `${year}-12-31`),
  ]);
  if (allowanceError) throw allowanceError;
  if (requestError) throw requestError;
  for (const id of userIds) {
    const allowances: Record<number, number> = {};
    for (const row of allowanceRows ?? []) if (row.user_id === id) allowances[Number(row.year)] = Number(row.days);
    const requests: CountedRequest[] = (requestRows ?? [])
      .filter((row) => row.user_id === id)
      .map((row) => ({ type: row.type as LeaveType, start: String(row.start_date), days: Number(row.days), status: row.status as LeaveStatus }));
    result.set(id, leaveBalance(year, settingsById.get(id) ?? defaultSettings(year), allowances, requests));
  }
  return result;
}

export const REQUEST_COLUMNS =
  'id, user_id, type, start_date, end_date, half_day, days, status, note, created_at, created_by, decided_by, decided_at, decision_note';

export type RequestRow = Record<string, unknown>;

/** A request for the browser; people are looked up by id (unknown ids: someone who no longer has access). */
export function toRequestView(row: RequestRow, people: Map<string, PersonRow>): LeaveRequestView {
  const person = (id: unknown) => personOf(people, id);
  const userId = String(row.user_id);
  return {
    id: String(row.id),
    person: person(userId)!,
    type: row.type as LeaveType,
    start: String(row.start_date),
    end: String(row.end_date),
    halfDay: Boolean(row.half_day),
    days: Number(row.days),
    status: row.status as LeaveStatus,
    note: (row.note as string | null) ?? null,
    createdAt: String(row.created_at),
    enteredBy: row.created_by && row.created_by !== userId ? person(row.created_by) : null,
    decidedBy: person(row.decided_by),
    decidedAt: (row.decided_at as string | null) ?? null,
    decisionNote: (row.decision_note as string | null) ?? null,
  };
}

/** Approves or rejects this person's requests: their manager, or any administrator. */
export function canDecide(viewer: AppUser, ownerSettings: LeaveSettings | undefined): boolean {
  return viewer.isAdmin || (ownerSettings?.managerId ?? null) === viewer.id;
}

/** Sees the type of this person's leave (the calendar shows others only as absent). */
export function seesType(viewer: AppUser, ownerId: string, ownerSettings: LeaveSettings | undefined): boolean {
  return viewer.id === ownerId || canDecide(viewer, ownerSettings);
}

/** The people who decide on this person's requests (their manager and the administrators), without the person. */
export function approversOf(ownerId: string, ownerSettings: LeaveSettings | undefined, people: PersonRow[]): PersonRow[] {
  return people.filter((p) => p.id !== ownerId && (p.isAdmin || p.id === ownerSettings?.managerId));
}
