import { describe, expect, it } from 'vitest';
import { cleanContest, contestStatus, ContestInputError, nextDay, scoreContest, todayInPoland, type Contest } from './contest';
import { dayStart, type ContractRow } from './dashboard';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const contest: Contest = {
  id: 'c1',
  name: 'Q4 race',
  startsOn: '2026-10-01',
  endsOn: '2026-12-31',
  weightCount: 70,
  prize: 'Dinner',
  participantIds: [A, B, C],
  createdAt: '2026-09-30T10:00:00Z',
};
const people = [
  { id: A, name: 'Anna Nowak', avatarUrl: null },
  { id: B, name: 'Jan Kowalski', avatarUrl: null },
  { id: C, name: 'Ewa Zając', avatarUrl: null },
];
const row = (owner: string, eur: number | null, type = 'S'): ContractRow => ({
  contract_id: 'x',
  contract_type: type,
  status: 'Approved',
  owner_name: owner,
  created_at: '2026-11-03T10:00:00Z',
  value_eur: eur,
});

describe('cleanContest', () => {
  const ok = { name: ' Q4 race ', startsOn: '2026-10-01', endsOn: '2026-12-31', weightCount: 70, prize: '', participantIds: [A, A, B] };
  it('tidies a valid contest', () => {
    expect(cleanContest(ok)).toEqual({ name: 'Q4 race', startsOn: '2026-10-01', endsOn: '2026-12-31', weightCount: 70, prize: '', participantIds: [A, B] });
  });
  it('refuses what makes no sense', () => {
    expect(() => cleanContest({ ...ok, name: '' })).toThrow(ContestInputError);
    expect(() => cleanContest({ ...ok, endsOn: '2026-09-01' })).toThrow('before');
    expect(() => cleanContest({ ...ok, weightCount: 101 })).toThrow(ContestInputError);
    expect(() => cleanContest({ ...ok, participantIds: [] })).toThrow('participant');
    expect(() => cleanContest({ ...ok, participantIds: ['nope'] })).toThrow(ContestInputError);
  });
});

describe('days', () => {
  it('counts the last day in full', () => {
    expect(contestStatus(contest, '2026-12-31')).toBe('active');
    expect(contestStatus(contest, '2027-01-01')).toBe('finished');
    expect(contestStatus(contest, '2026-09-30')).toBe('upcoming');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(dayStart(nextDay('2026-12-31'))).toBe('2026-12-31T23:00:00.000Z');
  });
  it('knows the Polish date', () => {
    expect(todayInPoland(new Date('2026-11-23T23:30:00Z'))).toBe('2026-11-24');
  });
});

describe('scoreContest', () => {
  const rows = [
    row('Anna Nowak', 10000),
    row('Anna Nowak', 10000, 'P'),
    row('Jan Kowalski', 40000),
    row('Jan Kowalski', null),
    row('Someone Else', 99999),
  ];

  it('scores against the leader, counting sales and purchases, in EUR', () => {
    const result = scoreContest(contest, people, rows, '2026-11-23', { id: A, isAdmin: true });
    // Anna: 0.7 × 2/2 + 0.3 × 20000/40000 = 85; Jan: 0.7 × 2/2 + 0.3 × 1 = 100; Ewa: 0.
    expect(result.entries.map((e) => [e.name, e.contracts, e.eur, e.score])).toEqual([
      ['Jan Kowalski', 2, 40000, 100],
      ['Anna Nowak', 2, 20000, 85],
      ['Ewa Zając', 0, 0, 0],
    ]);
    expect(result.status).toBe('active');
    expect(result.daysLeft).toBe(39);
    expect(result.leader).toEqual({ contracts: 2, eur: 40000 });
  });

  it('does not change the others when someone without contracts takes part', () => {
    const without = scoreContest({ ...contest, participantIds: [A, B] }, people, rows, '2026-11-23', { id: A, isAdmin: true });
    const withC = scoreContest(contest, people, rows, '2026-11-23', { id: A, isAdmin: true });
    expect(without.entries.map((e) => e.score)).toEqual(withC.entries.slice(0, 2).map((e) => e.score));
  });

  it('shows values only to administrators and for the person themselves', () => {
    const result = scoreContest(contest, people, rows, '2026-11-23', { id: A, isAdmin: false });
    expect(result.entries.map((e) => e.eur)).toEqual([null, 20000, null]);
  });

  it('gives everyone 0 before the first contract', () => {
    const result = scoreContest(contest, people, [], '2026-10-02', { id: A, isAdmin: true });
    expect(result.entries.every((e) => e.score === 0)).toBe(true);
    expect(result.leader).toBeNull();
  });
});
