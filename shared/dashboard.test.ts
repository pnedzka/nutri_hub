import { describe, expect, it } from 'vitest';
import { canSeeWidget, isMonth, monthLabel, monthOf, monthStart, rank, shiftMonth, summarize, type ContractRow, type LeaderboardPerson } from './dashboard';

const viewer = (role: 'admin' | 'user', department: string | null, apps: string[] = []) => ({ role, department, apps });

describe('canSeeWidget', () => {
  it('shows the company contracts to administrators, Board and Administration only', () => {
    expect(canSeeWidget(viewer('admin', null), 'contracts')).toBe(true);
    expect(canSeeWidget(viewer('user', 'Board'), 'contracts')).toBe(true);
    expect(canSeeWidget(viewer('user', 'administration'), 'contracts')).toBe(true);
    expect(canSeeWidget(viewer('user', 'Trade'), 'contracts')).toBe(false);
    expect(canSeeWidget(viewer('user', null), 'contracts')).toBe(false);
  });

  it('shows the leaderboard to the sales side, as the intranet did', () => {
    expect(canSeeWidget(viewer('user', 'Trade'), 'leaderboard')).toBe(true);
    expect(canSeeWidget(viewer('user', 'Administration'), 'leaderboard')).toBe(true);
    expect(canSeeWidget(viewer('user', 'Board'), 'leaderboard')).toBe(true);
    expect(canSeeWidget(viewer('user', 'Logistics'), 'leaderboard')).toBe(false);
    expect(canSeeWidget(viewer('user', null), 'leaderboard')).toBe(false);
  });

  it('shows news to people with News, where the module is on', () => {
    expect(canSeeWidget(viewer('user', null, ['news']), 'news')).toBe(true);
    expect(canSeeWidget(viewer('user', 'Trade'), 'news')).toBe(false);
    expect(canSeeWidget(viewer('admin', null), 'news', false)).toBe(false);
  });
});

describe('months', () => {
  it('reads the month in Polish time', () => {
    expect(monthOf(new Date('2026-11-30T23:30:00Z'))).toBe('2026-12');
    expect(monthOf(new Date('2026-07-31T21:59:00Z'))).toBe('2026-07');
  });

  it('moves between months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });

  it('starts a month at midnight in Warsaw, in winter and in summer', () => {
    expect(monthStart('2026-11')).toBe('2026-10-31T23:00:00.000Z');
    expect(monthStart('2026-07')).toBe('2026-06-30T22:00:00.000Z');
  });

  it('checks and names months', () => {
    expect(isMonth('2026-11')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
    expect(monthLabel('2026-11')).toBe('November 2026');
  });
});

const row = (over: Partial<ContractRow>): ContractRow => ({
  contract_id: 'x',
  contract_type: 'S',
  status: 'Approved',
  owner_name: 'Anna Nowak',
  created_at: '2026-11-03T10:00:00Z',
  value_eur: 1000,
  ...over,
});

describe('summarize', () => {
  it('counts sales and purchases, sums EUR and compares with the month before', () => {
    const now = [
      row({ value_eur: '1200.40' }),
      row({ value_eur: 800 }),
      row({ contract_type: 'P', status: 'Pending', value_eur: 500 }),
      row({ contract_type: 'P', status: 'Pending Assignment', value_eur: null }),
    ];
    const before = [row({}), row({ contract_type: 'P' })];
    expect(summarize('2026-11', now, before)).toEqual({
      month: '2026-11',
      sales: { count: 2, eur: 2000 },
      purchases: { count: 2, eur: 500 },
      pending: 2,
      withoutEur: 1,
      previous: { month: '2026-10', sales: { count: 1, eur: 1000 }, purchases: { count: 1, eur: 1000 } },
    });
  });
});

describe('rank', () => {
  const person = (id: string, name: string, department: string | null): LeaderboardPerson => ({ id, name, department, jobTitle: null, avatarUrl: null });
  const people = [
    person('1', 'Anna Nowak', 'Trade'),
    person('2', 'Jan Kowalski', 'Trade'),
    person('3', 'Ewa Zając', 'Trade'),
    person('4', 'Piotr Lis', 'Trade'),
    person('5', 'Kacper Prezes', 'Board'),
    person('6', 'Ola Biuro', 'Administration'),
    person('7', 'Marek Logistyka', null),
  ];
  const rows = [
    row({ owner_name: 'Jan Kowalski' }),
    row({ owner_name: 'jan  kowalski ', contract_type: 'P' }),
    row({ owner_name: 'Anna Nowak' }),
    row({ owner_name: 'Kacper Prezes' }),
    row({ owner_name: 'Marek Logistyka' }),
    row({ owner_name: 'Someone Without Account' }),
  ];

  it('counts sales and purchase contracts by owner, most first, then by name; the Board is left out', () => {
    const board = rank(people, rows, true, '2026-11');
    expect(board.entries.map((e) => [e.name, e.contracts])).toEqual([
      ['Jan Kowalski', 2],
      ['Anna Nowak', 1],
      ['Marek Logistyka', 1],
      ['Ewa Zając', 0],
      ['Piotr Lis', 0],
    ]);
  });

  it('shows others the people with contracts and always the top three', () => {
    const few = [row({ owner_name: 'Piotr Lis' })];
    expect(rank(people, few, false, '2026-11').entries.map((e) => e.name)).toEqual(['Piotr Lis', 'Anna Nowak', 'Ewa Zając']);
    expect(rank(people, rows, false, '2026-11').entries.map((e) => e.name)).toEqual(['Jan Kowalski', 'Anna Nowak', 'Marek Logistyka']);
  });
});
