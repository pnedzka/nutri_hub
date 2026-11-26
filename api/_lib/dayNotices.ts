// The morning look at the day (decision of 25.11.2026): on working days at 7:00 the bell tells each person who is
// away today and, to those who see the company's Google Calendar, today's events. Only the bell, no e-mail (Google
// reminds the invited people itself). Who sees what is the same as in the dashboard's calendar widget
// (shared/dashboard.ts): absences to people with Leave (only as "away", without the type), events to
// administrators, Board and Administration. Pure, tested in dayNotices.test.ts; runDaily (daily.ts) sends it.

import { canUse } from '../../shared/access.js';
import { seesCompanyCalendar, type Viewer } from '../../shared/dashboard.js';
import type { CalendarEventRow } from './googleCalendar.js';
import type { Notice, Recipient } from './notifications.js';

export interface DigestPerson extends Recipient, Viewer {}

export interface AwayToday {
  userId: string;
  name: string;
  halfDay: boolean;
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' });

/** "09:30 Board meeting", "All day: Training", "Until 11:00: Trip" (started on an earlier day). */
export function eventLine(event: CalendarEventRow, day: string): string {
  if (event.allDay) return `All day: ${event.title}`;
  const start = new Date(event.start);
  if (DAY.format(start) === day) return `${TIME.format(start)} ${event.title}`;
  return `Until ${TIME.format(new Date(event.end))}: ${event.title}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The notification for one person, or null when there is nothing to tell. `leaveOn`: the Leave module is on;
 * `events`: today's events of the company calendar (null when it could not be read). The person's own absence is
 * left out, and a person who is away all day gets nothing.
 */
export function morningDigest(person: DigestPerson, away: AwayToday[], events: CalendarEventRow[] | null, day: string, leaveOn: boolean): Notice | null {
  if (away.some((a) => a.userId === person.id && !a.halfDay)) return null;
  const others = leaveOn && canUse(person, 'leave') ? away.filter((a) => a.userId !== person.id) : [];
  const today = seesCompanyCalendar(person) ? events ?? [] : [];
  if (!others.length && !today.length) return null;
  const head = [others.length ? `${plural(others.length, 'person', 'people')} away` : '', today.length ? plural(today.length, 'event', 'events') : '']
    .filter(Boolean)
    .join(', ');
  const body = [
    others.length ? `Away: ${others.map((a) => (a.halfDay ? `${a.name} (half day)` : a.name)).join(', ')}.` : '',
    today.length ? `Events: ${today.map((e) => eventLine(e, day)).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    module: 'calendar',
    kind: 'calendar.today',
    to: [person],
    title: `Today: ${head}`,
    body,
    link: '/',
  };
}
