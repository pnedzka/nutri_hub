import { describe, expect, it } from 'vitest';
import { approversOf, canDecide, seesType } from './leave';

const settings = { managerId: 'boss', annualDays: 26, startYear: 2026, carriedOver: 0 };
const user = (id: string, isAdmin = false) => ({ id, email: `${id}@example.com`, name: id, isAdmin });
const trips = new Set(['director']);

describe('business trip approvers', () => {
  it('decide on business trips only', () => {
    expect(canDecide(user('director'), settings, { type: 'business_trip', tripApprovers: trips })).toBe(true);
    expect(canDecide(user('director'), settings, { type: 'vacation', tripApprovers: trips })).toBe(false);
    expect(canDecide(user('director'), settings)).toBe(false);
    expect(canDecide(user('someone'), settings, { type: 'business_trip', tripApprovers: trips })).toBe(false);
  });

  it('keep the manager and the administrators', () => {
    expect(canDecide(user('boss'), settings, { type: 'business_trip', tripApprovers: trips })).toBe(true);
    expect(canDecide(user('admin', true), undefined, { type: 'vacation' })).toBe(true);
  });

  it('see the type of a business trip, not of other leave', () => {
    expect(seesType(user('director'), 'anna', settings, { type: 'business_trip', tripApprovers: trips })).toBe(true);
    expect(seesType(user('director'), 'anna', settings, { type: 'sick', tripApprovers: trips })).toBe(false);
  });

  it('are told about business trip requests, never about their own', () => {
    const people = [user('anna'), user('boss'), user('director'), user('admin', true), user('other')];
    const ids = (type: string, owner = 'anna') => approversOf(owner, settings, people, { type, tripApprovers: trips }).map((p) => p.id);
    expect(ids('business_trip')).toEqual(['boss', 'director', 'admin']);
    expect(ids('vacation')).toEqual(['boss', 'admin']);
    expect(ids('business_trip', 'director')).toEqual(['boss', 'admin']);
  });
});

describe('settingsFor', () => {
  it('uses the saved settings, or the defaults of the year asked with the manager', async () => {
    const { settingsFor } = await import('./leave');
    const saved = { managerId: 'boss', annualDays: 20, startYear: 2024, carriedOver: 3 };
    expect(settingsFor(saved, 2026)).toBe(saved);
    expect(settingsFor(undefined, 2025)).toEqual({ managerId: null, annualDays: 26, startYear: 2025, carriedOver: 0 });
  });
});
