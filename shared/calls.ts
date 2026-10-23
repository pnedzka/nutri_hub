// Rules of Phone calls analyser shared by the server (which decides) and the browser: matching invoice numbers to
// the employees' profiles, checking the parsed invoice the browser sends, and the KPIs of a person in a period.

import { ISO_DATE, parseDate, workingDays } from './leave.js';
import type { MatchedNumber, PersonCalls } from './callsApi.js';
import { USAGE_KINDS, type ParsedInvoice, type UsageKind, type UsageRow } from './tmobile.js';

export class CallsError extends Error {}

/** Limits of an invoice sent to the server (the largest real one: 20 numbers, ~200 rows). */
export const MAX_NUMBERS = 500;
export const MAX_ROWS = 5000;

/** The 9-digit national number of a phone as people type it ("+48 736 315 001", "736-315-001"); null if too short. */
export function msisdnOf(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

export interface NumberOwner {
  id: string;
  name: string;
  mobile: string | null;
}

/**
 * Who each number on the invoice belongs to, by the mobile number in the profiles. Numbers of no one are skipped
 * (only employees' numbers are tracked); a number in two profiles is ambiguous and skipped too.
 */
export function matchNumbers(numbers: string[], people: NumberOwner[]): { matched: MatchedNumber[]; skipped: string[]; ambiguous: string[] } {
  const owners = new Map<string, NumberOwner[]>();
  for (const person of people) {
    const msisdn = msisdnOf(person.mobile);
    if (msisdn) owners.set(msisdn, [...(owners.get(msisdn) ?? []), person]);
  }
  const matched: MatchedNumber[] = [];
  const skipped: string[] = [];
  const ambiguous: string[] = [];
  for (const msisdn of numbers) {
    const found = owners.get(msisdn) ?? [];
    if (found.length === 1) matched.push({ msisdn, profileId: found[0].id, name: found[0].name });
    else (found.length ? ambiguous : skipped).push(msisdn);
  }
  matched.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return { matched, skipped, ambiguous };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const MSISDN = /^\d{9}$/;
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000_000;
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 100_000_000;
const optional = (value: unknown, check: (v: unknown) => boolean) => value === null || check(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

/** The invoice the browser parsed, checked field by field (the server cannot see the PDF). */
export function validateInvoice(value: unknown): ParsedInvoice {
  if (!isObject(value)) throw new CallsError('The invoice data is missing.');
  const { invoiceNumber, customerNumber, periodStart, periodEnd, issueDate, numbers, usage } = value;
  if (typeof invoiceNumber !== 'string' || !/^\d{6,20}$/.test(invoiceNumber)) throw new CallsError('The invoice number is invalid.');
  if (!optional(customerNumber, (v) => typeof v === 'string' && /^[\d.]{1,30}$/.test(v))) throw new CallsError('The customer number is invalid.');
  for (const date of [periodStart, periodEnd, issueDate]) {
    if (typeof date !== 'string' || !ISO_DATE.test(date) || !parseDate(date)) throw new CallsError('A date of the invoice is invalid.');
  }
  if ((periodEnd as string) < (periodStart as string)) throw new CallsError('The billing period ends before it starts.');
  if (!Array.isArray(numbers) || numbers.length > MAX_NUMBERS || !numbers.every((n) => typeof n === 'string' && MSISDN.test(n))) {
    throw new CallsError('The list of phone numbers is invalid.');
  }
  if (new Set(numbers).size !== numbers.length) throw new CallsError('A phone number is listed twice.');
  if (!Array.isArray(usage) || usage.length > MAX_ROWS) throw new CallsError('The usage data is invalid.');
  const keys = new Set<string>();
  const rows: UsageRow[] = usage.map((row, index) => {
    const problem = `Usage row ${index + 1} is invalid.`;
    if (!isObject(row)) throw new CallsError(problem);
    const valid =
      typeof row.msisdn === 'string' &&
      numbers.includes(row.msisdn) &&
      (USAGE_KINDS as readonly unknown[]).includes(row.kind) &&
      text(row.category, 200) &&
      optional(row.roamingOperator, (v) => text(v, 200)) &&
      isCount(row.eventCount) &&
      optional(row.durationS, isCount) &&
      optional(row.dataMb, isAmount) &&
      optional(row.paidDurationS, isCount) &&
      optional(row.paidDataMb, isAmount) &&
      optional(row.paidCount, isCount) &&
      isAmount(row.netAmount);
    if (!valid) throw new CallsError(problem);
    const key = `${row.msisdn}|${row.category}|${row.roamingOperator ?? ''}`;
    if (keys.has(key)) throw new CallsError(`Usage row ${index + 1} repeats a category of the same number.`);
    keys.add(key);
    return {
      msisdn: row.msisdn as string,
      kind: row.kind as UsageKind,
      category: row.category as string,
      roamingOperator: (row.roamingOperator as string | null) ?? null,
      eventCount: row.eventCount as number,
      durationS: row.durationS as number | null,
      dataMb: row.dataMb as number | null,
      paidDurationS: row.paidDurationS as number | null,
      paidDataMb: row.paidDataMb as number | null,
      paidCount: row.paidCount as number | null,
      netAmount: row.netAmount as number,
    };
  });
  return {
    invoiceNumber,
    customerNumber: (customerNumber as string | null | undefined) ?? null,
    periodStart: periodStart as string,
    periodEnd: periodEnd as string,
    issueDate: issueDate as string,
    numbers: [...(numbers as string[])].sort(),
    usage: rows,
  };
}

/**
 * Outgoing calls left out of the KPIs (owner's decision of 23.10.2026): "Połączenia inne" are not calls to people
 * (e.g. voicemail or service numbers). Their cost still counts.
 */
export const NOT_COUNTED: readonly string[] = ['Połączenia inne'];

/** Whether a usage row is an outgoing call the KPIs count: domestic (except NOT_COUNTED) or made abroad. */
export const isCountedCall = (row: { kind: UsageKind; category: string }) =>
  row.kind === 'voice_out_roaming' || (row.kind === 'voice_out' && !NOT_COUNTED.includes(row.category));

/** Where an outgoing domestic call went, from the invoice's category. */
export function callTarget(category: string): 'mobile' | 'landline' | 'international' | 'other' {
  if (category === 'Połączenia do sieci stacjonarnych') return 'landline';
  if (category === 'Połączenia międzynarodowe') return 'international';
  if (category.startsWith('Połączenia do')) return 'mobile';
  return 'other';
}

/** Working days of approved leave within the period (half a day counts 0.5). */
export function leaveDaysIn(leave: { start: string; end: string; halfDay: boolean }[], periodStart: string, periodEnd: string): number {
  let days = 0;
  for (const entry of leave) {
    const start = entry.start > periodStart ? entry.start : periodStart;
    const end = entry.end < periodEnd ? entry.end : periodEnd;
    if (start > end) continue;
    const count = workingDays(start, end);
    days += entry.halfDay ? Math.min(count, 0.5) : count;
  }
  return days;
}

/** A usage row as the report needs it. */
export interface KpiRow {
  kind: UsageKind;
  category: string;
  eventCount: number;
  durationS: number | null;
  dataMb: number | null;
  netAmount: number;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * KPIs of one person in one period, as in the owner's report (build_local.py): outgoing calls are domestic calls and
 * calls made abroad, without NOT_COUNTED; the average per day is over the working days of the period minus the
 * person's leave.
 */
export function personCalls(
  person: { profileId: string; name: string; jobTitle: string | null; msisdn: string },
  rows: KpiRow[],
  periodWorkingDays: number,
  leaveDays: number,
): PersonCalls {
  const result: PersonCalls = {
    ...person,
    calls: 0,
    seconds: 0,
    averageSeconds: null,
    mobile: 0,
    landline: 0,
    international: 0,
    roaming: 0,
    other: 0,
    sms: 0,
    dataMb: 0,
    costNet: 0,
    leaveDays,
    callsPerDay: null,
  };
  for (const row of rows) {
    result.costNet += row.netAmount;
    if (isCountedCall(row)) {
      result.calls += row.eventCount;
      result.seconds += row.durationS ?? 0;
      result[row.kind === 'voice_out' ? callTarget(row.category) : 'roaming'] += row.eventCount;
    } else if (row.kind === 'sms' || row.kind === 'sms_roaming') result.sms += row.eventCount;
    else if (row.kind === 'data' || row.kind === 'data_roaming') result.dataMb += row.dataMb ?? 0;
  }
  result.averageSeconds = result.calls ? Math.round(result.seconds / result.calls) : null;
  result.dataMb = round(result.dataMb, 3);
  result.costNet = round(result.costNet, 2);
  const days = periodWorkingDays - leaveDays;
  result.callsPerDay = days > 0 ? round(result.calls / days, 2) : null;
  return result;
}
