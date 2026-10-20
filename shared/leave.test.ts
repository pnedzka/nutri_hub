import { describe, expect, it } from 'vitest';
import {
  datesProblem,
  easterSunday,
  formatDays,
  formatRange,
  leaveBalance,
  limitProblem,
  overlaps,
  polishHolidays,
  toIso,
  workingDays,
  type CountedRequest,
  type LeaveSettings,
} from './leave';

describe('polishHolidays', () => {
  it('finds Easter', () => {
    expect(toIso(easterSunday(2025))).toBe('2025-04-20');
    expect(toIso(easterSunday(2026))).toBe('2026-04-05');
    expect(toIso(easterSunday(2027))).toBe('2027-03-28');
  });

  it('lists the movable and fixed holidays of 2026', () => {
    const days = polishHolidays(2026);
    for (const day of ['2026-01-01', '2026-01-06', '2026-04-06', '2026-05-01', '2026-05-03', '2026-06-04', '2026-08-15', '2026-11-11', '2026-12-24', '2026-12-26']) {
      expect(days.has(day)).toBe(true);
    }
    expect(days.has('2026-04-07')).toBe(false);
  });

  it('adds Christmas Eve from 2025 only', () => {
    expect(polishHolidays(2024).has('2024-12-24')).toBe(false);
    expect(polishHolidays(2025).has('2025-12-24')).toBe(true);
  });
});

describe('workingDays', () => {
  it('skips weekends and public holidays', () => {
    // Mon 2 Nov – Fri 13 Nov 2026, with 11 November (Wednesday).
    expect(workingDays('2026-11-02', '2026-11-13')).toBe(9);
    // Easter week 2026: Easter Monday 6 April is a holiday.
    expect(workingDays('2026-04-06', '2026-04-10')).toBe(4);
  });

  it('counts half a day for a single working day', () => {
    expect(workingDays('2026-10-20', '2026-10-20', true)).toBe(0.5);
    expect(workingDays('2026-10-24', '2026-10-24', true)).toBe(0); // Saturday
  });
});

describe('datesProblem', () => {
  it('accepts a normal request', () => {
    expect(datesProblem({ start: '2026-10-20', end: '2026-10-23', halfDay: false })).toBeNull();
  });

  it('rejects bad dates', () => {
    expect(datesProblem({ start: '2026-10-23', end: '2026-10-20', halfDay: false })).toMatch('before the first');
    expect(datesProblem({ start: '2026-12-30', end: '2027-01-04', halfDay: false })).toMatch('one year');
    expect(datesProblem({ start: '2026-10-20', end: '2026-10-21', halfDay: true })).toMatch('single day');
    expect(datesProblem({ start: '2026-10-24', end: '2026-10-25', halfDay: false })).toMatch('no working days');
    expect(datesProblem({ start: '2026-02-30', end: '2026-03-02', halfDay: false })).toMatch('Choose');
  });
});

describe('leaveBalance', () => {
  const settings: LeaveSettings = { managerId: null, annualDays: 26, startYear: 2025, carriedOver: 4 };
  const req = (start: string, days: number, status: CountedRequest['status'] = 'approved', type: CountedRequest['type'] = 'vacation'): CountedRequest => ({
    type,
    start,
    days,
    status,
  });

  it('carries unused days over to the next year', () => {
    const balance = leaveBalance(2026, settings, { 2025: 20 }, [req('2025-07-01', 10), req('2025-08-01', 3, 'rejected')]);
    expect(balance).toMatchObject({ carriedOver: 14, allowance: 26, used: 0, pending: 0, available: 40 });
  });

  it('counts approved and pending annual leave and leave on demand, not other types', () => {
    const balance = leaveBalance(2026, settings, {}, [
      req('2026-03-02', 5),
      req('2026-05-04', 1, 'pending', 'on_demand'),
      req('2026-06-01', 2, 'approved', 'sick'),
      req('2026-06-08', 1, 'approved', 'childcare'),
      req('2026-07-01', 3, 'cancelled'),
    ]);
    expect(balance.used).toBe(5);
    expect(balance.pending).toBe(1);
    expect(balance.available).toBe(4 + 26 + 26 - 6);
    expect(balance.limited).toEqual({ on_demand: 1, childcare: 1 });
  });

  it('starts at the first tracked year', () => {
    expect(leaveBalance(2024, settings, {}, []).available).toBe(0);
    expect(leaveBalance(2025, settings, {}, []).available).toBe(30);
  });
});

describe('limitProblem', () => {
  const settings: LeaveSettings = { managerId: null, annualDays: 2, startYear: 2026, carriedOver: 0 };
  const balance = leaveBalance(2026, settings, {}, [{ type: 'childcare', start: '2026-02-02', days: 1.5, status: 'approved' }]);

  it('checks the yearly limits and the annual leave left', () => {
    expect(limitProblem('childcare', 1, balance)).toMatch('limited to 2 days a year; 0.5 days left');
    expect(limitProblem('childcare', 0.5, balance)).toBeNull();
    expect(limitProblem('vacation', 3, balance)).toMatch('Not enough annual leave: 2 days available');
    expect(limitProblem('unpaid', 30, balance)).toBeNull();
  });
});

describe('helpers', () => {
  it('formats days', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(0.5)).toBe('0.5 days');
    expect(formatDays(12)).toBe('12 days');
  });

  it('detects overlapping dates', () => {
    expect(overlaps({ start: '2026-01-05', end: '2026-01-09' }, { start: '2026-01-09', end: '2026-01-12' })).toBe(true);
    expect(overlaps({ start: '2026-01-05', end: '2026-01-09' }, { start: '2026-01-10', end: '2026-01-12' })).toBe(false);
  });
});

describe('formatRange', () => {
  it('writes single days and ranges', () => {
    expect(formatRange('2026-10-20', '2026-10-20', true)).toBe('20 Oct 2026 (half day)');
    expect(formatRange('2026-10-20', '2026-10-23')).toBe('20 Oct 2026 – 23 Oct 2026');
  });
});
