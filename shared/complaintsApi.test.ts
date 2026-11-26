import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  amount,
  cleanComplaint,
  cleanDetails,
  cleanStatusChange,
  complaintNumber,
  contractTypeOf,
  isStale,
  legacyStatus,
  maySee,
  money,
  nextStatuses,
  normalizeContractId,
  type Complaint,
  type Viewer,
} from './complaintsApi';

const ada = { email: 'ada@np.co', name: 'Ada Admin' };
const tom = { email: 'tom@np.co', name: 'Tom Trader' };
const pia = { email: 'pia@np.co', name: 'Pia Purchase' };
const out = { email: 'other@np.co', name: 'Other' };

const complaint = (patch: Partial<Complaint> = {}) =>
  ({ status: 'open', createdBy: tom, handler: tom, trader: tom, purchaseOwner: pia, ...patch }) as Complaint;

const v = (p: { email: string }, isComplaintAdmin = false): Viewer => ({ email: p.email, isComplaintAdmin });

describe('who sees a complaint', () => {
  it('participants and administration see it, others do not', () => {
    const c = complaint();
    expect(maySee(c, v(tom))).toBe(true);
    expect(maySee(c, v({ email: 'PIA@np.co' }))).toBe(true);
    expect(maySee(c, v(ada, true))).toBe(true);
    expect(maySee(c, v(out))).toBe(false);
    expect(allowedActions(c, v(out))).toEqual([]);
  });
});

describe('what a person may do', () => {
  it('the handler edits and moves the status; others only comment and attach', () => {
    const c = complaint({ createdBy: tom, handler: ada });
    expect(allowedActions(c, v(ada))).toEqual(['comment', 'attach', 'edit', 'status']);
    expect(allowedActions(c, v(pia))).toEqual(['comment', 'attach']);
  });

  it('the person who registered it may cancel it only while open; administration until it is closed', () => {
    expect(allowedActions(complaint(), v(tom))).toContain('cancel');
    expect(allowedActions(complaint({ status: 'investigating' }), v(tom))).not.toContain('cancel');
    expect(allowedActions(complaint({ status: 'resolved' }), v(ada, true))).toContain('cancel');
    expect(allowedActions(complaint({ status: 'closed' }), v(ada, true))).not.toContain('cancel');
  });

  it('only administration assigns the handler', () => {
    expect(allowedActions(complaint(), v(ada, true))).toContain('assign');
    expect(allowedActions(complaint(), v(tom))).not.toContain('assign');
  });

  it('a cancelled complaint can only get comments', () => {
    expect(allowedActions(complaint({ status: 'cancelled' }), v(ada, true))).toEqual(['comment']);
    expect(nextStatuses(complaint({ status: 'cancelled' }), v(ada, true))).toEqual([]);
  });

  it('steps can be skipped and a closed complaint can be reopened', () => {
    expect(nextStatuses(complaint(), v(tom))).toEqual(['investigating', 'with_supplier', 'resolved']);
    expect(nextStatuses(complaint({ status: 'closed' }), v(ada, true))).toEqual(['investigating']);
    expect(nextStatuses(complaint(), v(pia))).toEqual([]);
  });
});

describe('the form', () => {
  it('normalizes contract numbers and checks their type', () => {
    expect(normalizeContractId(' 64-s-db-2026 ')).toBe('64-S-DB-2026');
    expect(contractTypeOf('64-S-DB-2026')).toBe('S');
    expect(contractTypeOf('100-P-DB-2026')).toBe('P');
    expect(contractTypeOf('R/2026/10/015')).toBeNull();
    const { problems } = cleanComplaint({ salesContractId: '100-P-DB-2026', purchaseContractId: '64-S-DB-2026', description: 'Mould under the wrap' });
    expect(problems.map((p) => p.field)).toEqual(['salesContractId', 'purchaseContractId']);
  });

  it('accepts a minimal complaint and keeps a quantity with a comma', () => {
    const { complaint: c, problems } = cleanComplaint({ salesContractId: '64-s-db-2026', description: 'One pallet with mould.', quantityKg: '735,5', type: 'packaging' });
    expect(problems).toEqual([]);
    expect(c).toMatchObject({ salesContractId: '64-S-DB-2026', purchaseContractId: '', type: 'packaging', quantityKg: 735.5, clientResponseDue: null });
  });

  it('needs a description and a numeric quantity', () => {
    const { problems } = cleanComplaint({ salesContractId: '64-S-DB-2026', description: 'short', quantityKg: 'lots' });
    expect(problems.map((p) => p.field)).toEqual(['quantityKg', 'description']);
  });

  it('cleans the handler\'s fields; amounts are optional', () => {
    const { details, problems } = cleanDetails({ clientClaimed: '1 200,50', clientCurrency: 'PLN', supplierCurrency: 'XYZ', supplierReportedOn: '2026-11-20', clientResponseDue: 'soon' });
    expect(problems).toEqual([]);
    expect(details).toMatchObject({ clientClaimed: 1200.5, clientCurrency: 'PLN', supplierCurrency: 'EUR', supplierClaimed: null, supplierReportedOn: '2026-11-20', clientResponseDue: null });
    expect(cleanDetails({ supplierAccepted: 'abc' }).problems[0].field).toBe('supplierAccepted');
  });

  it('a resolved complaint needs its outcome and settlement', () => {
    expect(cleanStatusChange({ to: 'resolved' }).problems.map((p) => p.field)).toEqual(['outcome', 'settlement']);
    expect(cleanStatusChange({ to: 'resolved', outcome: 'accepted', settlement: 'credit_note' }).problems).toEqual([]);
    expect(cleanStatusChange({ to: 'cancelled' }).problems.map((p) => p.field)).toEqual(['to']);
  });
});

describe('helpers', () => {
  it('numbers complaints per year', () => {
    expect(complaintNumber(2026, 7)).toBe('C-2026-007');
  });

  it('reads amounts', () => {
    expect(amount('')).toBeNull();
    expect(amount('12,5')).toBe(12.5);
    expect(amount('-3')).toBeNaN();
    expect(money(1250.5, 'EUR')).toBe('1 250.5 EUR');
  });

  it('flags active complaints without a change for a week', () => {
    const now = new Date('2026-11-25T10:00:00Z');
    expect(isStale({ status: 'open', updatedAt: '2026-11-17T10:00:00Z' }, now)).toBe(true);
    expect(isStale({ status: 'open', updatedAt: '2026-11-20T10:00:00Z' }, now)).toBe(false);
    expect(isStale({ status: 'closed', updatedAt: '2026-01-01T10:00:00Z' }, now)).toBe(false);
  });

  it('maps the old intranet statuses', () => {
    expect(legacyStatus('New')).toBe('open');
    expect(legacyStatus('Closed')).toBe('closed');
    expect(legacyStatus('Awaiting Supplier Decision')).toBe('with_supplier');
  });
});
