import { describe, expect, it } from 'vitest';
import { calendarConfig, eventId, eventTitle, toEvent } from './googleCalendar';

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
