import { describe, expect, it } from 'vitest';
import { contractDocument, isoWeek } from './pdf';

describe('isoWeek', () => {
  it('counts ISO weeks', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-11-23')).toBe(48);
    expect(isoWeek('2027-01-01')).toBe(53);
  });
});

describe('contractDocument', () => {
  const contract = {
    id: '12-S-MS-2026', type: 'S', status: 'admin_review', submissionDate: '2026-11-20', currency: 'EUR', amountNet: 9000,
    signedBy: null,
    data: {
      party: { companyName: 'Example GmbH', vatId: 'DE1', contactFirstName: 'Anna', contactLastName: 'Muster', contactPosition: '', email: 'a@e.com', phone: '1', street: 'S 1', postalCode: '1', city: 'Berlin', country: 'DE' },
      products: [{ name: 'Whey', productId: null, cnCode: '04041048', quantity: 2, unit: 'MT', unitPrice: 4.5, priceUnit: 'KG' }],
      delivery: { incoterm: 'DAP', byAir: false, street: 'S 1', postalCode: '1', city: 'Berlin', country: 'DE', dateFrom: '2026-12-01', dateTo: '2026-12-01', instructions: '', contactName: '', contactEmail: '', contactPhone: '' },
      payment: { prepaymentPercent: 100, days: 0, from: 'delivery', factoring: true, notes: '' },
      documents: ['Invoice', 'COA'],
    },
  } as never;

  it('marks an unsigned contract as a draft and adds the factoring clause', () => {
    const doc = contractDocument(contract, {});
    expect(doc.watermark).toBeTruthy();
    const text = JSON.stringify(doc.content);
    expect(text).toContain('SALES CONTRACT');
    expect(text).toContain('Factoring');
    expect(text).toContain('9 000.00 EUR');
    expect(text).toContain('General Terms and Conditions of Sale');
  });

  it('puts the signer in "Represented by" once signed', () => {
    const doc = contractDocument({ ...(contract as object), signedBy: { name: 'Marcin Niećko', title: 'Sales Director', email: 'm', at: '' } } as never, {});
    expect(doc.watermark).toBeUndefined();
    expect(JSON.stringify(doc.content)).toContain('Marcin Niećko – Sales Director');
  });
});
