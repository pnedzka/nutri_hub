// Notifications of the Leave module at every step of a request (README "Powiadomienia", L1–L8, L11). Pure: they
// plan who gets what (tested in leaveNotices.test.ts); api/leave/* passes the result to notify().
// The bell is in English like the hub; the e-mails are in Polish like every Nutri APEX e-mail.

import { formatRange, type LeaveType } from '../../shared/leave.js';
import type { Notice, Recipient } from './notifications.js';

export const LEAVE_TYPE_PL: Record<LeaveType, string> = {
  vacation: 'urlop wypoczynkowy',
  on_demand: 'urlop na żądanie',
  occasional: 'urlop okolicznościowy',
  childcare: 'opieka nad dzieckiem',
  unpaid: 'urlop bezpłatny',
  sick: 'zwolnienie lekarskie (L4)',
  business_trip: 'delegacja',
};

const PL_DATE = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const plDate = (iso: string) => PL_DATE.format(new Date(`${iso}T00:00:00Z`));

/** "24 listopada 2026 (pół dnia)", "24 – 28 listopada 2026" style ranges, in Polish. */
export function plRange(start: string, end: string, halfDay = false): string {
  if (start === end) return `${plDate(start)}${halfDay ? ' (pół dnia)' : ''}`;
  return `${plDate(start)} – ${plDate(end)}`;
}

/** "1 dzień", "0,5 dnia", "1,5 dnia", "3 dni". */
export function plDays(days: number): string {
  if (days === 1) return '1 dzień';
  const value = Number.isInteger(days) ? String(days) : days.toFixed(1).replace('.', ',');
  return Number.isInteger(days) ? `${value} dni` : `${value} dnia`;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface LeaveFacts {
  type: LeaveType;
  start: string;
  end: string;
  halfDay: boolean;
  days: number;
  note?: string | null;
}

const details = (r: LeaveFacts, owner?: Recipient): [string, string][] => [
  ...(owner ? ([['Pracownik', owner.name]] as [string, string][]) : []),
  ['Rodzaj', cap(LEAVE_TYPE_PL[r.type])],
  ['Termin', plRange(r.start, r.end, r.halfDay)],
  ['Dni robocze', plDays(r.days)],
  ...(r.note ? ([['Uwagi pracownika', r.note]] as [string, string][]) : []),
];

const range = (r: LeaveFacts) => formatRange(r.start, r.end, r.halfDay);

type Steps = NonNullable<NonNullable<Notice['email']>['steps']>;
const steps = (state: 'pending' | 'approved'): Steps => [
  { label: 'Wniosek złożony', state: 'done' },
  { label: 'Decyzja przełożonego', state: state === 'pending' ? 'now' : 'done' },
  { label: 'Urlop zatwierdzony', state: state === 'pending' ? 'next' : 'done' },
];

/** L1 + L2: a person asked for leave. */
export function requestSubmitted(r: LeaveFacts, owner: Recipient, approvers: Recipient[]): Notice[] {
  return [
    {
      module: 'leave',
      kind: 'leave.submitted',
      to: approvers,
      actorId: owner.id,
      title: `${owner.name} asked for leave: ${range(r)}`,
      body: `${cap(LEAVE_TYPE_PL[r.type])}, ${plDays(r.days)}. Approve or reject the request.`,
      link: '/leave/approvals',
      email: {
        module: 'Urlopy',
        title: `${owner.name} prosi o urlop`,
        lead: `${owner.name} złożył(a) wniosek: ${LEAVE_TYPE_PL[r.type]}, ${plRange(r.start, r.end, r.halfDay)}.`,
        todo: 'Zatwierdź albo odrzuć wniosek w module Leave (możesz dopisać komentarz). Wniosek widzi też saldo urlopu pracownika.',
        details: details(r, owner),
        steps: steps('pending'),
        button: 'Rozpatrz wniosek',
      },
    },
    {
      module: 'leave',
      kind: 'leave.sent',
      to: [owner],
      title: `Your leave request was sent: ${range(r)}`,
      body: approvers.length ? `Waiting for ${approvers.length === 1 ? approvers[0].name : 'your manager or an administrator'}.` : 'Waiting for a decision.',
      link: '/leave',
    },
  ];
}

/** L3 + L4 + L5: the manager or an administrator decided. */
export function requestDecided(r: LeaveFacts, decision: 'approved' | 'rejected', owner: Recipient, decider: Recipient, otherApprovers: Recipient[], comment: string | null): Notice[] {
  const ok = decision === 'approved';
  return [
    {
      module: 'leave',
      kind: `leave.${decision}`,
      to: [owner],
      actorId: decider.id,
      title: `Your leave was ${decision}: ${range(r)}`,
      body: comment ? `${decider.name}: “${comment}”` : `By ${decider.name}.`,
      link: '/leave',
      email: {
        module: 'Urlopy',
        title: ok ? 'Twój urlop jest zatwierdzony' : 'Twój wniosek urlopowy został odrzucony',
        lead: ok
          ? `${decider.name} zatwierdził(a) Twój wniosek: ${LEAVE_TYPE_PL[r.type]}, ${plRange(r.start, r.end, r.halfDay)}. Udanego wypoczynku!`
          : `${decider.name} odrzucił(a) Twój wniosek: ${LEAVE_TYPE_PL[r.type]}, ${plRange(r.start, r.end, r.halfDay)}.`,
        todo: ok ? null : 'Jeśli chcesz, złóż nowy wniosek z innym terminem albo porozmawiaj z przełożonym.',
        comment,
        details: details(r),
        steps: ok ? steps('approved') : null,
        button: 'Otwórz moje urlopy',
      },
    },
    {
      module: 'leave',
      kind: 'leave.decided_by_other',
      to: otherApprovers.filter((p) => p.id !== owner.id),
      actorId: decider.id,
      title: `${decider.name} ${decision} ${owner.name}'s leave: ${range(r)}`,
      body: 'Nothing to do: the request is closed.',
      link: '/leave/approvals',
    },
  ];
}

/** L6: the person withdrew a pending request. */
export function requestWithdrawn(r: LeaveFacts, owner: Recipient, approvers: Recipient[]): Notice[] {
  return [
    {
      module: 'leave',
      kind: 'leave.withdrawn',
      to: approvers,
      actorId: owner.id,
      title: `${owner.name} withdrew a leave request: ${range(r)}`,
      body: 'Nothing to decide any more.',
      link: '/leave/approvals',
      email: {
        module: 'Urlopy',
        title: `${owner.name} wycofał(a) wniosek urlopowy`,
        lead: `${owner.name} wycofał(a) wniosek: ${LEAVE_TYPE_PL[r.type]}, ${plRange(r.start, r.end, r.halfDay)}. Nie trzeba już nic robić.`,
        details: details(r, owner),
        button: 'Otwórz wnioski',
      },
    },
  ];
}

/** L7: an administrator cancelled a pending request or approved leave. */
export function leaveCancelled(r: LeaveFacts, wasApproved: boolean, owner: Recipient, admin: Recipient, manager: Recipient | null, comment: string | null): Notice[] {
  const what = wasApproved ? 'zatwierdzony urlop' : 'wniosek urlopowy';
  return [
    {
      module: 'leave',
      kind: 'leave.cancelled',
      to: [owner],
      actorId: admin.id,
      title: `Your ${wasApproved ? 'approved leave' : 'leave request'} was cancelled: ${range(r)}`,
      body: comment ? `${admin.name}: “${comment}”` : `By ${admin.name}.`,
      link: '/leave',
      email: {
        module: 'Urlopy',
        title: wasApproved ? 'Twój urlop został anulowany' : 'Twój wniosek urlopowy został anulowany',
        lead: `${admin.name} anulował(a) Twój ${what}: ${LEAVE_TYPE_PL[r.type]}, ${plRange(r.start, r.end, r.halfDay)}. Dni wróciły do salda.`,
        comment,
        details: details(r),
        button: 'Otwórz moje urlopy',
      },
    },
    ...(manager && wasApproved
      ? [
          {
            module: 'leave' as const,
            kind: 'leave.cancelled_team',
            to: [manager].filter((m) => m.id !== owner.id),
            actorId: admin.id,
            title: `${admin.name} cancelled ${owner.name}'s leave: ${range(r)}`,
            link: '/leave/calendar',
          },
        ]
      : []),
  ];
}

/** L8: an administrator entered (approved) leave or sick leave for the person. */
export function leaveEntered(r: LeaveFacts, owner: Recipient, admin: Recipient, manager: Recipient | null): Notice[] {
  return [
    {
      module: 'leave',
      kind: 'leave.entered',
      to: [owner],
      actorId: admin.id,
      title: `${admin.name} entered your leave: ${range(r)}`,
      body: `${cap(LEAVE_TYPE_PL[r.type])}, ${plDays(r.days)}.`,
      link: '/leave',
      email: {
        module: 'Urlopy',
        title: r.type === 'sick' ? 'Wpisano Twoje zwolnienie lekarskie' : 'Wpisano Twój urlop',
        lead: `${admin.name} wpisał(a) za Ciebie: ${LEAVE_TYPE_PL[r.type]}, ${plRange(r.start, r.end, r.halfDay)}. Jest już zatwierdzony${r.type === 'sick' ? ' i nie zmniejsza salda urlopu' : ''}.`,
        details: details(r),
        button: 'Otwórz moje urlopy',
      },
    },
    ...(manager
      ? [
          {
            module: 'leave' as const,
            kind: 'leave.entered_team',
            to: [manager].filter((m) => m.id !== owner.id),
            actorId: admin.id,
            title: `${owner.name} is away: ${range(r)}`,
            body: `Entered by ${admin.name}.`,
            link: '/leave/calendar',
          },
        ]
      : []),
  ];
}

/** L11: an administrator changed the person's manager, yearly days or balance. */
export function settingsChanged(owner: Recipient, admin: Recipient, changes: string[]): Notice[] {
  if (!changes.length) return [];
  return [
    {
      module: 'leave',
      kind: 'leave.settings',
      to: [owner],
      actorId: admin.id,
      title: 'Your leave settings changed',
      body: `${changes.join('; ')}. By ${admin.name}.`,
      link: '/leave',
    },
  ];
}

/** L9: a request has waited for a decision for 2 working days. */
export function requestWaiting(r: LeaveFacts, owner: Recipient, approvers: Recipient[]): Notice {
  return {
    module: 'leave',
    kind: 'leave.reminder',
    to: approvers,
    title: `Still waiting: ${owner.name}'s leave request (${range(r)})`,
    body: 'Sent 2 working days ago. Approve or reject it.',
    link: '/leave/approvals',
    email: {
      module: 'Urlopy',
      title: `Wniosek ${owner.name} czeka na decyzję`,
      lead: `Wniosek ${owner.name} (${LEAVE_TYPE_PL[r.type]}, ${plRange(r.start, r.end, r.halfDay)}) czeka na decyzję od 2 dni roboczych.`,
      todo: 'Zatwierdź albo odrzuć wniosek w module Leave, żeby pracownik mógł zaplanować wolne.',
      details: details(r, owner),
      steps: steps('pending'),
      button: 'Rozpatrz wniosek',
    },
  };
}

/** L10: people of the manager's team who start leave on the next working day (one notification per manager). */
export function teamAwayNext(manager: Recipient, away: { name: string; range: string }[], day: string): Notice | null {
  if (!away.length) return null;
  return {
    module: 'leave',
    kind: 'leave.team_away',
    to: [manager],
    title: away.length === 1 ? `${away[0].name} is away from ${formatRange(day, day)}` : `${away.length} people from your team are away from ${formatRange(day, day)}`,
    body: away.map((a) => `${a.name}: ${a.range}`).join('; ').slice(0, 1000),
    link: '/leave/calendar',
  };
}
