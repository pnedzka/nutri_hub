import { useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, ArrowLeft, Download, FileUp, PhoneCall } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CallsImportBody, CallsImportResult, CallsPeriod, CallsPreview, CallsReport, PersonCalls } from '../../../shared/callsApi.ts';
import { formatDate } from '../../../shared/leave.ts';
import { InvoiceParseError, type ParsedInvoice } from '../../../shared/tmobile.ts';
import { Button } from '../../components/Button';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Select } from '../../components/Field';
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

interface Pending {
  fileName: string;
  invoice: ParsedInvoice;
  preview: CallsPreview;
}

function ImportCard({ onImported }: { onImported: (invoiceId: string) => void }) {
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
      <CardHeader>
        <h2 className="text-base font-semibold text-gray-900">Import an invoice</h2>
        <p className="text-sm text-gray-500">The T-Mobile invoice (PDF) is read on this computer; only the usage of employees' numbers is saved.</p>
      </CardHeader>
      <CardBody className="space-y-4">
        <label
          htmlFor="invoice-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? 'border-[#CC1F1F] bg-red-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {reading ? (
            <span className="animate-spin h-6 w-6 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" />
          ) : (
            <FileUp size={28} className="text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-700">{reading ? 'Reading the invoice…' : 'Drop the invoice PDF here or click to choose it'}</span>
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

        {problems.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-medium">The invoice was not imported.</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5 [overflow-wrap:anywhere]">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {pending && preview && (
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Invoice</dt>
                <dd className="font-medium text-gray-900">{preview.invoiceNumber}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Billing period</dt>
                <dd className="font-medium text-gray-900">{periodRange(preview)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">File</dt>
                <dd className="text-gray-900 [overflow-wrap:anywhere]">{pending.fileName}</dd>
              </div>
            </dl>
            <div>
              <p className="text-sm font-medium text-gray-900">Employees found: {preview.matched.length}</p>
              {preview.matched.length > 0 && (
                <ul className="mt-1 grid gap-x-6 text-sm text-gray-600 sm:grid-cols-2">
                  {preview.matched.map((m) => (
                    <li key={m.msisdn}>
                      {m.name} <span className="text-gray-400">{m.msisdn}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {preview.skipped.length > 0 && (
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">Skipped ({preview.skipped.length}):</span> {preview.skipped.join(', ')}. No profile has these mobile
                numbers, so their usage is not saved.
              </p>
            )}
            {preview.ambiguous.length > 0 && (
              <p className="text-sm text-amber-800">
                <span className="font-medium">In more than one profile ({preview.ambiguous.length}):</span> {preview.ambiguous.join(', ')}. Correct the profiles to
                include them.
              </p>
            )}
            {preview.importedAt && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                This invoice was already imported on {formatDateTime(preview.importedAt)}. Importing it again replaces the saved data.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" isLoading={importing} disabled={!preview.matched.length} onClick={() => void save()}>
                {preview.importedAt ? 'Replace' : 'Import'}
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={reset} disabled={importing}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const COLUMNS: { label: string; title?: string; value: (p: PersonCalls) => string }[] = [
  { label: 'Per day', title: 'Calls per working day, without days on leave', value: (p) => (p.callsPerDay === null ? 'leave' : decimal(p.callsPerDay)) },
  { label: 'Minutes', value: (p) => minutes(p.seconds) },
  { label: 'Avg (s)', title: 'Average length of a call in seconds', value: (p) => (p.averageSeconds === null ? '—' : String(p.averageSeconds)) },
  { label: 'Mobile', title: 'Calls to mobile networks in Poland', value: (p) => String(p.mobile) },
  { label: 'Landline', value: (p) => String(p.landline) },
  { label: 'Intl', title: 'Calls from Poland abroad', value: (p) => String(p.international) },
  { label: 'Roaming', title: 'Calls made abroad', value: (p) => String(p.roaming) },
  { label: 'SMS', value: (p) => String(p.sms) },
  { label: 'Cost', title: 'Variable cost, net PLN', value: (p) => decimal(p.costNet, 2) },
];

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

const th = 'px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap';
const td = 'px-3 py-2 whitespace-nowrap';

function RankingTable({ report }: { report: CallsReport }) {
  const period = report.period!;
  const people = report.people;
  const most = Math.max(1, ...people.map((p) => p.calls));
  const total = (pick: (p: PersonCalls) => number) => people.reduce((sum, p) => sum + pick(p), 0);
  const calls = total((p) => p.calls);
  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className={`${th} pl-6`}>#</th>
            <th className={th}>Employee</th>
            <th className={`${th} text-right`}>Calls</th>
            {COLUMNS.map((c) => (
              <th key={c.label} className={`${th} text-right`} title={c.title}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {people.map((p, index) => (
            <tr key={p.profileId}>
              <td className={`${td} pl-6 text-gray-400`}>{index + 1}</td>
              <td className="px-3 py-2 min-w-48">
                <p className="font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">{[p.jobTitle, p.msisdn].filter(Boolean).join(' · ')}</p>
              </td>
              <td className={`${td} relative text-right font-semibold text-gray-900 min-w-28`}>
                <span className="absolute inset-y-2 right-3 rounded bg-[#CC1F1F]/15" style={{ width: `calc((100% - 1.5rem) * ${p.calls / most})` }} />
                <span className="relative">{p.calls}</span>
              </td>
              {COLUMNS.map((c) => (
                <td key={c.label} className={`${td} text-right text-gray-700`}>
                  {c.value(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
          <tr>
            <td className={`${td} pl-6`} />
            <td className={td}>Total</td>
            <td className={`${td} text-right`}>{calls}</td>
            <td className={`${td} text-right`}>{decimal(calls / Math.max(1, period.workingDays))}</td>
            <td className={`${td} text-right`}>{minutes(total((p) => p.seconds))}</td>
            <td className={`${td} text-right`}>{calls ? Math.round(total((p) => p.seconds) / calls) : '—'}</td>
            <td className={`${td} text-right`}>{total((p) => p.mobile)}</td>
            <td className={`${td} text-right`}>{total((p) => p.landline)}</td>
            <td className={`${td} text-right`}>{total((p) => p.international)}</td>
            <td className={`${td} text-right`}>{total((p) => p.roaming)}</td>
            <td className={`${td} text-right`}>{total((p) => p.sms)}</td>
            <td className={`${td} text-right`}>{decimal(total((p) => p.costNet), 2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ComparisonTable({ report }: { report: CallsReport }) {
  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className={`${th} pl-6`}>Employee</th>
            {report.periods.map((p) => (
              <th key={p.invoiceId} className={`${th} text-right`} title={periodRange(p)}>
                {monthOf(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {report.comparison.map((row) => (
            <tr key={row.profileId}>
              <td className={`${td} pl-6 font-medium text-gray-900`}>{row.name}</td>
              {row.values.map((value, i) => (
                <td key={report.periods[i].invoiceId} className={`${td} text-right ${row.onInvoice[i] ? 'text-gray-700' : 'text-gray-300'}`}>
                  {!row.onInvoice[i] ? '–' : value === null ? 'leave' : decimal(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Report({ periodId, onPeriod }: { periodId: string | null; onPeriod: (id: string) => void }) {
  const { data, error } = useApi<CallsReport>(periodId ? `${CALLS_API}&period=${periodId}` : CALLS_API);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  if (!data.period) return <Empty>No invoices yet. Import the first one above.</Empty>;
  const period = data.period;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="sm:w-72">
            <Select id="calls-period" label="Billing period" value={period.invoiceId} onChange={(e) => onPeriod(e.target.value)}>
              {[...data.periods].reverse().map((p) => (
                <option key={p.invoiceId} value={p.invoiceId}>
                  {monthOf(p)} ({periodRange(p)})
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => downloadCsv(data)} disabled={!data.people.length}>
            <Download size={16} />
            Export CSV
          </Button>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-gray-600">
            Invoice {period.invoiceNumber} · {period.workingDays} working days · imported {formatDateTime(period.importedAt)}
          </p>
          {data.people.length ? <RankingTable report={data} /> : <Empty>No employee numbers on this invoice.</Empty>}
        </CardBody>
      </Card>

      {data.periods.length > 1 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Calls per working day, month by month</h2>
          </CardHeader>
          <CardBody>
            <ComparisonTable report={data} />
          </CardBody>
        </Card>
      )}

      <p className="text-xs text-gray-500">
        The invoice gives monthly totals per number, not single calls. Calls are outgoing calls: domestic and made abroad (roaming); domestic incoming
        calls are not on the invoice. A number on the invoice without a list of calls made none; “–” means the number is not on that invoice. Per day:
        calls divided by the working days of the period (without weekends and public holidays) minus the person's approved leave.
      </p>
    </div>
  );
}

/** Phone calls analyser (administrators): T-Mobile invoices in, KPIs of the employees' phone calls out. */
export function CallsPage() {
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} />
          All apps
        </Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-xl sm:text-2xl font-semibold text-gray-900">
          <PhoneCall size={22} className="text-[#CC1F1F]" />
          Phone calls analyser
        </h1>
        <p className="mt-1 text-sm text-gray-600">Who called how much, from the monthly T-Mobile invoices. Administrators only.</p>
      </div>
      <ImportCard
        onImported={(id) => {
          setPeriodId(id);
          setVersion((v) => v + 1);
        }}
      />
      <Report key={version} periodId={periodId} onPeriod={setPeriodId} />
    </div>
  );
}
