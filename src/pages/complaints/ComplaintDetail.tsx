import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  CURRENCIES,
  FILE_CATEGORIES,
  FILE_CATEGORY_LABELS,
  MAX_FILE_MB,
  OUTCOMES,
  OUTCOME_LABELS,
  SETTLEMENTS,
  SETTLEMENT_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  cleanDetails,
  daysOpen,
  money,
  type Complaint,
  type ComplaintAction,
  type ComplaintEvent,
  type ComplaintStatus,
  type FileCategory,
  type Outcome,
  type Settlement,
} from '../../../shared/complaintsApi.ts';
import { Button } from '../../components/Button';
import { Select, Textarea } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { dateTime, shortDate, uploadTo } from '../contracts/common';
import { Section } from '../contracts/ui';
import { COMPLAINTS_API, useSetup } from './common';
import { StatusPill } from './StatusPill';
import { Loading } from '../../components/States';
import { ErrorNote } from '../../components/States';

interface Detail {
  complaint: Complaint;
  can: ComplaintAction[];
  next: ComplaintStatus[];
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[11rem_1fr] text-sm">
      {rows
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500">{k}</dt>
            <dd className="text-gray-900 break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

const post = <T,>(body: Record<string, unknown>) => api<T>(COMPLAINTS_API, { method: 'POST', body });

/** Changing the status: "Resolved" asks for the outcome and how it was settled. */
function StatusPanel({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const toast = useToast();
  const { complaint: c, next, can } = detail;
  const [to, setTo] = useState<ComplaintStatus | ''>('');
  const [comment, setComment] = useState('');
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [settlement, setSettlement] = useState<Settlement | ''>('');
  const [notes, setNotes] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!next.length && !can.includes('cancel')) return null;

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await post({ id: c.id, ...body });
      toast.success(done);
      setTo('');
      setComment('');
      setCancelling(false);
      onDone();
    } catch (error) {
      toast.error('Not saved', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Status">
      {!cancelling ? (
        <div className="space-y-3">
          {next.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Move to">
                {next.map((s) => (
                  <Button key={s} type="button" variant={to === s ? 'primary' : 'secondary'} className="min-h-11 sm:min-h-0" onClick={() => setTo(s)}>
                    {c.status === 'closed' || (c.status === 'resolved' && s === 'investigating') ? 'Reopen' : STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
              {to === 'resolved' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select id="outcome" label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} className="text-base sm:text-sm">
                    <option value="">Choose…</option>
                    {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
                  </Select>
                  <Select id="settlement" label="Settlement" value={settlement} onChange={(e) => setSettlement(e.target.value as Settlement)} className="text-base sm:text-sm">
                    <option value="">Choose…</option>
                    {SETTLEMENTS.map((s) => <option key={s} value={s}>{SETTLEMENT_LABELS[s]}</option>)}
                  </Select>
                  <div className="sm:col-span-2">
                    <Textarea id="resolution" label="Resolution notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base sm:text-sm" />
                  </div>
                </div>
              )}
              {to && (
                <div className="space-y-3">
                  <Textarea id="status-comment" label="Comment (optional)" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className="text-base sm:text-sm" />
                  <Button
                    type="button"
                    className="min-h-11 sm:min-h-0"
                    isLoading={busy}
                    disabled={to === 'resolved' && (!outcome || !settlement)}
                    onClick={() => run({ action: 'status', to, comment, outcome: outcome || null, settlement: settlement || null, resolutionNotes: notes }, `Status: ${STATUS_LABELS[to]}`)}
                  >
                    Save status
                  </Button>
                </div>
              )}
            </>
          )}
          {can.includes('cancel') && (
            <button type="button" className="min-h-11 sm:min-h-0 text-sm text-gray-500 underline hover:text-red-700" onClick={() => setCancelling(true)}>
              Cancel the complaint
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea id="cancel-reason" label="Why is it cancelled? (e.g. a duplicate)" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className="text-base sm:text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="danger" className="min-h-11 sm:min-h-0" isLoading={busy} disabled={!comment.trim()} onClick={() => run({ action: 'cancel', comment }, 'Complaint cancelled')}>
              Cancel the complaint
            </Button>
            <Button type="button" variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => setCancelling(false)}>Keep it</Button>
          </div>
        </div>
      )}
    </Section>
  );
}

const str = (n: number | null) => (n === null ? '' : String(n));

/** The handler's fields: batch, dates, the supplier side and the money (all optional). */
function Handling({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const toast = useToast();
  const c = detail.complaint;
  const editable = detail.can.includes('edit');
  const initial = () => ({
    batchNumber: c.batchNumber,
    quantityKg: str(c.quantityKg),
    clientResponseDue: c.clientResponseDue ?? '',
    supplierRef: c.supplierRef,
    supplierReportedOn: c.supplierReportedOn ?? '',
    clientClaimed: str(c.clientClaimed),
    clientAgreed: str(c.clientAgreed),
    clientCurrency: c.clientCurrency,
    supplierClaimed: str(c.supplierClaimed),
    supplierAccepted: str(c.supplierAccepted),
    supplierCurrency: c.supplierCurrency,
  });
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof ReturnType<typeof initial>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    const { problems } = cleanDetails(form);
    if (problems.length) return toast.error('Check the fields', problems[0].message);
    setBusy(true);
    try {
      await post({ action: 'details', id: c.id, details: form });
      toast.success('Saved');
      setEditing(false);
      onDone();
    } catch (error) {
      toast.error('Not saved', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <Section title="Client and supplier" aside={editable && <Button type="button" variant="secondary" size="sm" className="min-h-11 sm:min-h-0" onClick={() => { setForm(initial()); setEditing(true); }}>Edit</Button>}>
        <Rows
          rows={[
            ['Answer the client by', c.clientResponseDue ? shortDate(c.clientResponseDue) : ''],
            ['Claimed by the client', money(c.clientClaimed, c.clientCurrency)],
            ['Agreed with the client', money(c.clientAgreed, c.clientCurrency)],
            ['Reported to the supplier', c.supplierReportedOn ? shortDate(c.supplierReportedOn) : ''],
            ["Supplier's complaint no.", c.supplierRef],
            ['Claimed from the supplier', money(c.supplierClaimed, c.supplierCurrency)],
            ['Accepted by the supplier', money(c.supplierAccepted, c.supplierCurrency)],
          ]}
        />
        {!c.clientResponseDue && !c.clientClaimed && !c.supplierRef && !c.supplierClaimed && (
          <p className="text-sm text-gray-500">{editable ? 'Nothing yet. Add the supplier side and the amounts with "Edit" when you know them.' : 'Nothing yet.'}</p>
        )}
      </Section>
    );
  }

  const cur = (key: 'clientCurrency' | 'supplierCurrency', id: string) => (
    <Select id={id} label="Currency" value={form[key]} onChange={set(key)} className="text-base sm:text-sm">
      {CURRENCIES.map((x) => <option key={x} value={x}>{x}</option>)}
    </Select>
  );
  return (
    <Section title="Client and supplier">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input id="d-batch" label="Batch number" value={form.batchNumber} onChange={set('batchNumber')} className="text-base sm:text-sm" />
        <Input id="d-quantity" label="Quantity concerned (kg)" inputMode="decimal" value={form.quantityKg} onChange={set('quantityKg')} className="text-base sm:text-sm" />
        <Input id="d-due" label="Answer the client by" type="date" value={form.clientResponseDue} onChange={set('clientResponseDue')} className="text-base sm:text-sm" />
        <Input id="d-client-claimed" label="Claimed by the client" inputMode="decimal" value={form.clientClaimed} onChange={set('clientClaimed')} className="text-base sm:text-sm" />
        <Input id="d-client-agreed" label="Agreed with the client" inputMode="decimal" value={form.clientAgreed} onChange={set('clientAgreed')} className="text-base sm:text-sm" />
        {cur('clientCurrency', 'd-client-currency')}
        <Input id="d-supplier-ref" label="Supplier's complaint no." value={form.supplierRef} onChange={set('supplierRef')} className="text-base sm:text-sm" />
        <Input id="d-supplier-on" label="Reported to the supplier" type="date" value={form.supplierReportedOn} onChange={set('supplierReportedOn')} className="text-base sm:text-sm" />
        <div />
        <Input id="d-supplier-claimed" label="Claimed from the supplier" inputMode="decimal" value={form.supplierClaimed} onChange={set('supplierClaimed')} className="text-base sm:text-sm" />
        <Input id="d-supplier-accepted" label="Accepted by the supplier" inputMode="decimal" value={form.supplierAccepted} onChange={set('supplierAccepted')} className="text-base sm:text-sm" />
        {cur('supplierCurrency', 'd-supplier-currency')}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" className="min-h-11 sm:min-h-0" isLoading={busy} onClick={save}>Save</Button>
        <Button type="button" variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </Section>
  );
}

function Files({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const toast = useToast();
  const setup = useSetup();
  const c = detail.complaint;
  const [category, setCategory] = useState<FileCategory>('photos');
  const [busy, setBusy] = useState(false);
  const canAttach = detail.can.includes('attach');

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of [...list]) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast.error(`${file.name} is too big`, `Up to ${MAX_FILE_MB} MB.`);
          continue;
        }
        const link = await post<{ path: string; signedUrl: string }>({ action: 'uploadUrl', id: c.id, fileName: file.name });
        await uploadTo(link.signedUrl, file);
        await post({ action: 'attach', id: c.id, path: link.path, fileName: file.name, category });
      }
      toast.success('Files added');
      onDone();
    } catch (error) {
      toast.error('The file was not added', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(fileId: number) {
    try {
      await post({ action: 'removeFile', id: c.id, fileId });
      onDone();
    } catch (error) {
      toast.error('The file was not removed', (error as Error).message);
    }
  }

  return (
    <Section title={`Files (${c.files.length})`}>
      {c.files.length === 0 && <p className="text-sm text-gray-500">No files yet.</p>}
      {c.files.length > 0 && (
        <ul className="divide-y divide-gray-100 text-sm">
          {c.files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-gray-900">{f.fileName}</p>
                <p className="text-xs text-gray-500">{FILE_CATEGORY_LABELS[f.category]} · {f.uploadedBy.name} · {dateTime(f.uploadedAt)}</p>
              </div>
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" aria-label={`Open ${f.fileName}`} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
                  <Download size={16} />
                </a>
              )}
              {canAttach && (detail.can.includes('edit') || f.uploadedBy.email === setup?.me.email) && (
                <button type="button" aria-label={`Remove ${f.fileName}`} onClick={() => remove(f.id)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAttach && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Select id="add-category" label="Category" value={category} onChange={(e) => setCategory(e.target.value as FileCategory)} className="text-base sm:text-sm">
            {FILE_CATEGORIES.map((x) => <option key={x} value={x}>{FILE_CATEGORY_LABELS[x]}</option>)}
          </Select>
          <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 ${busy ? 'opacity-50' : ''}`}>
            <Paperclip size={16} />
            {busy ? 'Uploading…' : 'Add files'}
            <input type="file" multiple className="sr-only" aria-label="Add files" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      )}
    </Section>
  );
}

function eventText(e: ComplaintEvent): string {
  switch (e.action) {
    case 'created': return 'Registered the complaint';
    case 'imported': return 'Imported from the old intranet';
    case 'status': return `Status: ${e.fromStatus ? STATUS_LABELS[e.fromStatus] : ''} → ${e.toStatus ? STATUS_LABELS[e.toStatus] : ''}`;
    case 'cancelled': return 'Cancelled the complaint';
    case 'details': return 'Updated the client and supplier details';
    case 'assigned': return `Assigned to ${e.comment ?? ''}`;
    case 'comment': return 'Commented';
    case 'file_added': return `Added a file: ${e.comment ?? ''}`;
    case 'file_removed': return `Removed a file: ${e.comment ?? ''}`;
    default: return e.action;
  }
}

const SHOWS_COMMENT = new Set(['comment', 'status', 'cancelled']);

function History({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const toast = useToast();
  const c = detail.complaint;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await post({ action: 'comment', id: c.id, comment: text });
      setText('');
      onDone();
    } catch (error) {
      toast.error('The comment was not saved', (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="History and comments">
      <ol className="space-y-3">
        {[...c.events].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="text-sm">
            <p className="text-gray-900">
              <span className="font-medium">{e.actorName || 'Intranet'}</span> · {eventText(e)}
            </p>
            {e.comment && SHOWS_COMMENT.has(e.action) && <p className="mt-0.5 whitespace-pre-line text-gray-700">{e.comment}</p>}
            <p className="text-xs text-gray-500">{dateTime(e.at)}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 space-y-2">
        <Textarea id="new-comment" label="Add a comment" rows={3} value={text} onChange={(e) => setText(e.target.value)} className="text-base sm:text-sm" />
        <Button type="button" className="min-h-11 sm:min-h-0" isLoading={busy} disabled={!text.trim()} onClick={send}>Comment</Button>
      </div>
    </Section>
  );
}

function Assign({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const toast = useToast();
  const setup = useSetup();
  const c = detail.complaint;
  if (!detail.can.includes('assign') || !setup) return null;
  async function choose(email: string) {
    try {
      await post({ action: 'assign', id: c.id, email });
      toast.success('Handler changed');
      onDone();
    } catch (error) {
      toast.error('Not saved', (error as Error).message);
    }
  }
  const options = setup.handlers.some((h) => h.email === c.handler.email) ? setup.handlers : [c.handler, ...setup.handlers];
  return (
    <Select id="handler" label="Handled by" value={c.handler.email} onChange={(e) => choose(e.target.value)} className="text-base sm:text-sm">
      {options.map((h) => <option key={h.email} value={h.email}>{h.name}</option>)}
    </Select>
  );
}

export function ComplaintDetail() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Detail>(`${COMPLAINTS_API}&view=one&id=${encodeURIComponent(id)}`)
      .then((d) => {
        setDetail(d);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!detail) return <Loading />;
  const c = detail.complaint;
  const active = c.status !== 'closed' && c.status !== 'cancelled' && c.status !== 'resolved';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{c.id}</h2>
        <StatusPill status={c.status} />
        {active && <span className="text-xs text-gray-500">open for {daysOpen(c.createdAt)} days</span>}
        {c.legacyId && <span className="text-xs text-gray-500">intranet: {c.legacyId}</span>}
      </div>

      <Section title="Complaint" aside={<div className="w-full sm:w-64"><Assign detail={detail} onDone={load} /></div>}>
        <Rows
          rows={[
            ['Client', c.clientName],
            ['Sales contract', c.salesContractId],
            ['Trader', c.trader?.name ?? ''],
            ['Purchase contract', c.purchaseContractId],
            ['Supplier', c.supplierName],
            ['Purchase contract owner', c.purchaseOwner?.name ?? ''],
            ['Product', c.productName],
            ['Type', TYPE_LABELS[c.type]],
            ['Batch number', c.batchNumber],
            ['Quantity concerned', c.quantityKg === null ? '' : `${c.quantityKg.toLocaleString('en-GB')} kg`],
            ['Registered by', `${c.createdBy.name} · ${dateTime(c.createdAt)}`],
            ['Handled by', detail.can.includes('assign') ? '' : c.handler.name],
            ['Outcome', c.outcome ? `${OUTCOME_LABELS[c.outcome]}${c.settlement ? ` · ${SETTLEMENT_LABELS[c.settlement]}` : ''}` : ''],
            ['Resolution notes', c.resolutionNotes ? <span className="whitespace-pre-line">{c.resolutionNotes}</span> : ''],
          ]}
        />
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</p>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-900">{c.description}</p>
        </div>
      </Section>

      <StatusPanel detail={detail} onDone={load} />
      <Handling key={c.updatedAt} detail={detail} onDone={load} />
      <Files detail={detail} onDone={load} />
      <History detail={detail} onDone={load} />
    </div>
  );
}
