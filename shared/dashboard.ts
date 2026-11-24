// The hub's home page: a dashboard of widgets. Who sees which widget, the months they show and the sums behind the
// sales widgets. Shared by the page (what to show) and the server (what to send): the server checks again and never
// sends a widget's data to someone who may not see it.

import { canUse, type Role } from './access.js';

export type WidgetId = 'news' | 'contracts' | 'leaderboard' | 'contest' | 'calendar';

/** Departments of `profiles.department` that the widgets look at (set in User management and My profile). */
export const BOARD = 'Board';
export const TRADE = 'Trade';
export const ADMINISTRATION = 'Administration';

export interface Viewer {
  role: Role;
  apps: readonly string[];
  department: string | null;
}

const isIn = (department: string | null, ...names: string[]) => !!department && names.some((n) => n.toLowerCase() === department.trim().toLowerCase());

/**
 * Who sees a widget (decisions of 23.11.2026):
 * - news: people with News;
 * - contracts (the company's contracts and turnover in EUR): administrators, Board and Administration;
 * - leaderboard: administrators and the sales side, as in the old intranet (Admin, Sales Rep, Sales Support): Trade,
 *   Administration and Board;
 * - contest: everyone may ask; the server answers only with a contest the person takes part in (administrators: any);
 * - calendar (decision of 24.11.2026): people with Leave see who is away and the public holidays (moduleAvailable =
 *   Leave is on); administrators, Board and Administration also see the events of the company's Google Calendar
 *   (seesCompanyCalendar), which holds private entries too (doctor's visits, training), so nobody else sees them.
 */
export function canSeeWidget(viewer: Viewer, widget: WidgetId, moduleAvailable = true): boolean {
  if (widget === 'news') return moduleAvailable && canUse(viewer, 'news');
  if (widget === 'calendar') return (moduleAvailable && canUse(viewer, 'leave')) || seesCompanyCalendar(viewer);
  if (widget === 'contest') return true;
  if (viewer.role === 'admin') return true;
  if (widget === 'contracts') return isIn(viewer.department, BOARD, ADMINISTRATION);
  return isIn(viewer.department, TRADE, ADMINISTRATION, BOARD);
}

/** Sees the events of the company's Google Calendar in the calendar widget. */
export const seesCompanyCalendar = (viewer: Viewer) => viewer.role === 'admin' || isIn(viewer.department, BOARD, ADMINISTRATION);

// ── Months ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** "2026-11" for a date, in Polish time (a contract made at 00:30 on 1 December belongs to December). */
export function monthOf(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

export const isMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** The month before or after ("2026-01", -1 → "2025-12"). */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Midnight in Warsaw at the start of a day (YYYY-MM-DD), as an ISO time. */
export function dayStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  // Warsaw is UTC+1 in winter and UTC+2 in summer; take the offset that this day has there (at noon).
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const local = new Date(probe.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
  const utc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMinutes = Math.round((local.getTime() - utc.getTime()) / 60000);
  return new Date(Date.UTC(y, m - 1, d) - offsetMinutes * 60000).toISOString();
}

/** "2026-11-24" for a date, in Polish time. */
export function dayOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** The day before or after ("2026-11-30", 1 → "2026-12-01"). */
export function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** Midnight in Warsaw on the first day of the month, as an ISO time (the start of a month's range). */
export const monthStart = (month: string) => dayStart(`${month}-01`);

/** "November 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
}

// ── Contracts ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** One contract of the old intranet, as dashboard_api.intranet_contracts returns it (db/central/dashboard_api.sql). */
export interface ContractRow {
  contract_id: string;
  contract_type: string | null;
  status: string | null;
  owner_name: string | null;
  created_at: string;
  value_eur: number | string | null;
}

export interface ContractTotals {
  count: number;
  /** Sum in EUR of the contracts whose value could be converted. */
  eur: number;
}

export interface ContractsSummary {
  month: string;
  sales: ContractTotals;
  purchases: ContractTotals;
  /** Waiting for approval in the intranet (Pending, Pending Assignment). */
  pending: number;
  /** Contracts left out of the EUR sums (a currency without a rate). */
  withoutEur: number;
  previous: { month: string; sales: ContractTotals; purchases: ContractTotals };
}

const PENDING = ['pending', 'pending assignment'];

function totals(rows: ContractRow[], type: 'S' | 'P'): ContractTotals {
  const of = rows.filter((r) => r.contract_type === type);
  const eur = of.reduce((sum, r) => sum + (r.value_eur === null ? 0 : Number(r.value_eur) || 0), 0);
  return { count: of.length, eur: Math.round(eur) };
}

/** The widget "Contracts this month": counts and EUR turnover of sales (S) and purchases (P). */
export function summarize(month: string, rows: ContractRow[], previousRows: ContractRow[]): ContractsSummary {
  return {
    month,
    sales: totals(rows, 'S'),
    purchases: totals(rows, 'P'),
    pending: rows.filter((r) => PENDING.includes((r.status ?? '').toLowerCase())).length,
    withoutEur: rows.filter((r) => r.value_eur === null).length,
    previous: { month: shiftMonth(month, -1), sales: totals(previousRows, 'S'), purchases: totals(previousRows, 'P') },
  };
}

// ── Sales leaderboard ──────────────────────────────────────────────────────────────────────────────────────────────

export interface LeaderboardPerson {
  id: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
}

export interface LeaderboardEntry extends LeaderboardPerson {
  contracts: number;
}

export interface Leaderboard {
  month: string;
  entries: LeaderboardEntry[];
}

const nameKey = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Who takes part: active people of Trade, and anyone else with a contract that month, except the Board (the old
 * intranet left out the management and the office by name). Contracts count by their owner's name, as the
 * intranet stores it; owners without an account in the hub are left out, as in the intranet.
 */
export function isParticipant(person: Pick<LeaderboardPerson, 'department'>, contracts: number): boolean {
  if (isIn(person.department, BOARD)) return false;
  return contracts > 0 || isIn(person.department, TRADE);
}

/**
 * The ranking as in the old intranet: every contract that is not cancelled (sales and purchases), most contracts
 * first, then by name. Administrators see everyone; others see the people with contracts and always the top three.
 * (The intranet meant the same but picked "the top three" before sorting, so people saw three random colleagues.)
 */
export function rank(people: LeaderboardPerson[], rows: ContractRow[], viewerIsAdmin: boolean, month: string): Leaderboard {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.owner_name) continue;
    const key = nameKey(row.owner_name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = people
    .map((p) => ({ ...p, contracts: counts.get(nameKey(p.name)) ?? 0 }))
    .filter((e) => isParticipant(e, e.contracts))
    .sort((a, b) => b.contracts - a.contracts || a.name.localeCompare(b.name, 'pl'));
  return { month, entries: viewerIsAdmin ? entries : entries.filter((e, index) => e.contracts > 0 || index < 3) };
}

// ── Calendar ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** How many days the calendar widget shows at a time. */
export const CALENDAR_DAYS = 7;

/**
 * One entry of the calendar widget:
 * - event: from the company's Google Calendar (title, time, place; no description, attendees or links);
 * - absence: approved leave from Leave (title = the person; detail = the type for those who may see it, else "Absent");
 * - holiday: a Polish public holiday.
 */
export interface CalendarItem {
  id: string;
  kind: 'event' | 'absence' | 'holiday';
  title: string;
  detail: string | null;
  /** All-day entries: YYYY-MM-DD and the day after the last day (as Google keeps them); others: ISO times. */
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
}

export interface CalendarWeek {
  from: string;
  /**
   * The company's Google Calendar: 'on', 'off' (not set up, e.g. in Preview: GOOGLE_CALENDAR_ID,
   * GOOGLE_SERVICE_ACCOUNT), 'error' (Google did not answer) or null (this person does not see it).
   */
  google: 'on' | 'off' | 'error' | null;
  items: CalendarItem[];
}

const KIND_ORDER: Record<CalendarItem['kind'], number> = { holiday: 0, absence: 1, event: 2 };
const startTime = (item: CalendarItem) => new Date(item.allDay ? `${item.start}T00:00:00Z` : item.start).getTime();

/** The days from `from` with their entries (one lasting several days is on each of them): holidays, all-day, by time. */
export function calendarDays(from: string, items: CalendarItem[], days = CALENDAR_DAYS): { day: string; items: CalendarItem[] }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = shiftDay(from, i);
    const begins = new Date(dayStart(day)).getTime();
    const ends = new Date(dayStart(shiftDay(day, 1))).getTime();
    const on = items
      .filter((e) => (e.allDay ? e.start <= day && day < e.end : new Date(e.start).getTime() < ends && new Date(e.end).getTime() > begins))
      .sort((a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Number(b.allDay) - Number(a.allDay) || startTime(a) - startTime(b) || a.title.localeCompare(b.title, 'pl'));
    return { day, items: on };
  });
}
