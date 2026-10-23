// T-Mobile Polska business invoices (PDF) → monthly usage per phone number, for Phone calls analyser (/calls).
//
// The browser reads the PDF with pdfjs-dist, rebuilds the text lines from the positions of the text items
// (linesFromPages) and parses them here; the server gets only the small JSON. A port of the owner's
// parse_tmobile_invoice.py (input: `pdftotext -layout`), with the same grammar: sections, roaming operators on a line
// of their own above their rows, rows "category | count | units (time or MB) | paid | net amount". Columns are
// separated by two or more spaces, as in pdftotext's layout mode.
//
// The invoice gives monthly totals per number, not single calls. Domestic incoming calls are not on it at all, and a
// number without a "ZESTAWIENIE WYKONANYCH POŁĄCZEŃ" block made no calls.

export const USAGE_KINDS = [
  'voice_out',
  'voice_out_roaming',
  'voice_in_roaming',
  'sms',
  'mms',
  'sms_roaming',
  'data',
  'data_roaming',
  'premium',
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export interface UsageRow {
  msisdn: string;
  kind: UsageKind;
  /** The category as printed, e.g. "Połączenia do sieci Orange"; premium rows get their group: "SMS Premium 7353". */
  category: string;
  /** Roaming rows: the foreign network, e.g. "T-Mobile Austria". */
  roamingOperator: string | null;
  eventCount: number;
  durationS: number | null;
  dataMb: number | null;
  paidDurationS: number | null;
  paidDataMb: number | null;
  paidCount: number | null;
  netAmount: number;
}

export interface ParsedInvoice {
  invoiceNumber: string;
  customerNumber: string | null;
  /** ISO dates (YYYY-MM-DD). */
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  /** Every number with a block of its own on the invoice (9 digits), sorted. */
  numbers: string[];
  usage: UsageRow[];
}

/** The invoice could not be read reliably; `problems` say why, for the administrator. */
export class InvoiceParseError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join(' '));
    this.problems = problems;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Text lines from the PDF

/** A text item of a page as pdfjs-dist's getTextContent() gives it; transform is [a, b, c, d, x, y]. */
export interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

/** Items closer than this (in points) vertically are on one line; lines on the invoice are ~11.6 points apart. */
const SAME_LINE = 3;
/** Gaps narrower than this (in points) are spaces inside a column; wider gaps separate columns. */
const COLUMN_GAP = 6;

interface Placed {
  text: string;
  /** Position along the text's own direction and across it (upwards), so sideways text reads like any other. */
  x: number;
  y: number;
  width: number;
}

/** Lines of items that run in one direction, top to bottom. */
function linesOf(items: Placed[]): string[] {
  const rows: Placed[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= SAME_LINE) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const item of row) {
      const gap = item.x - end;
      text += text === '' || gap < 1 ? '' : gap < COLUMN_GAP ? ' ' : '  ';
      text += item.text;
      end = item.x + item.width;
    }
    return text;
  });
}

/**
 * Text lines of the pages, top to bottom, like `pdftotext -layout`: a single space inside a column and two between
 * columns, so the parser can split columns on two or more spaces. Text set sideways (the charges summary of older
 * invoices is a landscape table on a portrait page) is read in its own direction and comes first on its page.
 */
export function linesFromPages(pages: TextItem[][]): string[] {
  const lines: string[] = [];
  for (const items of pages) {
    const byDirection = new Map<number, Placed[]>();
    for (const item of items) {
      const text = item.str.trim();
      if (!text) continue;
      const [a, b, , , x, y] = item.transform;
      const quarter = (((Math.round(Math.atan2(b, a) / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
      const cos = [1, 0, -1, 0][quarter];
      const sin = [0, 1, 0, -1][quarter];
      const placed = { text, x: x * cos + y * sin, y: -x * sin + y * cos, width: item.width };
      byDirection.set(quarter, [...(byDirection.get(quarter) ?? []), placed]);
    }
    for (const quarter of [1, 2, 3, 0]) if (byDirection.has(quarter)) lines.push(...linesOf(byDirection.get(quarter)!));
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------
// Parser

const SECTIONS = [
  'INTERNET POŁĄCZENIA',
  'POŁĄCZENIA',
  'ROAMING MIĘDZYNARODOWY - INTERNET',
  'ROAMING MIĘDZYNARODOWY',
  'WIADOMOŚCI SMS/MMS',
  'USŁUGI PREMIUM I INFOLINIE',
] as const;
type Section = (typeof SECTIONS)[number];

/** Sections where a line with one column names a roaming network or a premium service group. */
const GROUPED: readonly Section[] = ['ROAMING MIĘDZYNARODOWY', 'ROAMING MIĘDZYNARODOWY - INTERNET', 'USŁUGI PREMIUM I INFOLINIE'];

/** Page headers and footers, column headings and the legal notes under premium services. */
const SKIP = /^(Numer Klienta|KATEGORIA|LICZBA|ROZLICZENIOWYCH|str\.|ZESTAWIENIE WYKONANYCH|Strona podmiotowa|Klient ma prawo|\(opłata)/;
const NUMBER_BLOCK = /^(\d{9}) – /;
/** The charges of a number (A1, A2, A3, their summary "A1+A3") and the instalments (B) end the usage. */
const CHARGES = /^(A[123](\+A[123])*|B)(\s{2,}|$)/;

const COUNT = /^\d+$/;
const AMOUNT = /^-?\d+(?:,\d+)?$/;
const DURATION = /^(?:(\d+)\s*min)?\s*(?:(\d+)\s*s)?$/;
const DATA = /^(\d+(?:,\d+)?)\s*MB$/;

const plNumber = (value: string) => Number(value.replace(/\s/g, '').replace(',', '.'));

/** "12 min 5 s", "45 s", "0s" → seconds; null when the text is not a duration. */
export function durationSeconds(text: string): number | null {
  const m = DURATION.exec(text.trim());
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

/** "10913,574 MB" → 10913.574; null when the text is not an amount of data. */
export function dataMegabytes(text: string): number | null {
  const m = DATA.exec(text.trim());
  return m ? plNumber(m[1]) : null;
}

const isUnits = (text: string) => durationSeconds(text) !== null || dataMegabytes(text) !== null;

export function kindOf(section: Section, category: string): UsageKind {
  const c = category.toLowerCase();
  switch (section) {
    case 'INTERNET POŁĄCZENIA':
      return 'data';
    case 'ROAMING MIĘDZYNARODOWY - INTERNET':
      return 'data_roaming';
    case 'POŁĄCZENIA':
      return 'voice_out';
    case 'ROAMING MIĘDZYNARODOWY':
      if (c.includes('sms') || c.includes('mms')) return 'sms_roaming';
      return c.startsWith('przychodzące') ? 'voice_in_roaming' : 'voice_out_roaming';
    case 'WIADOMOŚCI SMS/MMS':
      return c.includes('mms') ? 'mms' : 'sms';
    default:
      return 'premium';
  }
}

const isoDate = (d: string, m: string, y: string) => `${y}-${m}-${d}`;

/** The columns of a line; the "i" (information) icons of the PDF are left out. */
const columns = (line: string) => line.split(/\s{2,}/).filter((p) => p && p !== 'i');

/**
 * Reads an invoice from its text lines. Stops with InvoiceParseError when the header is missing, a line of a usage
 * block is not understood, or the numbers in the charges summary differ from the numbers with a block: importing
 * half an invoice would give wrong KPIs without anyone noticing.
 */
export function parseTMobileInvoice(lines: string[]): ParsedInvoice {
  const text = lines.join('\n');
  const problems: string[] = [];

  const invoiceNumber = /Numer faktury:\s+(\d+)/.exec(text)?.[1];
  const customerNumber = /Numer Klienta:\s+([\d.]+)/.exec(text)?.[1] ?? null;
  const period = /Okres rozliczeniowy:\s+(\d\d)\.(\d\d)\.(\d{4})\s*–\s*(\d\d)\.(\d\d)\.(\d{4})/.exec(text);
  const issued = /Data wystawienia:\s+(\d\d)\.(\d\d)\.(\d{4})/.exec(text);
  if (!invoiceNumber) problems.push('The invoice number was not found.');
  if (!period) problems.push('The billing period was not found.');
  if (!issued) problems.push('The issue date was not found.');
  if (!invoiceNumber || !period || !issued) {
    throw new InvoiceParseError([...problems, 'Is this a T-Mobile invoice?']);
  }

  // Numbers in the charges summary: number, tariff, amounts in zł (no other line starts with a number and a gap).
  const charged = new Set<string>();
  for (const line of lines) {
    const m = /^(\d{9})\s{2,}\S.*zł$/.exec(line.trim());
    if (m) charged.add(m[1]);
  }
  const start = lines.findIndex((l) => NUMBER_BLOCK.test(l.trim()));

  const usage: UsageRow[] = [];
  const blocks: string[] = [];
  const unknown: string[] = [];
  let number: string | null = null;
  let section: Section | 'skip' | null = null;
  let group: string | null = null;

  for (const raw of start < 0 ? [] : lines.slice(start)) {
    const line = raw.trim();
    const block = NUMBER_BLOCK.exec(line);
    if (block) {
      number = block[1];
      blocks.push(number);
      section = null;
      group = null;
      continue;
    }
    if (number === null || !line || SKIP.test(line)) continue;
    if (line.startsWith('PODSUMOWANIE OPŁAT BEZ PRZYPISANEGO')) {
      number = null;
      continue;
    }
    if (line.startsWith('ZESTAWIENIE WYKORZYSTANIA')) {
      section = 'skip';
      continue;
    }
    const parts = columns(line);
    const heading = parts.join(' ');
    if ((SECTIONS as readonly string[]).includes(heading)) {
      section = heading as Section;
      group = null;
      continue;
    }
    if (CHARGES.test(line) || line.startsWith('ZESTAWIENIE')) {
      if (section !== 'skip') section = null;
      continue;
    }
    if (section === null || section === 'skip') continue;

    if (parts.length === 1 && GROUPED.includes(section)) {
      group = parts[0];
      continue;
    }
    const row = usageRow(number, section, group, parts);
    if (row) usage.push(row);
    else unknown.push(line);
  }

  if (blocks.length === 0) problems.push('No phone numbers were found in the detailed part of the invoice.');
  if (unknown.length) {
    problems.push(`${unknown.length} line(s) of the usage tables were not understood, e.g. "${unknown[0]}".`);
  }
  const numbers = [...new Set(blocks)].sort();
  if (numbers.length !== blocks.length) problems.push('A phone number has more than one block on the invoice.');
  const missing = [...charged].filter((n) => !numbers.includes(n));
  const extra = numbers.filter((n) => !charged.has(n));
  if (missing.length || extra.length) {
    problems.push(
      `The charges summary lists ${charged.size} number(s) and the detailed part ${numbers.length}` +
        (missing.length ? `; without details: ${missing.join(', ')}` : '') +
        (extra.length ? `; not in the summary: ${extra.join(', ')}` : '') +
        '.',
    );
  }
  const keys = new Set<string>();
  for (const row of usage) {
    const key = `${row.msisdn}|${row.category}|${row.roamingOperator ?? ''}`;
    if (keys.has(key)) {
      problems.push(`The category "${row.category}" appears twice for ${row.msisdn}.`);
      break;
    }
    keys.add(key);
  }
  if (problems.length) throw new InvoiceParseError(problems);

  return {
    invoiceNumber,
    customerNumber,
    periodStart: isoDate(period[1], period[2], period[3]),
    periodEnd: isoDate(period[4], period[5], period[6]),
    issueDate: isoDate(issued[1], issued[2], issued[3]),
    numbers,
    usage,
  };
}

/** One row of a usage table, or null when the columns do not fit "category | count | [units] | [paid] | net". */
function usageRow(msisdn: string, section: Section, group: string | null, parts: string[]): UsageRow | null {
  if (parts.length < 3 || parts.length > 5) return null;
  let category = parts[0];
  const [count, ...rest] = parts.slice(1);
  const net = rest.pop()!;
  if (!COUNT.test(count) || !AMOUNT.test(net)) return null;
  let units: string | null = null;
  let paid: string | null = null;
  if (rest.length === 2) [units, paid] = rest;
  else if (rest.length === 1) [paid] = rest;
  if (units !== null && !isUnits(units)) return null;
  if (paid !== null && !isUnits(paid) && !COUNT.test(paid)) return null;

  let operator = group;
  if (section === 'USŁUGI PREMIUM I INFOLINIE') {
    // A premium row is the service number under its group ("SMS Premium" / "7353"), or a category of its own.
    if (/^\d+$/.test(category)) category = `${group ?? 'Premium'} ${category}`;
    operator = null;
  }
  return {
    msisdn,
    kind: kindOf(section, category),
    category,
    roamingOperator: operator,
    eventCount: Number(count),
    durationS: units === null ? null : durationSeconds(units),
    dataMb: units === null ? null : dataMegabytes(units),
    paidDurationS: paid !== null && !paid.includes('MB') ? durationSeconds(paid) : null,
    paidDataMb: paid === null ? null : dataMegabytes(paid),
    paidCount: paid !== null && COUNT.test(paid) ? Number(paid) : null,
    netAmount: plNumber(net),
  };
}
