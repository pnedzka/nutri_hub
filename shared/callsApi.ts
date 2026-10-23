// The API of Phone calls analyser (/api/admin/users?resource=calls, administrators only), shared by the server and
// the browser.
import type { ParsedInvoice } from './tmobile.js';

/** POST ?resource=calls&action=preview body; POST ?resource=calls body also has `fileName` and `replace`. */
export interface CallsImportBody {
  invoice: ParsedInvoice;
  fileName?: string;
  /** Replace an invoice with the same number that is already imported. */
  replace?: boolean;
}

/** An employee's number on the invoice. */
export interface MatchedNumber {
  msisdn: string;
  profileId: string;
  name: string;
}

/** POST ?resource=calls&action=preview */
export interface CallsPreview {
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  matched: MatchedNumber[];
  /** Numbers on the invoice without an employee (no profile has them as the mobile number); not imported. */
  skipped: string[];
  /** Numbers of more than one profile; not imported until the profiles are corrected. */
  ambiguous: string[];
  /** When an invoice with this number is already imported. */
  importedAt: string | null;
}

/** POST ?resource=calls */
export interface CallsImportResult {
  invoiceId: string;
  matched: number;
  replaced: boolean;
}

export interface CallsPeriod {
  invoiceId: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  /** Working days of the period (without weekends and Polish public holidays). */
  workingDays: number;
  importedAt: string;
  sourceFileName: string | null;
}

/** One person in one period. Calls are outgoing calls (domestic and in roaming); incoming domestic calls are not on the invoice. */
export interface PersonCalls {
  profileId: string;
  name: string;
  jobTitle: string | null;
  msisdn: string;
  calls: number;
  seconds: number;
  /** Average length of a call in seconds; null without calls. */
  averageSeconds: number | null;
  /** Calls to mobile networks in Poland, to landlines, abroad (from Poland), made abroad (roaming), other. */
  mobile: number;
  landline: number;
  international: number;
  roaming: number;
  other: number;
  sms: number;
  dataMb: number;
  /** Variable cost (usage beyond the plan), net PLN. */
  costNet: number;
  /** Working days of the period on approved leave (Leave). */
  leaveDays: number;
  /** Calls per working day the person was not on leave; null when there were no such days. */
  callsPerDay: number | null;
}

/** GET ?resource=calls[&period=<invoice id>] */
export interface CallsReport {
  /** Imported invoices, oldest first. */
  periods: CallsPeriod[];
  /** The period shown (the requested one, else the newest); null before the first import. */
  period: CallsPeriod | null;
  /** The employees on the period's invoice, most calls first. */
  people: PersonCalls[];
  /**
   * Calls per working day of each person in each period (in the order of `periods`). A value is null when the person
   * is not on that invoice (onInvoice false) or was on leave the whole period.
   */
  comparison: { profileId: string; name: string; values: (number | null)[]; onInvoice: boolean[] }[];
}
