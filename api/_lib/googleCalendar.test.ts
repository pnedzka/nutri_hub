import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarConfig, eventId, eventTitle, listEvents, toEvent } from './googleCalendar';

const leave = { id: '3F2A1C9E-0B1D-4E5F-8A9B-112233445566', type: 'vacation' as const, start: '2026-12-28', end: '2026-12-31', halfDay: false, status: 'approved', personName: 'Anna Kowalska' };

describe('Google Calendar copy of leave', () => {
  it('gives each request an event id Google accepts (a–v, 0–9, 5–1024 characters)', () => {
    const id = eventId(leave.id);
    expect(id).toBe('lv3f2a1c9e0b1d4e5f8a9b112233445566');
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it('shows the type only as leave, business trip or absence', () => {
    expect(eventTitle(leave)).toBe('Anna Kowalska: urlop');
    expect(eventTitle({ ...leave, type: 'business_trip' })).toBe('Anna Kowalska: delegacja');
    expect(eventTitle({ ...leave, type: 'sick' })).toBe('Anna Kowalska: nieobecność');
    expect(eventTitle({ ...leave, type: 'on_demand', halfDay: true })).toBe('Anna Kowalska: urlop (pół dnia)');
  });

  it('is a whole-day event ending the day after the last day, without the note', () => {
    const event = toEvent(leave, 'https://hub.example');
    expect(event.start).toEqual({ date: '2026-12-28' });
    expect(event.end).toEqual({ date: '2027-01-01' });
    expect(event.transparency).toBe('transparent');
    expect(JSON.stringify(event)).not.toContain('note');
  });

  it('is off without both settings or with a broken key', () => {
    expect(calendarConfig({})).toBeNull();
    expect(calendarConfig({ GOOGLE_CALENDAR_ID: 'x@group.calendar.google.com', GOOGLE_SERVICE_ACCOUNT: 'not json' })).toBeNull();
    const config = calendarConfig({ GOOGLE_CALENDAR_ID: 'x', GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'a\\nb' }) });
    expect(config).toEqual({ calendarId: 'x', email: 'sa@p.iam.gserviceaccount.com', key: 'a\nb' });
  });
});

describe('events for the dashboard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is null without the settings', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', '');
    expect(await listEvents('2026-11-23T23:00:00.000Z', '2026-11-30T23:00:00.000Z')).toBeNull();
  });

  it('sends titles, times and places only, hides private events and leaves out the copies of Leave', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'team@example.com');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT', JSON.stringify({ client_email: 'hub@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
    const items = [
      { id: 'a', summary: 'Meeting Board', start: { dateTime: '2026-11-24T09:00:00+01:00' }, end: { dateTime: '2026-11-24T10:00:00+01:00' }, location: 'Rzeszów', description: 'secret' },
      { id: 'b', summary: 'Doctor', visibility: 'private', location: 'Clinic', start: { dateTime: '2026-11-25T10:00:00+01:00' }, end: { dateTime: '2026-11-25T11:00:00+01:00' } },
      { id: 'c', summary: 'Anna: urlop', start: { date: '2026-11-26' }, end: { date: '2026-11-27' }, extendedProperties: { private: { source: 'nutri-hub-leave' } } },
      { id: 'd', status: 'cancelled', start: { date: '2026-11-26' }, end: { date: '2026-11-27' } },
      { id: 'e', start: { date: '2026-11-27' }, end: { date: '2026-11-28' } },
    ];
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes('oauth2') ? { access_token: 't', expires_in: 3600 } : { items }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const events = await listEvents('2026-11-23T23:00:00.000Z', '2026-11-30T23:00:00.000Z');
    expect(events).toEqual([
      { id: 'a', title: 'Meeting Board', start: '2026-11-24T09:00:00+01:00', end: '2026-11-24T10:00:00+01:00', allDay: false, location: 'Rzeszów' },
      { id: 'b', title: 'Private event', start: '2026-11-25T10:00:00+01:00', end: '2026-11-25T11:00:00+01:00', allDay: false, location: null },
      { id: 'e', title: '(No title)', start: '2026-11-27', end: '2026-11-28', allDay: true, location: null },
    ]);
    const listUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(listUrl).toContain('singleEvents=true');
    expect(listUrl).toContain('calendars/team%40example.com/events');
  });
});
