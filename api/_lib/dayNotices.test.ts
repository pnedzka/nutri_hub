import { describe, expect, it } from 'vitest';
import { eventLine, morningDigest, type DigestPerson } from './dayNotices';

const person = (id: string, extra: Partial<DigestPerson> = {}): DigestPerson => ({
  id, email: `${id}@example.com`, name: id, role: 'user', apps: ['leave'], department: 'Trade', ...extra,
});
const day = '2026-11-25';
const away = [
  { userId: 'anna', name: 'Anna', halfDay: false },
  { userId: 'ewa', name: 'Ewa', halfDay: true },
];
const events = [
  { id: '1', title: 'Board meeting', start: '2026-11-25T09:30:00+01:00', end: '2026-11-25T10:30:00+01:00', allDay: false, location: null },
  { id: '2', title: 'Training', start: '2026-11-25', end: '2026-11-26', allDay: true, location: null },
];

describe('morningDigest (25.11.2026)', () => {
  it('tells people with Leave who is away, without the company events', () => {
    const notice = morningDigest(person('jan'), away, events, day, true)!;
    expect(notice.title).toBe('Today: 2 people away');
    expect(notice.body).toBe('Away: Anna, Ewa (half day).');
    expect(notice.email).toBeUndefined();
    expect(notice.to.map((r) => r.id)).toEqual(['jan']);
  });

  it('adds the company events for administrators, Board and Administration', () => {
    const notice = morningDigest(person('kasia', { department: 'Administration' }), away, events, day, true)!;
    expect(notice.title).toBe('Today: 2 people away, 2 events');
    expect(notice.body).toBe('Away: Anna, Ewa (half day). Events: 09:30 Board meeting; All day: Training.');
    expect(morningDigest(person('boss', { role: 'admin', apps: [] }), [], events, day, true)!.title).toBe('Today: 2 events');
  });

  it('leaves out the person themselves, and says nothing to someone away all day or when nothing happens', () => {
    expect(morningDigest(person('anna'), away, events, day, true)).toBeNull();
    expect(morningDigest(person('ewa'), away, null, day, true)!.body).toBe('Away: Anna.');
    expect(morningDigest(person('jan'), [], events, day, true)).toBeNull();
    expect(morningDigest(person('jan', { apps: [] }), away, null, day, true)).toBeNull();
    expect(morningDigest(person('jan'), away, null, day, false)).toBeNull();
  });

  it('writes an event that started earlier with its end', () => {
    expect(eventLine({ id: '3', title: 'Trip', start: '2026-11-24T08:00:00+01:00', end: '2026-11-25T11:00:00+01:00', allDay: false, location: null }, day)).toBe('Until 11:00: Trip');
  });
});
