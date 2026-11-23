import { describe, expect, it } from 'vitest';
import {
  allowedActions,
  cleanContract,
  contractTotal,
  initialsOf,
  lineTotal,
  money,
  paymentText,
  prefillFromCompany,
  todoStatuses,
  usesContracts,
  type CompanyHit,
  type Viewer,
} from './contractsApi';

const valid = () => ({
  type: 'S',
  submissionDate: '2026-11-20',
  ownerEmail: 'm.swidnik@nutripartners.co',
  companyId: 7,
  party: {
    companyName: 'Example GmbH', vatId: 'de 123 456 789', contactFirstName: 'Anna', contactLastName: 'Muster', contactPosition: '',
    email: 'Anna@Example.com', phone: '+49 1', street: 'Hauptstr. 1', postalCode: '10115', city: 'Berlin', country: 'de',
  },
  currency: 'EUR',
  products: [{ name: 'Whey protein 80', productId: 3, quantity: '2', unit: 'MT', unitPrice: '4.5', priceUnit: 'KG' }],
  delivery: {
    incoterm: 'DAP', byAir: true, street: 'Lager 2', postalCode: '10115', city: 'Berlin', country: 'DE', dateFrom: '2026-12-01', dateTo: '2026-12-05',
    instructions: '', contactName: '', contactEmail: '', contactPhone: '',
  },
  payment: { prepaymentPercent: 30, days: 14, from: 'delivery', factoring: true, notes: '' },
  documents: ['COA', 'Invoice', 'Nonsense'],
});

describe('amounts', () => {
  it('converts weights and pieces', () => {
    expect(lineTotal({ quantity: 2, unit: 'MT', unitPrice: 4.5, priceUnit: 'KG' })).toBe(9000);
    expect(lineTotal({ quantity: 500, unit: 'KG', unitPrice: 3000, priceUnit: 'MT' })).toBe(1500);
    expect(lineTotal({ quantity: 2500, unit: 'PCS', unitPrice: 12, priceUnit: '1000PCS' })).toBe(30);
    expect(lineTotal({ quantity: 10, unit: 'PCS', unitPrice: 1, priceUnit: 'KG' })).toBeNull();
    expect(lineTotal({ quantity: 10, unit: 'KG', unitPrice: 1, priceUnit: 'PCS' })).toBeNull();
    expect(contractTotal([{ quantity: 1, unit: 'KG', unitPrice: 0.1, priceUnit: 'KG' }, { quantity: 1, unit: 'KG', unitPrice: 0.2, priceUnit: 'KG' }] as never)).toBe(0.3);
  });

  it('formats money with spaces', () => {
    expect(money(123456.5, 'EUR')).toBe('123 456.50 EUR');
  });

  it('writes the payment terms', () => {
    expect(paymentText({ prepaymentPercent: 100, days: 0, from: 'delivery' })).toBe('100% prepayment before shipment.');
    expect(paymentText({ prepaymentPercent: 0, days: 30, from: 'invoice' })).toBe('100% of the order value within 30 days from the invoice date.');
    expect(paymentText({ prepaymentPercent: 30, days: 14, from: 'delivery' })).toBe('30% prepayment before shipment, 70% within 14 days after delivery.');
  });
});

describe('initialsOf', () => {
  it('takes the first and last name without Polish letters', () => {
    expect(initialsOf('Mateusz Świdnik')).toBe('MS');
    expect(initialsOf('Łukasz Jan Żak')).toBe('LZ');
    expect(initialsOf('  Ola  ')).toBe('O');
  });
});

describe('cleanContract', () => {
  it('accepts and normalises a valid contract', () => {
    const { contract, problems } = cleanContract(valid(), '2026-11-23');
    expect(problems).toEqual([]);
    expect(contract.party.vatId).toBe('DE123456789');
    expect(contract.party.country).toBe('DE');
    expect(contract.party.email).toBe('anna@example.com');
    expect(contract.products[0]).toMatchObject({ quantity: 2, unitPrice: 4.5 });
    expect(contract.delivery.byAir).toBe(false); // only with CIP
    expect(contract.documents).toEqual(['Invoice', 'COA']);
  });

  it('finds the problems', () => {
    const raw = valid();
    raw.party.vatId = '';
    raw.submissionDate = '2026-12-24';
    raw.delivery.dateTo = '2026-11-30';
    raw.products[0].unit = 'PCS';
    raw.documents = [];
    const fields = cleanContract(raw, '2026-11-23').problems.map((p) => p.field);
    expect(fields).toEqual(expect.arrayContaining(['party.vatId', 'submissionDate', 'delivery.dateTo', 'products.0.priceUnit', 'documents']));
  });

  it('does not need a VAT ID outside the EU and zeroes days with full prepayment', () => {
    const raw = valid();
    raw.party.vatId = '';
    raw.party.country = 'US';
    raw.payment = { ...raw.payment, prepaymentPercent: 100, days: 999 };
    const { contract, problems } = cleanContract(raw, '2026-11-23');
    expect(problems).toEqual([]);
    expect(contract.payment.days).toBe(0);
  });
});

describe('who may do what', () => {
  const trader: Viewer = { email: 'trader@np.co', isContractAdmin: false, canSign: false, isBoard: false };
  const jadwiga: Viewer = { email: 'j@np.co', isContractAdmin: true, canSign: false, isBoard: false };
  const marcin: Viewer = { email: 'm@np.co', isContractAdmin: false, canSign: true, isBoard: false };
  const board: Viewer = { email: 'b@np.co', isContractAdmin: true, canSign: true, isBoard: true };
  const c = (status: string, boardRequired = false) => ({ status, ownerEmail: 'trader@np.co', boardRequired }) as never;

  it('follows the flow', () => {
    expect(allowedActions(c('admin_review'), jadwiga)).toEqual(['accept', 'return', 'cancel']);
    expect(allowedActions(c('admin_review'), trader)).toEqual(['cancel']);
    expect(allowedActions(c('admin_review'), marcin)).toEqual([]);
    expect(allowedActions(c('signature'), marcin)).toEqual(['sign', 'return']);
    expect(allowedActions(c('signature', true), marcin)).toEqual(['approve', 'return']);
    expect(allowedActions(c('board', true), marcin)).toEqual([]);
    expect(allowedActions(c('board', true), board)).toEqual(['sign', 'return', 'cancel']);
    expect(allowedActions(c('signed'), trader)).toEqual(['client_scan']);
    expect(allowedActions(c('returned'), trader)).toEqual(['edit', 'cancel']);
    expect(allowedActions(c('cancelled'), board)).toEqual([]);
  });

  it('lists what waits for each person', () => {
    expect(todoStatuses(trader)).toEqual([]);
    expect(todoStatuses(jadwiga)).toEqual(['admin_review']);
    expect(todoStatuses(board)).toEqual(['admin_review', 'signature', 'board']);
  });

  it('opens the module with any of its permissions', () => {
    expect(usesContracts({ role: 'user', apps: ['contracts-sign'] })).toBe(true);
    expect(usesContracts({ role: 'user', apps: ['news'] })).toBe(false);
    expect(usesContracts({ role: 'admin', apps: [] })).toBe(true);
  });
});

describe('prefillFromCompany', () => {
  const hit = (over: Partial<CompanyHit>): CompanyHit => ({ companyId: 1, name: 'ACME', vatId: 'PL1', country: 'PL', intranet: null, last: null, ...over });

  it('uses the intranet client card and skips its placeholders', () => {
    const { party, delivery } = prefillFromCompany(hit({
      intranet: {
        companyName: 'ACME Sp. z o.o.', vatId: 'PL 111', street: 'Polna 1', postalCode: '00-001', city: 'Warszawa', countryCode: 'pl',
        contactPersonFirstName: 'Jan', contactPersonLastName: 'Nowak', contactPersonPosition: '-', email: 'JAN@ACME.PL', phone: '1',
        savedAddresses: [{ street: 'Magazynowa 2', city: 'Łódź', postalCode: '90-001', countryCode: 'PL', deliveryBasis: 'fca', instructions: 'x', contactPersonFirstName: 'Ewa' }],
      },
    }));
    expect(party).toMatchObject({ companyName: 'ACME Sp. z o.o.', vatId: 'PL111', country: 'PL', contactPosition: '', email: 'jan@acme.pl' });
    expect(delivery).toMatchObject({ incoterm: 'FCA', street: 'Magazynowa 2', instructions: '', contactName: 'Ewa' });
  });

  it('prefers the last contract and leaves its dates out', () => {
    const last = { party: { companyName: 'From contract' }, delivery: { incoterm: 'EXW', dateFrom: '2026-01-01', dateTo: '2026-01-02' } } as never;
    const { party, delivery } = prefillFromCompany(hit({ last }));
    expect(party.companyName).toBe('From contract');
    expect(delivery).toMatchObject({ incoterm: 'EXW', dateFrom: '', dateTo: '' });
  });

  it('falls back to the name only', () => {
    expect(prefillFromCompany(hit({})).delivery).toBeNull();
    expect(prefillFromCompany(hit({})).party.companyName).toBe('ACME');
  });
});
