import { describe, expect, it } from 'vitest';
import { safeLink, timeAgo } from '../../shared/notifications';
import { accessChanges } from './accountNotices';
import { renderApexMail } from './apexMail';
import { contestAnnounced, contestFinished } from './contestNotices';
import { dayInPoland, nextWorkingDay, workingDaysBefore } from './daily';
import { leaveCancelled, leaveEntered, plDays, plRange, requestDecided, requestSubmitted, requestWaiting, requestWithdrawn, settingsChanged, teamAwayNext, type LeaveFacts } from './leaveNotices';
import { recipientsOf } from './notifications';

const anna = { id: 'a', email: 'anna@np.co', name: 'Anna Kowalska' };
const boss = { id: 'b', email: 'boss@np.co', name: 'Marek Nowak' };
const admin = { id: 'c', email: 'admin@np.co', name: 'Paweł Admin' };
const leave: LeaveFacts = { type: 'vacation', start: '2026-12-01', end: '2026-12-04', halfDay: false, days: 4, note: 'Wyjazd' };

describe('recipientsOf', () => {
  it('drops the actor and duplicates', () => {
    expect(recipientsOf({ to: [anna, boss, anna, admin], actorId: 'c' }).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('Polish leave wording', () => {
  it('formats days and ranges', () => {
    expect(plDays(1)).toBe('1 dzień');
    expect(plDays(0.5)).toBe('0,5 dnia');
    expect(plDays(3)).toBe('3 dni');
    expect(plRange('2026-12-01', '2026-12-01', true)).toBe('1 grudnia 2026 (pół dnia)');
    expect(plRange('2026-12-01', '2026-12-04')).toBe('1 grudnia 2026 – 4 grudnia 2026');
  });
});

describe('leave notices', () => {
  it('L1 + L2: approvers act (e-mail), the employee gets a confirmation (bell)', () => {
    const [toApprovers, toOwner] = requestSubmitted(leave, anna, [boss, admin]);
    expect(toApprovers.to).toEqual([boss, admin]);
    expect(toApprovers.actorId).toBe('a');
    expect(toApprovers.email?.todo).toMatch(/Zatwierdź/);
    expect(toApprovers.link).toBe('/leave/approvals');
    expect(toOwner.to).toEqual([anna]);
    expect(toOwner.email).toBeUndefined();
  });

  it('L3–L5: the employee gets the decision, the other approvers only the bell', () => {
    const [toOwner, toOthers] = requestDecided(leave, 'rejected', anna, boss, [admin], 'Za dużo osób na urlopie');
    expect(toOwner.kind).toBe('leave.rejected');
    expect(toOwner.email?.comment).toBe('Za dużo osób na urlopie');
    expect(toOthers.to).toEqual([admin]);
    expect(toOthers.email).toBeUndefined();
  });

  it('L6: a withdrawn request tells the approvers', () => {
    const [n] = requestWithdrawn(leave, anna, [boss]);
    expect(n.to).toEqual([boss]);
    expect(n.email?.title).toMatch(/wycofał/);
  });

  it('L7: cancelled approved leave tells the employee and the manager', () => {
    const notices = leaveCancelled(leave, true, anna, admin, boss, null);
    expect(notices.map((n) => n.to[0].id)).toEqual(['a', 'b']);
    expect(leaveCancelled(leave, false, anna, admin, boss, null)).toHaveLength(1);
  });

  it('L8: leave entered by an administrator', () => {
    const [toOwner, toManager] = leaveEntered({ ...leave, type: 'sick' }, anna, admin, boss);
    expect(toOwner.email?.lead).toMatch(/nie zmniejsza salda/);
    expect(toManager.to).toEqual([boss]);
  });

  it('L9–L11', () => {
    expect(requestWaiting(leave, anna, [boss]).email?.todo).toBeTruthy();
    expect(teamAwayNext(boss, [], '2026-12-01')).toBeNull();
    expect(teamAwayNext(boss, [{ name: 'Anna', range: 'x' }, { name: 'Ola', range: 'y' }], '2026-12-01')?.title).toMatch(/^2 people/);
    expect(settingsChanged(anna, admin, [])).toEqual([]);
    expect(settingsChanged(anna, admin, ['Manager: Marek Nowak'])[0].body).toMatch(/Paweł Admin/);
  });
});

describe('renderApexMail', () => {
  it('greets by first name, escapes and has the cards', () => {
    const mail = renderApexMail({
      module: 'Urlopy',
      title: 'Test <b>',
      name: 'Anna Kowalska',
      lead: 'Coś się stało.',
      todo: 'Zrób to',
      details: [['Rodzaj', 'Urlop']],
      button: { label: 'Otwórz', url: 'https://example.com/leave' },
    });
    expect(mail.subject).toBe('Nutri APEX – Urlopy: Test <b>');
    expect(mail.html).toContain('Cześć Anna,');
    expect(mail.html).toContain('Test &lt;b&gt;');
    expect(mail.html).toContain('Twoja kolej');
    expect(mail.text).toContain('Otwórz: https://example.com/leave');
  });
});

describe('account notices', () => {
  it('names new apps and role changes only', () => {
    expect(accessChanges({ role: 'user', apps: ['news'] }, { role: 'user', apps: ['news', 'leave'] }, 'leave')).toEqual(['New: Leave']);
    // A module not released here is not mentioned.
    expect(accessChanges({ role: 'user', apps: ['news'] }, { role: 'user', apps: ['news', 'leave'] }, '')).toEqual([]);
    expect(accessChanges({ role: 'user', apps: ['news', 'leave'] }, { role: 'user', apps: ['news'] }, '')).toEqual([]);
    expect(accessChanges({ role: 'user', apps: [] }, { role: 'admin', apps: [] }, '')[0]).toMatch(/administrator/);
  });
});

describe('daily run dates', () => {
  it('skips weekends and Polish holidays', () => {
    expect(nextWorkingDay('2026-11-27')).toBe('2026-11-30'); // Friday → Monday
    expect(nextWorkingDay('2026-12-23')).toBe('2026-12-28'); // 24–26 Dec are holidays, 27 is Sunday
    expect(workingDaysBefore('2026-11-25', 2)).toBe('2026-11-23');
    expect(workingDaysBefore('2026-11-24', 2)).toBe('2026-11-20');
    expect(dayInPoland('2026-11-23T23:30:00Z')).toBe('2026-11-24');
  });
});

describe('shared helpers', () => {
  it('allows hub paths and https links only', () => {
    expect(safeLink('/leave')).toEqual({ internal: true, href: '/leave' });
    expect(safeLink('//evil.com')).toBeNull();
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('https://example.com/x')?.internal).toBe(false);
  });
  it('says how long ago', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    expect(timeAgo('2026-11-23T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-22T10:00:00Z', now)).toBe('yesterday');
  });
});

describe('contest notices', () => {
  const contest = { id: 'k1', name: 'Grudzień', startsOn: '2026-12-01', endsOn: '2026-12-31', weightCount: 70, prize: 'Weekend w SPA', participantIds: ['a', 'b'], createdAt: '' };
  const entry = (p: typeof anna, contracts: number, score: number) => ({ ...p, avatarUrl: null, contracts, eur: null, score });

  it('C1 tells the participants how the contest counts, in Polish by e-mail', () => {
    const n = contestAnnounced(contest, [anna, boss], admin)!;
    expect(n.to).toEqual([anna, boss]);
    expect(n.link).toBe('/?contest=k1');
    expect(n.email?.details).toContainEqual(['Co się liczy', '70% liczba kontraktów, 30% ich wartość w EUR']);
    expect(contestAnnounced(contest, [], admin)).toBeNull();
  });

  it('C4 gives each participant their place and the administrators the winner', () => {
    const result = { contest, status: 'finished' as const, daysLeft: null, entries: [entry(boss, 3, 100), entry(anna, 1, 40)], leader: { contracts: 3, eur: 0 } };
    const notices = contestFinished(result, [anna, boss], [admin, boss]);
    expect(notices.map((n) => [n.to.map((r) => r.id), n.title])).toEqual([
      [['a'], 'Grudzień has ended: you placed 2 of 2'],
      [['b'], 'You won the contest Grudzień!'],
      [['c'], 'The contest Grudzień has ended'],
    ]);
    expect(notices[0].body).toBe('Winner: Marek Nowak (3 contracts).');
    expect(notices.every((n) => !n.email)).toBe(true);
  });

  it('C4 names no winner when nobody had contracts', () => {
    const result = { contest, status: 'finished' as const, daysLeft: null, entries: [entry(anna, 0, 0)], leader: null };
    expect(contestFinished(result, [anna], [])[0].body).toBe('Nobody had contracts in it.');
  });
});
