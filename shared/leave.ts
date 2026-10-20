// Leave rules shared by the server (which decides) and the browser (which previews): leave types, working days
// without Polish public holidays, balances and the checks on a request.

export const LEAVE_TYPES = ['vacation', 'on_demand', 'occasional', 'childcare', 'unpaid', 'sick'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_TYPE_NAMES: Record<LeaveType, string> = {
  vacation: 'Annual leave',
  on_demand: 'Leave on demand',
  occasional: 'Special leave',
  childcare: 'Childcare leave',
  unpaid: 'Unpaid leave',
  sick: 'Sick leave',
};

export const LEAVE_STATUS_NAMES: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** Types that use up annual leave. Leave on demand is part of annual leave (Kodeks pracy art. 167²). */
export const DEDUCTED: readonly LeaveType[] = ['vacation', 'on_demand'];
/** Days a year, for the types with a limit of their own. */
export const YEARLY_LIMITS: Partial<Record<LeaveType, number>> = { on_demand: 4, childcare: 2 };
/** Entered by administrators only (sick leave comes from a doctor's certificate). */
export const ADMIN_ONLY: readonly LeaveType[] = ['sick'];

export const isLeaveType = (value: unknown): value is LeaveType => typeof value === 'string' && (LEAVE_TYPES as readonly string[]).includes(value);

// Dates are ISO strings (YYYY-MM-DD), handled in UTC so no time zone shifts a day.

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || toIso(date) !== iso ? null : date;
}

export const toIso = (date: Date) => date.toISOString().slice(0, 10);

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Easter Sunday (Gregorian calendar, anonymous algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<number, Set<string>>();

/** Polish public holidays (ustawa o dniach wolnych od pracy), including Christmas Eve from 2025. */
export function polishHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const fixed = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-25', '12-26'];
  if (year >= 2025) fixed.push('12-24');
  const easter = easterSunday(year);
  const days = new Set([
    ...fixed.map((md) => `${year}-${md}`),
    toIso(easter),
    toIso(addDays(easter, 1)), // Easter Monday
    toIso(addDays(easter, 49)), // Pentecost (always a Sunday)
    toIso(addDays(easter, 60)), // Corpus Christi
  ]);
  holidayCache.set(year, days);
  return days;
}

export function isWorkingDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !polishHolidays(date.getUTCFullYear()).has(toIso(date));
}

/** Working days from start to end (inclusive); half a day when halfDay is set (one working day only). */
export function workingDays(start: string, end: string, halfDay = false): number {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to || to < from) return 0;
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) if (isWorkingDay(day)) count++;
  return halfDay && count === 1 ? 0.5 : count;
}

/** Every date from start to end (inclusive), for the calendar. */
export function eachDate(start: string, end: string): string[] {
  const from = parseDate(start);
  const to = parseDate(end);
  const dates: string[] = [];
  if (!from || !to) return dates;
  for (let day = from; day <= to; day = addDays(day, 1)) dates.push(toIso(day));
  return dates;
}

export interface LeaveRequestInput {
  type: LeaveType;
  start: string;
  end: string;
  halfDay: boolean;
}

/** What a request's dates need; null when they are fine. The days are counted by workingDays. */
export function datesProblem({ start, end, halfDay }: Omit<LeaveRequestInput, 'type'>): string | null {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to) return 'Choose the first and the last day.';
  if (to < from) return 'The last day is before the first day.';
  if (from.getUTCFullYear() !== to.getUTCFullYear()) return 'Leave must stay within one year. Split it into two requests at the turn of the year.';
  if (halfDay && start !== end) return 'Half a day is possible for a single day only.';
  if (workingDays(start, end) === 0) return 'These dates have no working days (weekends and public holidays are not counted).';
  return null;
}

/** A person's leave settings (leave_settings; defaults when an administrator has not set them). */
export interface LeaveSettings {
  managerId: string | null;
  annualDays: number;
  startYear: number;
  carriedOver: number;
}

export const DEFAULT_ANNUAL_DAYS = 26;

/** A request as the balance needs it. */
export interface CountedRequest {
  type: LeaveType;
  start: string;
  days: number;
  status: LeaveStatus;
}

export interface Balance {
  year: number;
  /** Days left over from earlier years (including the days carried over from before, the old intranet). */
  carriedOver: number;
  /** Days granted for this year. */
  allowance: number;
  /** Annual leave taken or approved this year. */
  used: number;
  /** Annual leave waiting for a decision this year. */
  pending: number;
  /** carriedOver + allowance − used − pending. */
  available: number;
  /** Days already used (approved + pending) this year of the types with their own limit. */
  limited: Partial<Record<LeaveType, number>>;
}

const yearOf = (iso: string) => Number(iso.slice(0, 4));
const active = (r: CountedRequest) => r.status === 'approved' || r.status === 'pending';

/**
 * Annual leave balance for a year. Unused days carry over to the next year without a limit (owner's decision).
 * allowances: days granted per year (missing years use settings.annualDays).
 */
export function leaveBalance(year: number, settings: LeaveSettings, allowances: Record<number, number>, requests: CountedRequest[]): Balance {
  const granted = (y: number) => allowances[y] ?? settings.annualDays;
  const deducted = requests.filter((r) => DEDUCTED.includes(r.type) && active(r) && yearOf(r.start) >= settings.startYear);
  let carriedOver = 0;
  if (year >= settings.startYear) {
    carriedOver = settings.carriedOver;
    for (let y = settings.startYear; y < year; y++) carriedOver += granted(y);
    carriedOver -= deducted.filter((r) => yearOf(r.start) < year).reduce((sum, r) => sum + r.days, 0);
  }
  const allowance = year >= settings.startYear ? granted(year) : 0;
  const thisYear = deducted.filter((r) => yearOf(r.start) === year);
  const used = thisYear.filter((r) => r.status === 'approved').reduce((sum, r) => sum + r.days, 0);
  const pending = thisYear.filter((r) => r.status === 'pending').reduce((sum, r) => sum + r.days, 0);
  const limited: Balance['limited'] = {};
  for (const type of Object.keys(YEARLY_LIMITS) as LeaveType[]) {
    limited[type] = requests.filter((r) => r.type === type && active(r) && yearOf(r.start) === year).reduce((sum, r) => sum + r.days, 0);
  }
  return { year, carriedOver, allowance, used, pending, available: carriedOver + allowance - used - pending, limited };
}

/** Why a new request of `days` days would break a limit; null when it fits. */
export function limitProblem(type: LeaveType, days: number, balance: Balance): string | null {
  const limit = YEARLY_LIMITS[type];
  if (limit !== undefined && (balance.limited[type] ?? 0) + days > limit) {
    const left = Math.max(0, limit - (balance.limited[type] ?? 0));
    return `${LEAVE_TYPE_NAMES[type]} is limited to ${formatDays(limit)} a year; ${formatDays(left)} left in ${balance.year}.`;
  }
  if (DEDUCTED.includes(type) && days > balance.available) {
    return `Not enough annual leave: ${formatDays(Math.max(0, balance.available))} available in ${balance.year}.`;
  }
  return null;
}

/** "1 day", "0.5 days", "2.5 days". */
export function formatDays(days: number): string {
  const value = Number.isInteger(days) ? String(days) : days.toFixed(1);
  return `${value} ${days === 1 ? 'day' : 'days'}`;
}

/** Two requests overlap when their date ranges share a day. */
export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end;

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "20 Oct 2026". */
export const formatDate = (iso: string) => DATE_FORMAT.format(new Date(`${iso}T00:00:00Z`));

/** "20 Oct 2026", "20 Oct 2026 (half day)" or "20 Oct 2026 – 23 Oct 2026". */
export function formatRange(start: string, end: string, halfDay = false): string {
  if (start === end) return `${formatDate(start)}${halfDay ? ' (half day)' : ''}`;
  return `${formatDate(start)} – ${formatDate(end)}`;
}
