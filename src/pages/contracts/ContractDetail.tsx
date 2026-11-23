import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Pencil, Upload } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BOARD_THRESHOLD_EUR,
  INCOTERM_NAMES,
  STATUS_LABELS,
  TERMS_TITLE,
  countryName,
  lineTotal,
  money,
  formatCn,
  paymentText,
  type Contract,
  type ContractAction,
} from '../../../shared/contractsApi.ts';
import { Button } from '../../components/Button';
import { Textarea } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { CONTRACTS_API, dateTime, shortDate, uploadTo, useSetup } from './common';
import { Section, StatusPill } from './ui';
import { downloadContractPdf, downloadFile } from './pdf';

interface Detail {
  contract: Contract;
  can: ContractAction[];
  files: { terms: string | null; signature: string | null; scan: string | null };
}

const ACTION_TEXT: Record<string, string> = {
  create: 'Generated',
  update: 'Corrected and sent again',
  accept: 'Accepted by administration',
  approve: 'Approved (for the board)',
  sign: 'Signed',
  return: 'Returned for corrections',
  cancel: 'Cancelled',
  client_scan: 'Scan signed by the client uploaded',
};

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr] text-sm">
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

/** The step the person may take now: one panel with what it needs (the enova order number, a comment). */
function Actions({ detail, onDone }: { detail: Detail; onDone: (c: Contract) => void }) {
  const { contract, can } = detail;
  const toast = useToast();
  const navigate = useNavigate();
  const [enovaOrder, setEnovaOrder] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<'return' | 'cancel' | null>(null);
  const setup = useSetup();

  const run = async (action: 'accept' | 'approve' | 'sign' | 'return' | 'cancel', body: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const { contract: next } = await api<{ contract: Contract }>(CONTRACTS_API, { method: 'POST', body: { action, id: contract.id, ...body } });
      toast.success(STATUS_LABELS[next.status]);
      setMode(null);
      setComment('');
      onDone(next);
    } catch (error) {
      toast.error('The step was not saved', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const main = can.find((a) => a === 'accept' || a === 'approve' || a === 'sign');
  if (!main && !can.includes('edit') && !can.includes('return') && !can.includes('cancel')) return null;

  return (
    <Section title="Your step">
      <div className="space-y-4">
        {main === 'accept' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Enter the order in enova, then accept the contract. It goes to Marcin Niećko for signature.</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="sm:w-64">
                <Input label="enova order number (optional)" value={enovaOrder} onChange={(e) => setEnovaOrder(e.target.value)} className="text-base sm:text-sm" />
              </div>
              <Button className="min-h-11" isLoading={busy === 'accept'} onClick={() => run('accept', { enovaOrder })}>
                Accept the contract
              </Button>
            </div>
          </div>
        )}
        {main === 'approve' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              The contract is above {BOARD_THRESHOLD_EUR.toLocaleString('en-GB')} EUR net ({money(contract.amountEur, 'EUR')}). Approve it and a board member signs it.
            </p>
            <Button className="min-h-11" isLoading={busy === 'approve'} onClick={() => run('approve')}>
              Approve for the board
            </Button>
          </div>
        )}
        {main === 'sign' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Your signature from Settings goes into the contract{setup ? '' : ''}. The trader gets an e-mail to send the contract to the client.
            </p>
            <Button className="min-h-11" isLoading={busy === 'sign'} onClick={() => run('sign')}>
              Sign the contract
            </Button>
          </div>
        )}
        {can.includes('edit') && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Correct the contract and send it again to administration.</p>
            <Button className="min-h-11 inline-flex items-center gap-1.5" onClick={() => navigate(`/contracts/${encodeURIComponent(contract.id)}/edit`)}>
              <Pencil size={16} /> Correct the contract
            </Button>
          </div>
        )}
        {(can.includes('return') || can.includes('cancel')) && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            {can.includes('return') && (
              <Button variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => setMode(mode === 'return' ? null : 'return')}>
                Return for corrections
              </Button>
            )}
            {can.includes('cancel') && (
              <Button variant="ghost" className="min-h-11 sm:min-h-0 text-red-700" onClick={() => setMode(mode === 'cancel' ? null : 'cancel')}>
                Cancel the contract
              </Button>
            )}
          </div>
        )}
        {mode && (
          <div className="space-y-3">
            <Textarea id="step-comment" label={mode === 'return' ? 'What should the trader correct?' : 'Why is it cancelled?'} rows={3} value={comment}
              onChange={(e) => setComment(e.target.value)} className="text-base sm:text-sm" />
            <Button variant={mode === 'cancel' ? 'danger' : 'primary'} className="min-h-11" disabled={!comment.trim()} isLoading={busy === mode} onClick={() => run(mode, { comment })}>
              {mode === 'return' ? 'Return to the trader' : 'Cancel the contract'}
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

function Documents({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const { contract, files, can } = detail;
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const signed = Boolean(contract.signedBy);
  const short = contract.type === 'S' ? 'OWS' : 'OWZ';

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error('Something went wrong', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const contractPdf = () => downloadContractPdf(contract, files.signature);
  const terms = async () => {
    if (!files.terms) throw new Error(`The ${TERMS_TITLE[contract.type]} are not uploaded yet. Administration adds them in Settings.`);
    await downloadFile(files.terms, `${contract.id} - ${short}.pdf`);
  };

  const uploadScan = (file: File) =>
    wrap('scan', async () => {
      const { path, signedUrl } = await api<{ path: string; signedUrl: string }>(CONTRACTS_API, {
        method: 'POST',
        body: { action: 'scanUploadUrl', id: contract.id, fileName: file.name },
      });
      await uploadTo(signedUrl, file);
      await api(CONTRACTS_API, { method: 'POST', body: { action: 'client_scan', id: contract.id, path, fileName: file.name } });
      toast.success('Scan uploaded', 'Administration got an e-mail.');
      onDone();
    });

  return (
    <Section title="Documents">
      <div className="space-y-4">
        {signed ? (
          <>
            <p className="text-sm text-gray-700">
              Send the client both files: the contract signed by Nutri Partners and the {TERMS_TITLE[contract.type]} ({short}).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11 inline-flex items-center gap-1.5" isLoading={busy === 'both'}
                onClick={() => wrap('both', async () => { await contractPdf(); await terms(); })}>
                <Download size={16} /> Download both PDFs
              </Button>
              <Button variant="secondary" className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" isLoading={busy === 'pdf'} onClick={() => wrap('pdf', contractPdf)}>
                <FileText size={16} /> Contract
              </Button>
              <Button variant="secondary" className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" isLoading={busy === 'terms'} onClick={() => wrap('terms', terms)}>
                <FileText size={16} /> {short}
              </Button>
            </div>
            {!files.signature && <p className="text-xs text-amber-700">The signer's signature image is not uploaded yet (Settings), so the PDF has an empty signature line.</p>}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" isLoading={busy === 'pdf'} onClick={() => wrap('pdf', contractPdf)}>
              <FileText size={16} /> Preview PDF (draft)
            </Button>
            <p className="text-xs text-gray-500">The PDF to send to the client is ready after Nutri Partners signs.</p>
          </div>
        )}
        {contract.clientScan && files.scan && (
          <p className="text-sm text-gray-700">
            Signed by the client:{' '}
            <button type="button" className="text-[#CC1F1F] hover:underline" onClick={() => wrap('scan-dl', () => downloadFile(files.scan!, contract.clientScan!.fileName || `${contract.id} - signed.pdf`))}>
              {contract.clientScan.fileName}
            </button>{' '}
            <span className="text-gray-500">({contract.clientScan.email}, {dateTime(contract.clientScan.at)})</span>
          </p>
        )}
        {can.includes('client_scan') && (
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <p className="text-sm text-gray-700">
              {contract.clientScan ? 'Upload a newer scan if the client sent another one.' : 'When the client returns the signed contract, upload the scan here (PDF, JPG or PNG).'}
            </p>
            <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) uploadScan(file);
              }} />
            <Button variant={contract.clientScan ? 'secondary' : 'primary'} className="min-h-11 inline-flex items-center gap-1.5" isLoading={busy === 'scan'} onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> Upload the signed scan
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

export function ContractDetail() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Detail>(`${CONTRACTS_API}&view=one&id=${encodeURIComponent(id)}`)
      .then((d) => {
        setDetail(d);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!detail) return <p className="text-sm text-gray-500">Loading…</p>;
  const c = detail.contract;
  const { party, products, delivery, payment, documents } = c.data;
  const sale = c.type === 'S';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500">{sale ? 'Sales' : 'Purchase'} contract {c.id}{c.version > 1 ? ` · version ${c.version}` : ''}</p>
          <h2 className="text-lg font-semibold text-gray-900">{c.companyName}</h2>
          <p className="text-sm text-gray-500">
            {money(c.amountNet, c.currency)} net{c.currency !== 'EUR' ? ` (${money(c.amountEur, 'EUR')})` : ''} · {c.ownerName} · {shortDate(c.submissionDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.factoring && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">Factoring</span>}
          {c.boardRequired && <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-800">Board signs</span>}
          <StatusPill status={c.status} />
        </div>
      </div>

      {c.status === 'returned' && c.returnComment && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Returned for corrections:</span> {c.returnComment}
        </p>
      )}

      <Actions detail={detail} onDone={load} />
      {c.status !== 'cancelled' && <Documents detail={detail} onDone={load} />}

      <Section title={sale ? 'Buyer' : 'Supplier'}>
        <Rows rows={[
          ['Company', party.companyName],
          ['VAT ID', party.vatId],
          ['Address', `${party.street}, ${party.postalCode} ${party.city}, ${countryName(party.country)}`],
          ['Contact', [`${party.contactFirstName} ${party.contactLastName}`.trim(), party.contactPosition].filter(Boolean).join(', ')],
          ['E-mail', party.email],
          ['Phone', party.phone],
        ]} />
      </Section>

      <Section title="Goods">
        <div className="-mx-4 sm:mx-0 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 sm:px-0 py-2 font-semibold">Product</th>
                <th className="px-3 py-2 font-semibold text-right">Quantity</th>
                <th className="px-3 py-2 font-semibold text-right">Price</th>
                <th className="px-4 sm:px-0 py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((line, i) => (
                <tr key={i}>
                  <td className="px-4 sm:px-0 py-2 text-gray-900">
                    {line.name}
                    {line.cnCode && <span className="block text-xs text-gray-500 tabular-nums">CN {formatCn(line.cnCode)}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{line.quantity.toLocaleString('en-GB')} {line.unit}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{money(line.unitPrice, c.currency)} / {line.priceUnit === '1000PCS' ? '1000 PCS' : line.priceUnit}</td>
                  <td className="px-4 sm:px-0 py-2 text-right whitespace-nowrap font-medium">{money(lineTotal(line) ?? 0, c.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Delivery and payment">
        <Rows rows={[
          ['Incoterms 2020', `${delivery.incoterm} – ${INCOTERM_NAMES[delivery.incoterm]}${delivery.byAir ? ' (by air)' : ''}`],
          ['Address', `${delivery.street}, ${delivery.postalCode} ${delivery.city}, ${countryName(delivery.country)}`],
          ['Delivery', `${shortDate(delivery.dateFrom)}${delivery.dateTo !== delivery.dateFrom ? ` – ${shortDate(delivery.dateTo)}` : ''}`],
          ['Delivery contact', [delivery.contactName, delivery.contactEmail, delivery.contactPhone].filter(Boolean).join(', ')],
          ['Instructions', delivery.instructions],
          ['Payment', paymentText(payment)],
          ['Factoring', payment.factoring ? 'Yes' : 'No'],
          ['Payment notes', payment.notes],
          ['Documents', documents.join(', ')],
          ['enova order', c.enovaOrder ?? ''],
        ]} />
      </Section>

      <Section title="History">
        <ol className="space-y-2 text-sm">
          {(c.events ?? []).map((e, i) => (
            <li key={i} className="flex flex-wrap gap-x-2">
              <span className="text-gray-500 whitespace-nowrap">{dateTime(e.at)}</span>
              <span className="text-gray-900">{ACTION_TEXT[e.action] ?? e.action}</span>
              <span className="text-gray-500">· {e.actorName}</span>
              {e.comment && <span className="w-full text-gray-600 italic">“{e.comment}”</span>}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
