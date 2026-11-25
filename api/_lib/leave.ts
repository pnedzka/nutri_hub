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
  const [{ data, error }, managers] = await Promise.all([
    db().from('leave_settings').select('user_id, annual_days, start_year, carried_over'),
    allManagers(),
  ]);
  if (error) throw error;
  const settings = new Map((data ?? []).map((row) => [String(row.user_id), { ...toSettings(row), managerId: managers.get(String(row.user_id)) ?? null }]));
  // Someone with a manager but no leave settings yet: the defaults (of the year asked, see settingsFor), with the manager.
  const year = Number(todayInPoland().slice(0, 4));
  for (const [userId, managerId] of managers) {
    if (settings.has(userId)) continue;
    const entry = { ...defaultSettings(year), managerId };
    UNSAVED.add(entry);
    settings.set(userId, entry);
  }
  return settings;
}

/** Entries of allSettings() that only carry the manager: no leave settings were saved for the person. */
const UNSAVED = new WeakSet<LeaveSettings>();

/** Leave settings were saved for the person in Leave → Employees (otherwise the defaults apply). */
export const isSaved = (settings: LeaveSettings | undefined): boolean => Boolean(settings) && !UNSAVED.has(settings!);

/** The settings that count for a year: the saved ones, or the defaults of that year with the person's manager. */
export function settingsFor(settings: LeaveSettings | undefined, year: number): LeaveSettings {
  return settings && isSaved(settings) ? settings : { ...defaultSettings(year), managerId: settings?.managerId ?? null };
}

/** Everyone's manager (profiles.manager_id, set in User management), by person. */
async function allManagers(): Promise<Map<string, string>> {
  const { data, error } = await db().from('profiles').select('id, manager_id').not('manager_id', 'is', null);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [String(row.id), String(row.manager_id)]));
}

/**
 * Writes the yearly allowance for every year from the start year to `year` that has none yet, but never for a year
 * that has not started: until then the balance uses `annualDays`, so a later change of it still applies there.
 */
async function ensureAllowances(userId: string, settings: LeaveSettings, year: number): Promise<void> {
  const last = Math.min(year, Number(todayInPoland().slice(0, 4)));
  if (last < settings.startYear) return;
  const rows = [];
  for (let y = settings.startYear; y <= last; y++) rows.push({ user_id: userId, year: y, days: settings.annualDays });
  const { error } = await db().from('leave_allowances').upsert(rows, { onConflict: 'user_id,year', ignoreDuplicates: true });
  if (error) throw error;
}

/** Annual leave balances for some people in a year. */
export async function balances(userIds: string[], year: number, settingsById: Map<string, LeaveSettings>): Promise<Map<string, Balance>> {
  const result = new Map<string, Balance>();
  if (!userIds.length) return result;
  for (const id of userIds) await ensureAllowances(id, settingsFor(settingsById.get(id), year), year);
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
    result.set(id, leaveBalance(year, settingsFor(settingsById.get(id), year), allowances, requests));
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

/** People who approve everyone's business trips (Leave → Employees, table leave_trip_approvers). */
export async function tripApprovers(): Promise<Set<string>> {
  const { data, error } = await db().from('leave_trip_approvers').select('user_id');
  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.user_id)));
}

/** What a decision depends on besides the person: the request's type and the business trip approvers. */
export interface Deciders {
  type?: string;
  tripApprovers?: ReadonlySet<string>;
}

const approvesTrip = (id: string, { type, tripApprovers }: Deciders) => type === 'business_trip' && Boolean(tripApprovers?.has(id));

/**
 * Approves or rejects this person's requests: their manager, any administrator, and for a business trip also the
 * business trip approvers (decision of 24.11.2026).
 */
export function canDecide(viewer: AppUser, ownerSettings: LeaveSettings | undefined, deciders: Deciders = {}): boolean {
  return viewer.isAdmin || (ownerSettings?.managerId ?? null) === viewer.id || approvesTrip(viewer.id, deciders);
}

/** Sees the type of this person's leave (the calendar shows others only as absent). */
export function seesType(viewer: AppUser, ownerId: string, ownerSettings: LeaveSettings | undefined, deciders: Deciders = {}): boolean {
  return viewer.id === ownerId || canDecide(viewer, ownerSettings, deciders);
}

/**
 * Who of the approvers gets the e-mail (decision of 25.11.2026): the manager and, for a business trip, the business
 * trip approvers. Administrators get only the bell, unless nobody else decides (the person has no manager).
 */
export function mailedApprovers(approvers: readonly PersonRow[], ownerSettings: LeaveSettings | undefined, deciders: Deciders = {}): string[] {
  const direct = approvers.filter((p) => p.id === ownerSettings?.managerId || approvesTrip(p.id, deciders));
  return (direct.length ? direct : approvers).map((p) => p.id);
}

/** The people who decide on this person's requests (as canDecide), without the person. */
export function approversOf(ownerId: string, ownerSettings: LeaveSettings | undefined, people: PersonRow[], deciders: Deciders = {}): PersonRow[] {
  return people.filter((p) => p.id !== ownerId && (p.isAdmin || p.id === ownerSettings?.managerId || approvesTrip(p.id, deciders)));
}
