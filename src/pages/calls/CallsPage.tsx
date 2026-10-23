import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Download, FileUp, PhoneCall, Upload, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CallsImportBody, CallsImportResult, CallsPeriod, CallsPreview, CallsReport, PersonCalls } from '../../../shared/callsApi.ts';
import { formatDate } from '../../../shared/leave.ts';
import { InvoiceParseError, type ParsedInvoice } from '../../../shared/tmobile.ts';
import { Button } from '../../components/Button';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useToast } from '../../lib/toast';
import { Empty, ErrorNote, Loading } from '../leave/ui';
import { useApi } from '../leave/useApi';
import { readInvoice } from './pdf';

const CALLS_API = '/api/admin/users?resource=calls';

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
/** A billing period by the month it mostly covers ("2 Aug – 1 Sep 2026" → "Aug 2026"). */
const monthOf = (period: CallsPeriod) => MONTH.format(new Date(`${period.periodStart}T00:00:00Z`));
const periodRange = (period: { periodStart: string; periodEnd: string }) => `${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`;

const decimal = (value: number, digits = 1) => value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const minutes = (seconds: number) => Math.round(seconds / 60).toLocaleString('en-GB');
const whole = (value: number) => value.toLocaleString('en-GB');

interface Pending {
  fileName: string;
  invoice: ParsedInvoice;
  preview: CallsPreview;
}

/** Drop zone, preview of the matched numbers and the import itself. */
function ImportCard({ onImported, onClose }: { onImported: (invoiceId: string) => void; onClose?: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);

  const reset = () => {
    setPending(null);
    setProblems([]);
    if (input.current) input.current.value = '';
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setReading(true);
    try {
      const invoice = await readInvoice(file);
      const body: CallsImportBody = { invoice };
      const preview = await api<CallsPreview>(`${CALLS_API}&action=preview`, { method: 'POST', body });
      setPending({ fileName: file.name, invoice, preview });
    } catch (error) {
      setProblems(error instanceof InvoiceParseError ? error.problems : [(error as Error).message]);
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!pending) return;
    setImporting(true);
    try {
      const body: CallsImportBody = { invoice: pending.invoice, fileName: pending.fileName, replace: Boolean(pending.preview.importedAt) };
      const result = await api<CallsImportResult>(CALLS_API, { method: 'POST', body });
      toast.success(result.replaced ? 'Invoice replaced' : 'Invoice imported', `${result.matched} employee number(s), ${periodRange(pending.preview)}`);
      reset();
      onImported(result.invoiceId);
    } catch (error) {
      toast.error('Import failed', (error as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void choose(e.dataTransfer.files[0]);
  };

  const preview = pending?.preview;
  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Import an invoice</h2>
          <p className="mt-0.5 text-sm text-gray-500">The PDF is read on this computer. Only the usage of employees' numbers is saved.</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        {!pending && (
          <label
            htmlFor="invoice-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragging ? 'border-[#CC1F1F] bg-red-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {reading ? (
              <span className="animate-spin h-6 w-6 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" />
            ) : (
              <FileUp size={26} className="text-gray-400" />
            )}
            <span className="text-sm font-medium text-gray-800">
              {reading ? 'Reading the invoice…' : (
                <>
                  <span className="hidden sm:inline">Drop the invoice PDF here or </span>
                  <span className="text-[#CC1F1F] sm:text-gray-800">
                    <span className="sm:hidden">Choose the invoice PDF</span>
                    <span className="hidden sm:inline">click to choose it</span>
                  </span>
                </>
              )}
            </span>
            <span className="text-xs text-gray-500">T-Mobile business invoice with “Rozliczenie szczegółowe”</span>
            <input
              ref={input}
              id="invoice-file"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={reading || importing}
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
        )}

        {problems.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-medium">The invoice was not imported.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 [overflow-wrap:anywhere]">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {pending && preview && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-gray-500">Billing period</dt>
                <dd className="font-medium text-gray-900">{periodRange(preview)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Invoice</dt>
                <dd className="font-medium text-gray-900">{preview.invoiceNumber}</dd>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-xs text-gray-500">File</dt>
                <dd className="text-gray-900 [overflow-wrap:anywhere]">{pending.fileName}</dd>
              </div>
            </dl>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {preview.matched.length} employee{preview.matched.length === 1 ? '' : 's'} found
              </p>
              {preview.matched.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {preview.matched.map((m) => (
                    <li key={m.msisdn} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700" title={m.msisdn}>
                      {m.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {preview.skipped.length > 0 && (
              <p className="text-sm text-gray-600 [overflow-wrap:anywhere]">
                <span className="font-medium text-gray-900">{preview.skipped.length} other number(s) skipped</span> (no profile has them as the mobile
                number): {preview.skipped.join(', ')}.
              </p>
            )}
            {preview.ambiguous.length > 0 && (
              <p className="text-sm text-amber-800 [overflow-wrap:anywhere]">
                <span className="font-medium">In more than one profile:</span> {preview.ambiguous.join(', ')}. Correct the profiles to include them.
              </p>
            )}
            {preview.importedAt && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                Already imported on {formatDateTime(preview.importedAt)}. Importing again replaces the saved data.
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" className="min-h-11" onClick={reset} disabled={importing}>
                Choose another file
              </Button>
              <Button className="min-h-11 sm:order-first" isLoading={importing} disabled={!preview.matched.length} onClick={() => void save()}>
                {preview.importedAt ? 'Replace invoice' : 'Import invoice'}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** "Jun 2026" pills, newest first; they scroll sideways when there are many. */
function PeriodPicker({ periods, current, onPick }: { periods: CallsPeriod[]; current: CallsPeriod; onPick: (id: string) => void }) {
  return (
    <nav className="-mx-4 overflow-x-auto sm:mx-0" aria-label="Billing period">
      <div className="flex gap-2 px-4 sm:flex-wrap sm:px-0">
        {[...periods].reverse().map((p) => {
          const active = p.invoiceId === current.invoiceId;
          return (
            <button
              key={p.invoiceId}
              type="button"
              onClick={() => onPick(p.invoiceId)}
              aria-current={active ? 'true' : undefined}
              title={periodRange(p)}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 ${
                active ? 'border-[#CC1F1F] bg-[#CC1F1F] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {monthOf(p)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900 sm:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </Card>
  );
}

function Summary({ report }: { report: CallsReport }) {
  const period = report.period!;
  const people = report.people;
  const sum = (pick: (p: PersonCalls) => number) => people.reduce((total, p) => total + pick(p), 0);
  const calls = sum((p) => p.calls);
  const daily = people.map((p) => p.callsPerDay).filter((v): v is number => v !== null);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Outgoing calls" value={whole(calls)} hint={`${people.length} employee${people.length === 1 ? '' : 's'}`} />
      <Stat label="Minutes" value={minutes(sum((p) => p.seconds))} hint={calls ? `${Math.round(sum((p) => p.seconds) / calls)} s per call` : undefined} />
      <Stat
        label="Calls per day"
        value={daily.length ? decimal(daily.reduce((a, b) => a + b, 0) / daily.length) : '—'}
        hint={`average per person, ${period.workingDays} working days`}
      />
      <Stat label="Variable cost" value={`${decimal(sum((p) => p.costNet), 2)} zł`} hint="net, beyond the plans" />
    </div>
  );
}

const perDay = (p: PersonCalls) => (p.callsPerDay === null ? 'on leave' : decimal(p.callsPerDay));
const breakdown = (p: PersonCalls) =>
  [
    ['mobile', p.mobile],
    ['landline', p.landline],
    ['international', p.international],
    ['roaming', p.roaming],
    ['other', p.other],
  ].filter(([, n]) => n) as [string, number][];

function Bar({ value, most }: { value: number; most: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-100">
      <div className="h-1.5 rounded-full bg-[#CC1F1F]" style={{ width: `${(value / most) * 100}%` }} />
    </div>
  );
}

const th = 'px-3 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap';
const td = 'px-3 py-3 whitespace-nowrap';

const COLUMNS: { label: string; title?: string; value: (p: PersonCalls) => string }[] = [
  { label: 'Per day', title: 'Calls per working day, without days on leave', value: perDay },
  { label: 'Minutes', value: (p) => minutes(p.seconds) },
  { label: 'Avg', title: 'Average length of a call', value: (p) => (p.averageSeconds === null ? '—' : `${p.averageSeconds} s`) },
  { label: 'Mobile', title: 'Calls to mobile networks in Poland', value: (p) => String(p.mobile) },
  { label: 'Landline', value: (p) => String(p.landline) },
  { label: 'Intl', title: 'Calls from Poland abroad', value: (p) => String(p.international) },
  { label: 'Roaming', title: 'Calls made abroad', value: (p) => String(p.roaming) },
  { label: 'SMS', value: (p) => String(p.sms) },
  { label: 'Cost', title: 'Variable cost, net PLN', value: (p) => decimal(p.costNet, 2) },
];

/** The ranking: a table on wide screens, cards on phones and tablets. */
function Ranking({ report }: { report: CallsReport }) {
  const people = report.people;
  const most = Math.max(1, ...people.map((p) => p.calls));
  return (
    <>
      <ol className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:hidden">
        {people.map((p, index) => (
          <li key={p.profileId} className="border-t border-gray-100 py-4 first:border-t-0 first:pt-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(2)]:pt-0">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-5 shrink-0 text-sm text-gray-400">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-gray-900">{p.name}</p>
                  <p className="shrink-0 text-lg font-semibold text-gray-900">{whole(p.calls)}</p>
                </div>
                {p.jobTitle && <p className="truncate text-xs text-gray-500">{p.jobTitle}</p>}
                <div className="mt-2">
                  <Bar value={p.calls} most={most} />
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-500">Per day</dt>
                    <dd className="font-medium text-gray-900">{perDay(p)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Minutes</dt>
                    <dd className="font-medium text-gray-900">{minutes(p.seconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Avg call</dt>
                    <dd className="font-medium text-gray-900">{p.averageSeconds === null ? '—' : `${p.averageSeconds} s`}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-gray-500">
                  {[...breakdown(p).map(([label, n]) => `${n} ${label}`), `${p.sms} SMS`, `${decimal(p.costNet, 2)} zł`].join(' · ')}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="-mx-6 hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="border-y border-gray-100 bg-gray-50 text-left">
            <tr>
              <th className={`${th} pl-6`}>#</th>
              <th className={th}>Employee</th>
              <th className={`${th} w-48`}>Calls</th>
              {COLUMNS.map((c) => (
                <th key={c.label} className={`${th} text-right last:pr-6`} title={c.title}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {people.map((p, index) => (
              <tr key={p.profileId} className="hover:bg-gray-50/60">
                <td className={`${td} pl-6 text-gray-400`}>{index + 1}</td>
                <td className="min-w-44 px-3 py-3">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.jobTitle ?? p.msisdn}</p>
                </td>
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <span className="w-10 text-right font-semibold text-gray-900">{whole(p.calls)}</span>
                    <div className="w-28">
                      <Bar value={p.calls} most={most} />
                    </div>
                  </div>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.label} className={`${td} text-right text-gray-700 last:pr-6 ${c.value(p) === 'on leave' ? 'text-gray-400' : ''}`}>
                    {c.value(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Comparison({ report }: { report: CallsReport }) {
  const values = report.comparison.flatMap((row) => row.values.filter((v): v is number => v !== null));
  const most = Math.max(1, ...values);
  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-y border-gray-100 bg-gray-50 text-left">
          <tr>
            <th className={`${th} sticky left-0 bg-gray-50 pl-6`}>Employee</th>
            {report.periods.map((p) => (
              <th key={p.invoiceId} className={`${th} text-right last:pr-6`} title={periodRange(p)}>
                {monthOf(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.comparison.map((row) => (
            <tr key={row.profileId}>
              <td className={`${td} sticky left-0 max-w-40 truncate bg-white pl-6 font-medium text-gray-900 sm:max-w-none`}>{row.name}</td>
              {row.values.map((value, i) => (
                <td key={report.periods[i].invoiceId} className={`${td} text-right last:pr-6`}>
                  {!row.onInvoice[i] ? (
                    <span className="text-gray-300" title="Not on this invoice">
                      –
                    </span>
                  ) : value === null ? (
                    <span className="text-gray-400">leave</span>
                  ) : (
                    <span
                      className="inline-block min-w-12 rounded px-2 py-0.5 text-gray-900"
                      style={{ backgroundColor: `rgb(204 31 31 / ${0.04 + (value / most) * 0.22})` }}
                    >
                      {decimal(value)}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The period's table as CSV (semicolons and decimal commas, for Excel in Polish). */
function toCsv(report: CallsReport): string {
  const period = report.period!;
  const number = (value: number | null, digits: number) => (value === null ? '' : value.toFixed(digits).replace('.', ','));
  const head = ['Period', 'Invoice', 'Employee', 'Job title', 'Number', 'Working days', 'Days on leave', 'Outgoing calls', 'Calls per working day', 'Minutes', 'Average length (s)', 'Mobile', 'Landline', 'International', 'Roaming', 'SMS', 'Data (GB)', 'Variable cost net (PLN)'];
  const rows = report.people.map((p) => [
    periodRange(period),
    period.invoiceNumber,
    p.name,
    p.jobTitle ?? '',
    p.msisdn,
    String(period.workingDays),
    number(p.leaveDays, 1),
    String(p.calls),
    number(p.callsPerDay, 1),
    number(p.seconds / 60, 1),
    p.averageSeconds === null ? '' : String(p.averageSeconds),
    String(p.mobile),
    String(p.landline),
    String(p.international),
    String(p.roaming),
    String(p.sms),
    number(p.dataMb / 1024, 2),
    number(p.costNet, 2),
  ]);
  const cell = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return '﻿' + [head, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}

function downloadCsv(report: CallsReport) {
  const url = URL.createObjectURL(new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `phone-calls-${report.period!.periodStart.slice(0, 7)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function Report({ report, onPeriod }: { report: CallsReport; onPeriod: (id: string) => void }) {
  const period = report.period!;
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-2">
        <PeriodPicker periods={report.periods} current={period} onPick={onPeriod} />
        <p className="text-xs text-gray-500">
          {periodRange(period)} · invoice {period.invoiceNumber} · imported {formatDateTime(period.importedAt)}
        </p>
      </div>

      {report.people.length > 0 && <Summary report={report} />}

      <Section
        title="Ranking"
        subtitle="Outgoing calls: domestic and made abroad, without “other calls”."
        action={
          report.people.length > 0 && (
            <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-9" onClick={() => downloadCsv(report)}>
              <Download size={16} />
              CSV
            </Button>
          )
        }
      >
        {report.people.length ? <Ranking report={report} /> : <Empty>No employee numbers on this invoice.</Empty>}
      </Section>

      {report.periods.length > 1 && (
        <Section title="Month by month" subtitle="Calls per working day, without days on leave.">
          <Comparison report={report} />
        </Section>
      )}

      <p className="text-xs leading-relaxed text-gray-500">
        The invoice gives monthly totals per number, not single calls; domestic incoming calls are not on it. “Połączenia inne” (other calls) are not
        counted, only their cost. A number on the invoice without a list of calls made none, and “–” means the number is not on that invoice. Per day: calls divided by the working days of the period (without
        weekends and public holidays) minus the person's approved leave.
      </p>
    </div>
  );
}

/** Phone calls analyser (administrators): T-Mobile invoices in, KPIs of the employees' phone calls out. */
export function CallsPage() {
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { data, error, reload } = useApi<CallsReport>(periodId ? `${CALLS_API}&period=${periodId}` : CALLS_API);
  const hasInvoices = Boolean(data?.period);

  const imported = (id: string) => {
    setImporting(false);
    if (id === periodId) reload();
    else setPeriodId(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} />
          All apps
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 sm:text-2xl">
              <PhoneCall size={22} className="shrink-0 text-[#CC1F1F]" />
              Phone calls analyser
            </h1>
            <p className="mt-1 text-sm text-gray-500">Who called how much, from the monthly T-Mobile invoices.</p>
          </div>
          {hasInvoices && !importing && (
            <Button className="min-h-11 shrink-0 sm:min-h-0" onClick={() => setImporting(true)} aria-label="Import invoice">
              <Upload size={16} />
              <span className="hidden sm:inline">Import invoice</span>
            </Button>
          )}
        </div>
      </div>

      {(importing || (data && !hasInvoices)) && <ImportCard onImported={imported} onClose={hasInvoices ? () => setImporting(false) : undefined} />}

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && hasInvoices && <Report report={data} onPeriod={setPeriodId} />}
    </div>
  );
}
