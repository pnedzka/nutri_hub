// Phone calls analyser (/calls, administrators only): importing T-Mobile invoices and the KPI report. Served by
// api/admin/users.ts with ?resource=calls, because the Hobby plan allows 12 functions and all are used.
//
//   GET  ?resource=calls[&period=<invoice id>]  → CallsReport (shared/callsApi.ts)
//   POST ?resource=calls&action=preview  body { invoice }                    → CallsPreview
//   POST ?resource=calls                 body { invoice, fileName?, replace? } → CallsImportResult
//
// The browser parses the PDF (shared/tmobile.ts) and sends the result. Only the employees' numbers are stored, with
// the person written into each row at import. Phone usage is personal data: nothing of it goes to the logs or
// Sentry, only error codes.

import { CallsError, leaveDaysIn, matchNumbers, personCalls, validateInvoice, type KpiRow, type NumberOwner } from '../../shared/calls.js';
import type { CallsImportResult, CallsPeriod, CallsPreview, CallsReport, PersonCalls } from '../../shared/callsApi.js';
import { workingDays } from '../../shared/leave.js';
import { isUuid } from '../../shared/profile.js';
import type { ParsedInvoice, UsageKind } from '../../shared/tmobile.js';
import { requireAdmin } from './auth.js';
import { HttpError, handle, json, readJson } from './http.js';
import { logError } from './monitoring.js';
import { db } from './supabase.js';

export const isCallsRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'calls';

/** A failed database call, logged by its code only: Postgres error details can quote the row (numbers, usage). */
function failed(where: string, error: { code?: string } | null | undefined): HttpError {
  logError(where, new Error(`${where} failed (${error?.code ?? 'unknown'})`), { code: error?.code });
  return new HttpError(500, 'The phone calls data could not be read or saved. Try again in a moment.');
}

const PAGE = 1000;

/** Every row of a query (PostgREST returns at most 1000 rows at a time). */
async function everyRow<T>(where: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw failed(where, error);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  mobile: string | null;
}

const nameOf = (row: ProfileRow) => row.full_name?.trim() || row.email;

/** Every profile, also deactivated ones: an older invoice may have the number of someone who has left since. */
async function profiles(): Promise<ProfileRow[]> {
  return everyRow<ProfileRow>('calls.profiles', (from, to) => db().from('profiles').select('id, email, full_name, job_title, mobile').order('id').range(from, to));
}

const owners = (rows: ProfileRow[]): NumberOwner[] => rows.map((row) => ({ id: row.id, name: nameOf(row), mobile: row.mobile }));

function checkedInvoice(value: unknown): ParsedInvoice {
  try {
    return validateInvoice(value);
  } catch (error) {
    if (error instanceof CallsError) throw new HttpError(400, error.message);
    throw error;
  }
}

async function importedAt(invoiceNumber: string): Promise<string | null> {
  const { data, error } = await db().from('phone_invoices').select('imported_at').eq('invoice_number', invoiceNumber).maybeSingle();
  if (error) throw failed('calls.existing', error);
  return data ? String(data.imported_at) : null;
}

export function callsGet(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const period = new URL(request.url).searchParams.get('period');
    if (period !== null && !isUuid(period)) throw new HttpError(400, 'Invalid period.');
    return json(await report(period));
  });
}

export function callsPost(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const action = new URL(request.url).searchParams.get('action');
    if (action !== null && action !== 'preview') throw new HttpError(400, 'Unknown action.');
    const body = await readJson<{ invoice?: unknown; fileName?: unknown; replace?: unknown }>(request);
    const invoice = checkedInvoice(body.invoice);
    const { matched, skipped, ambiguous } = matchNumbers(invoice.numbers, owners(await profiles()));
    const existing = await importedAt(invoice.invoiceNumber);

    if (action === 'preview') {
      const preview: CallsPreview = {
        invoiceNumber: invoice.invoiceNumber,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        matched,
        skipped,
        ambiguous,
        importedAt: existing,
      };
      return json(preview);
    }

    if (!matched.length) {
      throw new HttpError(400, "None of the numbers on this invoice belongs to an employee. Add the employees' mobile numbers to their profiles first.");
    }
    const replace = body.replace === true;
    if (existing && !replace) throw new HttpError(409, 'This invoice is already imported. Import it again with "Replace" to overwrite it.');
    const owner = new Map(matched.map((m) => [m.msisdn, m.profileId]));
    const payload = {
      invoice: {
        invoice_number: invoice.invoiceNumber,
        customer_number: invoice.customerNumber,
        period_start: invoice.periodStart,
        period_end: invoice.periodEnd,
        issue_date: invoice.issueDate,
        source_file_name: typeof body.fileName === 'string' ? body.fileName.slice(0, 200) || null : null,
        uploaded_by: admin.id,
      },
      lines: matched.map((m) => ({ msisdn: m.msisdn, profile_id: m.profileId })),
      usage: invoice.usage
        .filter((u) => owner.has(u.msisdn))
        .map((u) => ({
          msisdn: u.msisdn,
          profile_id: owner.get(u.msisdn),
          kind: u.kind,
          category: u.category,
          roaming_operator: u.roamingOperator,
          event_count: u.eventCount,
          duration_s: u.durationS,
          data_mb: u.dataMb,
          paid_duration_s: u.paidDurationS,
          paid_data_mb: u.paidDataMb,
          paid_count: u.paidCount,
          net_amount: u.netAmount,
        })),
    };
    const { data, error } = await db().rpc('import_phone_invoice', { payload, replace_existing: replace });
    if (error?.code === '23505') throw new HttpError(409, 'This invoice is already imported. Import it again with "Replace" to overwrite it.');
    if (error) throw failed('calls.import', error);
    console.info('[calls] imported invoice', invoice.invoiceNumber, 'numbers', matched.length, 'by', admin.email);
    const result: CallsImportResult = { invoiceId: String(data), matched: matched.length, replaced: Boolean(existing) };
    return json(result, 201);
  });
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  imported_at: string;
  source_file_name: string | null;
}

interface UsageDbRow {
  invoice_id: string;
  profile_id: string;
  kind: UsageKind;
  category: string;
  event_count: number;
  duration_s: number | null;
  data_mb: number | string | null;
  net_amount: number | string;
}

async function report(periodId: string | null): Promise<CallsReport> {
  const invoices = await everyRow<InvoiceRow>('calls.invoices', (from, to) =>
    db()
      .from('phone_invoices')
      .select('id, invoice_number, period_start, period_end, imported_at, source_file_name')
      .order('period_start')
      .order('imported_at')
      .range(from, to),
  );
  const periods: CallsPeriod[] = invoices.map((i) => ({
    invoiceId: i.id,
    invoiceNumber: i.invoice_number,
    periodStart: i.period_start,
    periodEnd: i.period_end,
    workingDays: workingDays(i.period_start, i.period_end),
    importedAt: i.imported_at,
    sourceFileName: i.source_file_name,
  }));
  if (!periods.length) return { periods, period: null, people: [], comparison: [] };
  const period = periodId ? periods.find((p) => p.invoiceId === periodId) : periods.at(-1);
  if (!period) throw new HttpError(404, 'This invoice is no longer in the analyser.');

  const first = periods.reduce((min, p) => (p.periodStart < min ? p.periodStart : min), periods[0].periodStart);
  const last = periods.reduce((max, p) => (p.periodEnd > max ? p.periodEnd : max), periods[0].periodEnd);
  const [lines, usage, people, leave] = await Promise.all([
    everyRow<{ invoice_id: string; msisdn: string; profile_id: string }>('calls.lines', (from, to) =>
      db().from('phone_invoice_lines').select('invoice_id, msisdn, profile_id').order('invoice_id').order('msisdn').range(from, to),
    ),
    everyRow<UsageDbRow>('calls.usage', (from, to) =>
      db().from('phone_usage').select('invoice_id, profile_id, kind, category, event_count, duration_s, data_mb, net_amount').order('id').range(from, to),
    ),
    profiles(),
    everyRow<{ user_id: string; start_date: string; end_date: string; half_day: boolean }>('calls.leave', (from, to) =>
      db()
        .from('leave_requests')
        .select('user_id, start_date, end_date, half_day')
        .eq('status', 'approved')
        .lte('start_date', last)
        .gte('end_date', first)
        .order('id')
        .range(from, to),
    ),
  ]);

  const byId = new Map(people.map((p) => [p.id, p]));
  const key = (invoiceId: string, profileId: string) => `${invoiceId}|${profileId}`;
  // A person may have more than one number on an invoice (e.g. a phone and a data SIM): their KPIs add up.
  const numbers = new Map<string, string[]>();
  for (const line of lines) numbers.set(key(line.invoice_id, line.profile_id), [...(numbers.get(key(line.invoice_id, line.profile_id)) ?? []), line.msisdn]);
  const rows = new Map<string, KpiRow[]>();
  for (const u of usage) {
    const row: KpiRow = {
      kind: u.kind,
      category: u.category,
      eventCount: u.event_count,
      durationS: u.duration_s,
      dataMb: u.data_mb === null ? null : Number(u.data_mb),
      netAmount: Number(u.net_amount),
    };
    rows.set(key(u.invoice_id, u.profile_id), [...(rows.get(key(u.invoice_id, u.profile_id)) ?? []), row]);
  }
  const leaveOf = new Map<string, { start: string; end: string; halfDay: boolean }[]>();
  for (const l of leave) leaveOf.set(l.user_id, [...(leaveOf.get(l.user_id) ?? []), { start: l.start_date, end: l.end_date, halfDay: l.half_day }]);

  const kpis = (p: CallsPeriod, profileId: string): PersonCalls | null => {
    const msisdns = numbers.get(key(p.invoiceId, profileId));
    if (!msisdns) return null;
    const profile = byId.get(profileId);
    return personCalls(
      { profileId, name: profile ? nameOf(profile) : 'Former user', jobTitle: profile?.job_title ?? null, msisdn: msisdns.join(', ') },
      rows.get(key(p.invoiceId, profileId)) ?? [],
      p.workingDays,
      leaveDaysIn(leaveOf.get(profileId) ?? [], p.periodStart, p.periodEnd),
    );
  };

  const everyone = [...new Set(lines.map((l) => l.profile_id))];
  const shown = everyone
    .map((id) => kpis(period, id))
    .filter((k): k is PersonCalls => k !== null)
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name, 'pl'));
  const comparison = everyone
    .map((id) => {
      const profile = byId.get(id);
      return {
        profileId: id,
        name: profile ? nameOf(profile) : 'Former user',
        values: periods.map((p) => kpis(p, id)?.callsPerDay ?? null),
        onInvoice: periods.map((p) => numbers.has(key(p.invoiceId, id))),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return { periods, period, people: shown, comparison };
}
