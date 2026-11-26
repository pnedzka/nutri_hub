import { describe, expect, it } from 'vitest';
import type { AppId } from '../../shared/access';
import { approversOf, canDecide, mailedApprovers, managesLeave, seesType } from './leave';

const settings = { managerId: 'boss', annualDays: 26, startYear: 2026, carriedOver: 0 };
const user = (id: string, isAdmin = false, apps: AppId[] = ['leave']) => ({ id, email: `${id}@example.com`, name: id, isAdmin, apps });
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

describe('mailedApprovers (25.11.2026)', () => {
  const people = [user('anna'), user('boss'), user('director'), user('admin', true)];
  const mailed = (type: string, ownerSettings: typeof settings | undefined) => {
    const deciders = { type, tripApprovers: trips };
    return mailedApprovers(approversOf('anna', ownerSettings, people, deciders), ownerSettings, deciders);
  };

  it('e-mails the manager (and the trip approvers for a trip), not the administrators', () => {
    expect(mailed('vacation', settings)).toEqual(['boss']);
    expect(mailed('business_trip', settings)).toEqual(['boss', 'director']);
  });

  it('e-mails the administrators when nobody else decides', () => {
    expect(mailed('vacation', undefined)).toEqual(['admin']);
    expect(mailed('business_trip', undefined)).toEqual(['director']);
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

describe('Leave administration (leave-admin, 25.11.2026)', () => {
  const hr = user('hr', false, ['leave', 'leave-admin']);

  it('manages leave without being an administrator', () => {
    expect(managesLeave(hr)).toBe(true);
    expect(managesLeave(user('admin', true, []))).toBe(true);
    expect(managesLeave(user('anna'))).toBe(false);
  });

  it("sees the type of everyone's leave, but does not decide on requests (only managers and admins)", () => {
    expect(seesType(hr, 'anna', settings, { type: 'sick' })).toBe(true);
    expect(canDecide(hr, settings, { type: 'vacation' })).toBe(false);
    expect(canDecide(hr, undefined, { type: 'vacation' })).toBe(false);
    expect(canDecide(user('boss'), settings, { type: 'vacation' })).toBe(true);
  });

  it('is not among the approvers and gets no request e-mails', () => {
    const people = [user('anna'), user('boss'), hr, user('admin', true)];
    const deciders = { type: 'vacation', tripApprovers: trips };
    expect(approversOf('anna', settings, people, deciders).map((p) => p.id)).toEqual(['boss', 'admin']);
    expect(mailedApprovers(approversOf('anna', undefined, people, deciders), undefined, deciders)).toEqual(['admin']);
  });
});
