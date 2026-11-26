import { describe, expect, it } from 'vitest';
import type { Complaint } from '../../shared/complaintsApi.js';
import { planComplaintNotice, toNotice } from './complaintNotices.js';

const p = (name: string) => ({ email: `${name.toLowerCase()}@example.com`, name });
const TRADER = p('Tom');
const BUYER = p('Pat');
const ADMIN = p('Ada');

const complaint = (patch: Partial<Complaint> = {}): Complaint => ({
  id: 'C-2026-001', status: 'open', type: 'quality', salesContractId: '64-S-TT-2026', purchaseContractId: '100-P-TT-2026',
  clientName: 'Acme Foods GmbH', supplierName: 'Supplier Ltd', productName: 'Whey', handler: TRADER,
  createdAt: '2026-11-25T10:00:00Z', updatedAt: '2026-11-25T10:00:00Z', description: 'Lumps in two big bags.',
  trader: TRADER, purchaseOwner: BUYER, createdBy: TRADER, outcome: null, settlement: null, resolutionNotes: '', resolvedAt: null,
  legacyId: null, batchNumber: '', quantityKg: null, clientResponseDue: null, supplierRef: '', supplierReportedOn: null,
  clientClaimed: null, clientAgreed: null, clientCurrency: 'EUR', supplierClaimed: null, supplierAccepted: null, supplierCurrency: 'EUR',
  files: [], events: [], ...patch,
});

describe('planComplaintNotice', () => {
  it('R1: a new complaint goes to administration and the people of both contracts, with a Polish e-mail', () => {
    const plan = planComplaintNotice(complaint(), 'created', TRADER, [ADMIN.email.toUpperCase()])!;
    expect(plan.to.sort()).toEqual([ADMIN.email, BUYER.email, TRADER.email].sort());
    expect(plan.notice.email?.module).toBe('Reklamacje');
    expect(plan.notice.email?.details).toContainEqual(['Kontrakt zakupu', '100-P-TT-2026 (Supplier Ltd)']);
    expect(plan.notice.link).toBe('/complaints/C-2026-001');
  });

  it('R2: only the new handler hears about the assignment', () => {
    const plan = planComplaintNotice(complaint({ handler: ADMIN }), 'assigned', BUYER, [])!;
    expect(plan.to).toEqual([ADMIN.email]);
    expect(plan.notice.email?.title).toBe('Prowadzisz reklamację C-2026-001');
  });

  it('R3: a status change rings the bell; only "Resolved" sends an e-mail with the outcome', () => {
    const moved = planComplaintNotice(complaint({ status: 'with_supplier' }), 'status', TRADER, [ADMIN.email], { comment: 'Sent to the supplier.' })!;
    expect(moved.notice.email).toBeNull();
    expect(moved.notice.body).toBe('Sent to the supplier.');
    expect(moved.to).not.toContain(ADMIN.email);
    const resolved = planComplaintNotice(complaint({ status: 'resolved', outcome: 'partly_accepted', settlement: 'credit_note' }), 'status', TRADER, [])!;
    expect(resolved.notice.body).toBe('Partly accepted · Credit note');
    expect(resolved.notice.email?.lead).toContain('uznana częściowo, nota uznaniowa / korekta');
  });

  it('R4: comments and files ring the bell only', () => {
    const plan = planComplaintNotice(complaint(), 'comment', BUYER, [ADMIN.email], { comment: 'Photos attached.' })!;
    expect(plan.notice.email).toBeNull();
    expect(plan.to).toContain(ADMIN.email);
    expect(plan.notice.body).toBe('Photos attached.');
  });
});

describe('toNotice', () => {
  it('leaves out people without access to Complaints and unknown addresses', () => {
    const plan = planComplaintNotice(complaint(), 'created', TRADER, [ADMIN.email, 'gone@example.com'])!;
    const people = [
      { id: '1', ...TRADER, canSee: true },
      { id: '2', ...BUYER, canSee: false },
      { id: '3', ...ADMIN, canSee: true },
    ];
    const notice = toNotice(plan, people, '1');
    expect(notice.to.map((r) => r.id).sort()).toEqual(['1', '3']);
    expect(notice.actorId).toBe('1');
  });
});
