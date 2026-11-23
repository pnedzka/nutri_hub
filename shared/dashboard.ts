// The hub's home page: a dashboard of widgets. Who sees which widget, the months they show and the sums behind the
// sales widgets. Shared by the page (what to show) and the server (what to send): the server checks again and never
// sends a widget's data to someone who may not see it.

import { canUse, type Role } from './access.js';

export type WidgetId = 'news' | 'contracts' | 'leaderboard' | 'contest';

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
 * - contest: everyone may ask; the server answers only with a contest the person takes part in (administrators: any).
 */
export function canSeeWidget(viewer: Viewer, widget: WidgetId, newsAvailable = true): boolean {
  if (widget === 'news') return newsAvailable && canUse(viewer, 'news');
  if (widget === 'contest') return true;
  if (viewer.role === 'admin') return true;
  if (widget === 'contracts') return isIn(viewer.department, BOARD, ADMINISTRATION);
  return isIn(viewer.department, TRADE, ADMINISTRATION, BOARD);
}

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
