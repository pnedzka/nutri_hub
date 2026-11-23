// Sales contests (the old intranet's "Performance ranking" and "Growth achievements" widget, decision of 23.11.2026).
// Administrators set a contest: its days, who takes part, the prize and how much the number of contracts and their
// value count. The score is computed here, for the home page widget and the administrators' results alike.
//
// Fixed against the intranet (Paweł's decision): values in EUR, not different currencies added up as one number; a
// score as a share of the leader, so a participant with contracts never gets 0 and someone with none joining does not
// change the others' scores; the last day counts in full; administrators see the ranking too. Like the intranet, a
// contest counts sales and purchase contracts, without cancelled ones.

import { isUuid } from './profile.js';
import type { ContractRow } from './dashboard.js';

export interface ContestInput {
  name: string;
  /** First and last day, YYYY-MM-DD, both included (Polish time). */
  startsOn: string;
  endsOn: string;
  /** How much the number of contracts counts, 0–100; their value counts the rest. */
  weightCount: number;
  prize: string;
  participantIds: string[];
}

export interface Contest extends ContestInput {
  id: string;
  createdAt: string;
}

export type ContestStatus = 'upcoming' | 'active' | 'finished';

export interface ContestPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ContestEntry extends ContestPerson {
  contracts: number;
  /** Value of the contracts in EUR; sent only to administrators and for the person's own row. */
  eur: number | null;
  /** 0–100. */
  score: number;
}

export interface ContestResult {
  contest: Contest;
  status: ContestStatus;
  /** Whole days left, counting today (only while active). */
  daysLeft: number | null;
  entries: ContestEntry[];
  /** The leader's numbers, to show the distance to them. */
  leader: { contracts: number; eur: number } | null;
}

export class ContestInputError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: unknown): value is string => typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

/** Checks and tidies what an administrator sent; throws ContestInputError with a message for them. */
export function cleanContest(body: Partial<Record<keyof ContestInput, unknown>>): ContestInput {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new ContestInputError('Give the contest a name.');
  if (name.length > 120) throw new ContestInputError('The name is too long (120 characters at most).');
  if (!validDay(body.startsOn) || !validDay(body.endsOn)) throw new ContestInputError('Choose the first and the last day.');
  if (body.endsOn < body.startsOn) throw new ContestInputError('The last day is before the first one.');
  const weightCount = Number(body.weightCount);
  if (!Number.isInteger(weightCount) || weightCount < 0 || weightCount > 100) throw new ContestInputError('The weight of the number of contracts must be 0–100.');
  const prize = typeof body.prize === 'string' ? body.prize.trim() : '';
  if (prize.length > 500) throw new ContestInputError('The prize description is too long (500 characters at most).');
  const ids = Array.isArray(body.participantIds) ? [...new Set(body.participantIds)] : [];
  if (!ids.every(isUuid)) throw new ContestInputError('A participant is invalid.');
  if (ids.length === 0) throw new ContestInputError('Choose at least one participant.');
  return { name, startsOn: body.startsOn, endsOn: body.endsOn, weightCount, prize, participantIds: ids as string[] };
}

/** Today in Poland, YYYY-MM-DD. */
export function todayInPoland(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function contestStatus(contest: Pick<ContestInput, 'startsOn' | 'endsOn'>, today: string): ContestStatus {
  if (today < contest.startsOn) return 'upcoming';
  return today > contest.endsOn ? 'finished' : 'active';
}

/** The day after, YYYY-MM-DD (the end of a contest's range, exclusive). */
export function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const nameKey = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The ranking. Contracts count by their owner's name, as the intranet stores it. Score = weight × (own number ÷ the
 * leader's number) + the rest × (own value ÷ the leader's value), 0–100; ties go to more contracts, then by name.
 * Contracts without an EUR value count in the number but not in the value.
 */
export function scoreContest(
  contest: Contest,
  people: ContestPerson[],
  rows: ContractRow[],
  today: string,
  viewer: { id: string; isAdmin: boolean },
): ContestResult {
  const byName = new Map<string, { contracts: number; eur: number }>();
  for (const row of rows) {
    if (!row.owner_name) continue;
    const key = nameKey(row.owner_name);
    const sums = byName.get(key) ?? { contracts: 0, eur: 0 };
    sums.contracts += 1;
    sums.eur += row.value_eur === null ? 0 : Number(row.value_eur) || 0;
    byName.set(key, sums);
  }
  const known = new Map(people.map((p) => [p.id, p]));
  const raw = contest.participantIds
    .map((id) => known.get(id))
    .filter((p): p is ContestPerson => !!p)
    .map((p) => ({ ...p, ...(byName.get(nameKey(p.name)) ?? { contracts: 0, eur: 0 }) }));
  const maxCount = Math.max(0, ...raw.map((r) => r.contracts));
  const maxEur = Math.max(0, ...raw.map((r) => r.eur));
  const wCount = contest.weightCount / 100;
  const ranked = raw
    .map((r) => {
      const score = (wCount * (maxCount ? r.contracts / maxCount : 0) + (1 - wCount) * (maxEur ? r.eur / maxEur : 0)) * 100;
      return { ...r, eur: Math.round(r.eur), score: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.score - a.score || b.contracts - a.contracts || a.name.localeCompare(b.name, 'pl'));
  const status = contestStatus(contest, today);
  const daysLeft =
    status === 'active' ? Math.round((Date.parse(`${contest.endsOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5) + 1 : null;
  const top = ranked[0];
  return {
    contest,
    status,
    daysLeft,
    entries: ranked.map((r) => ({ ...r, eur: viewer.isAdmin || r.id === viewer.id ? r.eur : null })),
    leader: top && top.contracts + top.eur > 0 ? { contracts: top.contracts, eur: top.eur } : null,
  };
}
