import { describe, expect, it } from 'vitest';
import { LAYOUT_2025, LAYOUT_2025_ROWS, LAYOUT_2026, LAYOUT_2026_ROWS, type ExpectedRow } from './tmobile.fixtures';
import { InvoiceParseError, dataMegabytes, durationSeconds, linesFromPages, parseTMobileInvoice, type TextItem, type UsageRow } from './tmobile';

const rows = (usage: UsageRow[]): ExpectedRow[] =>
  usage.map((u) => [u.msisdn, u.kind, u.category, u.roamingOperator, u.eventCount, u.durationS, u.dataMb, u.paidDurationS, u.paidDataMb, u.paidCount, u.netAmount]);

const problemsOf = (lines: string[]): string[] => {
  try {
    parseTMobileInvoice(lines);
  } catch (error) {
    if (error instanceof InvoiceParseError) return error.problems;
    throw error;
  }
  return [];
};

describe('parseTMobileInvoice', () => {
  it('reads an invoice in the layout from 2026 like the reference script', () => {
    const invoice = parseTMobileInvoice(LAYOUT_2026.split('\n'));
    expect(invoice).toMatchObject({
      invoiceNumber: '509912345626',
      customerNumber: '1.99999999',
      periodStart: '2026-03-02',
      periodEnd: '2026-04-01',
      issueDate: '2026-04-02',
      numbers: ['500100101', '500100102', '500100103'],
    });
    expect(rows(invoice.usage)).toEqual(LAYOUT_2026_ROWS);
  });

  it('reads an invoice in the layout from before 2026 like the reference script', () => {
    const invoice = parseTMobileInvoice(LAYOUT_2025.split('\n'));
    expect(invoice).toMatchObject({
      invoiceNumber: '501234567826',
      periodStart: '2025-12-02',
      periodEnd: '2026-01-01',
      issueDate: '2026-01-02',
      numbers: ['500200201', '500200202'],
    });
    expect(rows(invoice.usage)).toEqual(LAYOUT_2025_ROWS);
  });

  it('keeps roaming networks across a page break and names premium services with their group', () => {
    const { usage } = parseTMobileInvoice(LAYOUT_2026.split('\n'));
    expect(usage.find((u) => u.category === 'Wychodzące roamingowe MMS')).toMatchObject({ kind: 'sms_roaming', roamingOperator: 'T-Mobile Austria' });
    expect(usage.find((u) => u.category === 'SMS Premium 7353')).toMatchObject({ kind: 'premium', roamingOperator: null, paidCount: 1, netAmount: 3 });
  });

  it('stops on a line of a usage table it does not understand', () => {
    const lines = LAYOUT_2026.split('\n');
    lines.splice(lines.indexOf('SMS krajowy  15  0  0,00'), 0, 'SMS krajowy  piętnaście  0,00');
    expect(problemsOf(lines)).toEqual([expect.stringContaining('1 line(s) of the usage tables were not understood, e.g. "SMS krajowy  piętnaście  0,00"')]);
  });

  it('stops when the charges summary and the detailed part list different numbers', () => {
    const lines = LAYOUT_2026.split('\n').filter((l) => !l.startsWith('500100103  '));
    expect(problemsOf(lines)).toEqual([expect.stringContaining('not in the summary: 500100103')]);
  });

  it('stops when a category appears twice for a number', () => {
    const lines = LAYOUT_2026.split('\n');
    lines.splice(lines.indexOf('SMS krajowy  15  0  0,00'), 0, 'SMS krajowy  1  0  0,00');
    expect(problemsOf(lines)).toEqual([expect.stringContaining('"SMS krajowy" appears twice for 500100101')]);
  });

  it('stops on a document that is not an invoice', () => {
    expect(problemsOf(['Umowa najmu', 'Numer Klienta: 1.2'])).toEqual([
      'The invoice number was not found.',
      'The billing period was not found.',
      'The issue date was not found.',
      'Is this a T-Mobile invoice?',
    ]);
  });
});

describe('units', () => {
  it('reads durations and data', () => {
    expect(durationSeconds('160 min 3 s')).toBe(9603);
    expect(durationSeconds('45 s')).toBe(45);
    expect(durationSeconds('12 min')).toBe(720);
    expect(durationSeconds('0s')).toBe(0);
    expect(durationSeconds('0')).toBeNull();
    expect(durationSeconds('3 MB')).toBeNull();
    expect(dataMegabytes('10913,574 MB')).toBe(10913.574);
    expect(dataMegabytes('0 MB')).toBe(0);
    expect(dataMegabytes('45 s')).toBeNull();
  });
});

describe('linesFromPages', () => {
  const item = (str: string, x: number, y: number, width: number): TextItem => ({ str, transform: [8, 0, 0, 8, x, y], width });
  // Text turned 90° anticlockwise: it runs upwards, so a line further right on the page comes later.
  const sideways = (str: string, x: number, y: number, width: number): TextItem => ({ str, transform: [0, 6, -6, 0, x, y], width });

  it('puts two spaces between columns and one inside a column, top to bottom', () => {
    const lines = linesFromPages([
      [
        item('Połączenia do sieci Orange', 62.4, 500, 80),
        item(' ', 142.4, 500, 10),
        item('20', 259, 500.4, 7.6),
        item('45 min', 322, 500, 20),
        item('50 s', 344, 500, 12),
        item('0,00', 517, 499.2, 13),
        item('POŁĄCZENIA', 51, 511.6, 50),
        item('608378333', 61, 400, 61.5),
        item('– MAGENTA', 124.5, 400, 60),
      ],
      [item('str. 4', 51, 30, 20)],
    ]);
    expect(lines).toEqual(['POŁĄCZENIA', 'Połączenia do sieci Orange  20  45 min 50 s  0,00', '608378333 – MAGENTA', 'str. 4']);
  });

  it('reads a sideways table in its own direction, before the rest of the page', () => {
    const lines = linesFromPages([
      [
        item('500100101 – MAGENTA', 61, 300, 100),
        sideways('500100101', 120, 40, 40),
        sideways('85,00 zł', 120, 200, 25),
        sideways('500100102', 132, 40, 40),
        sideways('55,00 zł', 132, 200, 25),
      ],
    ]);
    expect(lines).toEqual(['500100101  85,00 zł', '500100102  55,00 zł', '500100101 – MAGENTA']);
  });
});
