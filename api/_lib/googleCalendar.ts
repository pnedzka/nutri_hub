// Approved leave and business trips from Leave, copied to the company's shared Google Calendar (decision of
// 24.11.2026: the calendar the team already has in the company Gmail). One-way: the hub is the source, the calendar
// only shows. A Google service account writes the events; the calendar is shared with its address ("Make changes to
// events"). Without GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT (e.g. in Preview) nothing is sent.
//
// Each request has its own event id (lv + the request's uuid without dashes; Google allows a–v and 0–9), so writing
// again only updates it and cancelling deletes it. The daily run (api/_lib/daily.ts) repeats the recent changes, so a
// failed call is corrected the next morning. Privacy: the title says only "urlop" (annual leave, on demand),
// "delegacja" or "nieobecność" (the other types, e.g. sick leave), as the hub's calendar shows "Absent" to others;
// no notes.

import { createSign } from 'node:crypto';
import { parseDate, toIso, type LeaveType } from '../../shared/leave.js';
import { logError } from './monitoring.js';

const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export interface CalendarLeave {
  id: string;
  type: LeaveType;
  start: string;
  end: string;
  halfDay: boolean;
  status: string;
  personName: string;
}

/** A leave_requests row as the calendar copy needs it. */
export const calendarLeave = (row: Record<string, unknown>, personName: string): CalendarLeave => ({
  id: String(row.id),
  type: row.type as LeaveType,
  start: String(row.start_date),
  end: String(row.end_date),
  halfDay: Boolean(row.half_day),
  status: String(row.status),
  personName,
});

interface Config {
  calendarId: string;
  email: string;
  key: string;
}

export function calendarConfig(env: Record<string, string | undefined> = process.env): Config | null {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  const raw = env.GOOGLE_SERVICE_ACCOUNT?.trim();
  if (!calendarId || !raw) return null;
  try {
    const account = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!account.client_email || !account.private_key) return null;
    return { calendarId, email: account.client_email, key: account.private_key.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

/** The event id of a leave request in Google Calendar. */
export const eventId = (requestId: string) => `lv${requestId.replace(/-/g, '').toLowerCase()}`;

export function eventTitle(leave: Pick<CalendarLeave, 'type' | 'halfDay' | 'personName'>): string {
  const what = leave.type === 'business_trip' ? 'delegacja' : leave.type === 'vacation' || leave.type === 'on_demand' ? 'urlop' : 'nieobecność';
  return `${leave.personName}: ${what}${leave.halfDay ? ' (pół dnia)' : ''}`;
}

/** The event body: a whole-day event (Google's end date is the day after the last day). */
export function toEvent(leave: CalendarLeave, hubUrl: string) {
  const after = parseDate(leave.end)!;
  after.setUTCDate(after.getUTCDate() + 1);
  return {
    id: eventId(leave.id),
    summary: eventTitle(leave),
    description: `Z centrum aplikacji Nutri Partners (Leave). Zmiany tylko w centrum: ${hubUrl}/leave`,
    start: { date: leave.start },
    end: { date: toIso(after) },
    transparency: 'transparent',
    status: 'confirmed',
    extendedProperties: { private: { source: 'nutri-hub-leave', requestId: leave.id } },
  };
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

let cached: { token: string; until: number } | null = null;

async function accessToken(config: Config): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: config.email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(config.key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${base64url(signature)}` }),
  });
  if (!response.ok) throw new Error(`Google token: HTTP ${response.status}`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, until: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function call(config: Config, method: string, path: string, body?: unknown): Promise<number> {
  const response = await fetch(`${API}/calendars/${encodeURIComponent(config.calendarId)}/events${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken(config)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.status;
}

/** Writes (approved) or removes (any other status) the event of one request. Throws on failure. */
async function syncOne(config: Config, leave: CalendarLeave, hubUrl: string): Promise<void> {
  const id = eventId(leave.id);
  if (leave.status === 'approved') {
    const event = toEvent(leave, hubUrl);
    // Update first (also brings back an event deleted earlier); insert when it never existed.
    let status = await call(config, 'PUT', `/${id}`, event);
    if (status === 404) status = await call(config, 'POST', '', event);
    if (status >= 300) throw new Error(`Google Calendar write: HTTP ${status}`);
  } else {
    const status = await call(config, 'DELETE', `/${id}`);
    if (status >= 300 && status !== 404 && status !== 410) throw new Error(`Google Calendar delete: HTTP ${status}`);
  }
}

/** Copies requests to the calendar. Never throws: errors go to Sentry (without names) and the daily run repeats it. */
export async function syncToCalendar(leaves: CalendarLeave[], hubUrl: string): Promise<{ synced: number; failed: number }> {
  const config = calendarConfig();
  if (!config || !leaves.length) return { synced: 0, failed: 0 };
  let synced = 0;
  let failed = 0;
  for (const leave of leaves) {
    try {
      await syncOne(config, leave, hubUrl);
      synced++;
    } catch (error) {
      failed++;
      logError('leave.googleCalendar', error, { requestId: leave.id, status: leave.status });
    }
  }
  return { synced, failed };
}
