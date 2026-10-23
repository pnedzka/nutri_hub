import { describe, expect, it } from 'vitest';
import { CallsError, callTarget, isCountedCall, leaveDaysIn, matchNumbers, msisdnOf, personCalls, validateInvoice, type KpiRow } from './calls';
import { LAYOUT_2026 } from './tmobile.fixtures';
import { parseTMobileInvoice } from './tmobile';

describe('msisdnOf', () => {
  it('takes the last 9 digits of a phone number however it is typed', () => {
    expect(msisdnOf('+48 500 100 101')).toBe('500100101');
    expect(msisdnOf('0048500100101')).toBe('500100101');
    expect(msisdnOf('500-100-101')).toBe('500100101');
    expect(msisdnOf('12 345')).toBeNull();
    expect(msisdnOf(null)).toBeNull();
  });
});

describe('matchNumbers', () => {
  const people = [
    { id: 'a', name: 'Zofia Nowak', mobile: '+48 500 100 101' },
    { id: 'b', name: 'Adam Kowalski', mobile: '500100102' },
    { id: 'c', name: 'Ewa Lis', mobile: '500 100 104' },
    { id: 'd', name: 'Jan Lis', mobile: '+48500100104' },
    { id: 'e', name: 'No phone', mobile: null },
  ];

  it('finds the employees by their mobile numbers and skips the other numbers', () => {
    expect(matchNumbers(['500100101', '500100102', '500100103', '500100104'], people)).toEqual({
      matched: [
        { msisdn: '500100102', profileId: 'b', name: 'Adam Kowalski' },
        { msisdn: '500100101', profileId: 'a', name: 'Zofia Nowak' },
      ],
      skipped: ['500100103'],
      ambiguous: ['500100104'],
    });
  });
});

describe('validateInvoice', () => {
  const invoice = parseTMobileInvoice(LAYOUT_2026.split('\n'));

  it('accepts what the parser gives', () => {
    expect(validateInvoice(JSON.parse(JSON.stringify(invoice)))).toEqual(invoice);
  });

  it('rejects invalid data', () => {
    const broken = (change: (copy: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(invoice));
      change(copy);
      return () => validateInvoice(copy);
    };
    expect(() => validateInvoice(null)).toThrow(CallsError);
    expect(broken((c) => (c.invoiceNumber = '12; drop'))).toThrow('The invoice number is invalid.');
    expect(broken((c) => (c.periodEnd = '2026-02-30'))).toThrow('A date of the invoice is invalid.');
    expect(broken((c) => (c.periodEnd = '2026-01-01'))).toThrow('The billing period ends before it starts.');
    expect(broken((c) => (c.numbers = ['5001'])))
      .toThrow('The list of phone numbers is invalid.');
    expect(broken((c) => ((c.usage as KpiRow[])[0].kind = 'fax' as never))).toThrow('Usage row 1 is invalid.');
    expect(broken((c) => ((c.usage as { msisdn: string }[])[0].msisdn = '999999999'))).toThrow('Usage row 1 is invalid.');
    expect(broken((c) => (c.usage as unknown[]).push((c.usage as unknown[])[0]))).toThrow('repeats a category');
  });
});

describe('callTarget', () => {
  it('sorts domestic calls like the owner\'s report', () => {
    expect(callTarget('Połączenia do sieci Orange')).toBe('mobile');
    expect(callTarget('Połączenia do Centernet')).toBe('mobile');
    expect(callTarget('Połączenia do sieci stacjonarnych')).toBe('landline');
    expect(callTarget('Połączenia międzynarodowe')).toBe('international');
    expect(callTarget('Połączenia inne')).toBe('other');
  });
});

describe('leaveDaysIn', () => {
  it('counts the working days of approved leave inside the period only', () => {
    // Period 2 Mar – 1 Apr 2026; leave 26 Feb – 4 Mar (Mon 2, Tue 3, Wed 4 inside) and a half day on Fri 13 Mar.
    const leave = [
      { start: '2026-02-26', end: '2026-03-04', halfDay: false },
      { start: '2026-03-13', end: '2026-03-13', halfDay: true },
      { start: '2026-04-02', end: '2026-04-03', halfDay: false },
    ];
    expect(leaveDaysIn(leave, '2026-03-02', '2026-04-01')).toBe(3.5);
  });
});

describe('personCalls', () => {
  const person = { profileId: 'a', name: 'Zofia Nowak', jobTitle: 'Trader', msisdn: '500100101' };
  const row = (kind: KpiRow['kind'], category: string, eventCount: number, durationS: number | null, netAmount = 0, dataMb: number | null = null): KpiRow => ({
    kind,
    category,
    eventCount,
    durationS,
    dataMb,
    netAmount,
  });

  it('leaves "Połączenia inne" out of the calls', () => {
    expect(isCountedCall({ kind: 'voice_out', category: 'Połączenia inne' })).toBe(false);
    expect(isCountedCall({ kind: 'voice_out', category: 'Połączenia do sieci Play' })).toBe(true);
    expect(isCountedCall({ kind: 'voice_out_roaming', category: 'Wychodzące połączenia roamingowe' })).toBe(true);
    expect(isCountedCall({ kind: 'voice_in_roaming', category: 'Przychodzące połączenia roamingowe' })).toBe(false);
  });

  it('adds up outgoing calls, their kinds, SMS, data and cost', () => {
    const kpis = personCalls(
      person,
      [
        row('voice_out', 'Połączenia do sieci Orange', 12, 1530),
        row('voice_out', 'Połączenia do sieci stacjonarnych', 3, 45),
        row('voice_out', 'Połączenia międzynarodowe', 5, 720, 9.4),
        row('voice_out', 'Połączenia inne', 7, 300, 0.5),
        row('voice_out_roaming', 'Wychodzące połączenia roamingowe', 4, 375),
        row('voice_in_roaming', 'Przychodzące połączenia roamingowe', 2, 182),
        row('sms', 'SMS krajowy', 15, null),
        row('sms_roaming', 'Wychodzące roamingowe SMS', 3, null),
        row('mms', 'MMS krajowy', 1, null),
        row('data', 'Internet wysłano i odebrano', 42, null, 0, 1234.567),
        row('data_roaming', 'Internet roaming odebrano', 1, null, 0.04, 1.074),
        row('premium', 'SMS Premium 7353', 1, null, 3),
      ],
      20,
      2,
    );
    expect(kpis).toEqual({
      ...person,
      calls: 24,
      seconds: 2670,
      averageSeconds: 111,
      mobile: 12,
      landline: 3,
      international: 5,
      roaming: 4,
      other: 0,
      sms: 18,
      dataMb: 1235.641,
      costNet: 12.94,
      leaveDays: 2,
      callsPerDay: 1.33,
    });
  });

  it('gives no average without calls and no daily rate when the person was away all period', () => {
    const kpis = personCalls(person, [], 20, 20);
    expect(kpis).toMatchObject({ calls: 0, averageSeconds: null, callsPerDay: null });
    expect(personCalls(person, [], 20, 0).callsPerDay).toBe(0);
  });
});
