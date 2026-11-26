import { useEffect, useState } from 'react';
import { ArrowLeft, Archive as ArchiveIcon, Paperclip, Search } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { money } from '../../../shared/contractsApi.ts';
import {
  archiveDate,
  archiveLineTotal,
  filled,
  type ArchiveContract,
  type ArchiveDate,
  type ArchiveItem,
  type ArchiveList as List,
  type ArchiveParty,
} from '../../../shared/contractsArchive.ts';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { CONTRACTS_API, shortDate } from './common';
import { Section } from './ui';
import { Loading } from '../../components/States';

// "Archive (intranet)": contracts from the old intranet, read only. They stay in the intranet's shape (see
// shared/contractsArchive.ts); nothing here can be changed or signed.

const typeName = (type: string) => (type === 'S' ? 'Sales' : type === 'P' ? 'Purchase' : type);
const day = (value: ArchiveDate) => {
  const iso = archiveDate(value);
  return iso ? shortDate(iso) : '';
};
const select = 'min-h-11 sm:min-h-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-base sm:text-sm text-gray-900';

function OldStatus({ status, archived }: { status: string; archived: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 whitespace-nowrap">
      {status || 'Unknown'}
      {archived ? ' · archived' : ''}
    </span>
  );
}

export function ArchiveList() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [owner, setOwner] = useState('');
  const [year, setYear] = useState('');
  const [list, setList] = useState<List | null>(null);
  const [more, setMore] = useState<ArchiveItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const filters = `&q=${encodeURIComponent(q.trim())}&type=${type}&owner=${encodeURIComponent(owner)}&year=${year}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<List>(`${CONTRACTS_API}&view=archive${filters}`, { signal: controller.signal })
        .then((l) => {
          setList(l);
          setMore([]);
          setError('');
        })
        .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    }, q ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, q]);

  const items = list ? [...list.items, ...more] : [];

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await api<List>(`${CONTRACTS_API}&view=archive${filters}&offset=${items.length}`);
      setMore((m) => [...m, ...next.items]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Contracts from the old intranet, for reference only. They cannot be changed or signed here. New contracts are made in this module.
      </p>
      <Input
        aria-label="Search the archive"
        placeholder="Search by number, company or product"
        leftIcon={<Search size={16} />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="text-base sm:text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Type" className={select} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Sales and purchase</option>
          <option value="S">Sales</option>
          <option value="P">Purchase</option>
        </select>
        {list && list.owners.length > 1 && (
          <select aria-label="Trader" className={select} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All traders</option>
            {list.owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
        {list && list.years.length > 0 && (
          <select aria-label="Year" className={select} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {list.years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {list && !items.length && <p className="py-8 text-center text-sm text-gray-500">No old contracts match.</p>}
      {items.length > 0 && (
        <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {items.map((c) => (
            <li key={c.id}>
              <Link to={`/contracts/archive/${encodeURIComponent(c.id)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-6 py-3 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{c.companyName || 'No company'}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {c.id} · {typeName(c.type)}{c.ownerName ? ` · ${c.ownerName}` : ''}{c.submissionDate ? ` · ${shortDate(c.submissionDate)}` : ''}
                  </p>
                  {c.products && <p className="text-xs text-gray-500 truncate">{c.products}</p>}
                </div>
                <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{money(Number(c.amount), c.currency)}</p>
                <OldStatus status={c.status} archived={c.archived} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list && list.total > items.length && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-500">Showing {items.length} of {list.total}.</p>
          <Button variant="secondary" className="min-h-11 sm:min-h-0" isLoading={loadingMore} onClick={loadMore}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

function Rows({ rows }: { rows: [string, string | null | undefined][] }) {
  const shown = rows.filter(([, v]) => filled(v));
  if (!shown.length) return <p className="text-sm text-gray-500">Nothing filled in.</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-1.5 text-sm">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-gray-500">{label}</dt>
          <dd className="text-gray-900 break-words">{filled(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

const address = (p: ArchiveParty | null | undefined) =>
  p ? [filled(p.street), [filled(p.postalCode), filled(p.city)].filter(Boolean).join(' '), filled(p.countryCode)].filter(Boolean).join(', ') : '';
const person = (p: ArchiveParty | null | undefined) =>
  p ? [filled(p.contactPersonFirstName), filled(p.contactPersonLastName)].filter(Boolean).join(' ') + (filled(p.contactPersonPosition) ? ` (${filled(p.contactPersonPosition)})` : '') : '';

export function ArchiveDetail() {
  const { id = '' } = useParams();
  const [contract, setContract] = useState<ArchiveContract | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api<{ contract: ArchiveContract }>(`${CONTRACTS_API}&view=archiveOne&id=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((r) => setContract(r.contract))
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => controller.abort();
  }, [id]);

  const back = (
    <Link to="/contracts/archive" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
      <ArrowLeft size={16} /> Archive (intranet)
    </Link>
  );
  if (error) return <div className="space-y-3">{back}<p className="text-sm text-red-600">{error}</p></div>;
  if (!contract) return <div className="space-y-3">{back}<Loading /></div>;

  const c = contract;
  const pay = c.paymentTerms;
  const party = c.type === 'P' ? 'Seller' : 'Buyer';
  return (
    <div className="space-y-4">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <ArchiveIcon size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">{c.id}</h2>
        <OldStatus status={c.status} archived={c.archived} />
        <span className="text-sm text-gray-500">From the old intranet, read only</span>
      </div>

      <Section title="Contract">
        <Rows
          rows={[
            ['Type', typeName(c.type)],
            ['Trader', c.ownerName],
            ['Submission date', c.submissionDate ? shortDate(c.submissionDate) : ''],
            ['Total net', money(Number(c.amount), c.currency)],
            ['Represented by', c.representative],
            ['Signed by the representative', c.signedByRepresentative === null ? '' : c.signedByRepresentative ? 'Yes' : 'No'],
            ['Linked contract', c.linkedContractId],
            ['Proforma invoice', c.proformaInvoiceNumber],
            ['VAT invoice', c.vatInvoiceNumber],
            ['Shipment date', day(c.shipmentDate)],
          ]}
        />
      </Section>

      <Section title={party}>
        <Rows
          rows={[
            ['Company name', c.buyer?.companyName],
            ['VAT ID', c.buyer?.vatId],
            ['Address', address(c.buyer)],
            ['Contact person', person(c.buyer)],
            ['E-mail', c.buyer?.email],
            ['Phone', c.buyer?.phone],
          ]}
        />
      </Section>

      <Section title="Products">
        {c.lines.length ? (
          <ul className="divide-y divide-gray-100 -my-2">
            {c.lines.map((line, i) => {
              const total = archiveLineTotal(line);
              return (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{filled(line.productName) || 'Product'}{filled(line.productGrade) ? ` · ${filled(line.productGrade)}` : ''}</p>
                    <p className="text-gray-500">
                      {filled(line.quantity)} {filled(line.unit)}
                      {filled(line.unitPrice) ? ` × ${filled(line.unitPrice)} ${filled(line.currency) || c.currency}/${filled(line.priceUnit) || filled(line.unit)}` : ''}
                    </p>
                  </div>
                  {total !== null && <p className="font-medium text-gray-900 whitespace-nowrap">{money(total, filled(line.currency) || c.currency)}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No products.</p>
        )}
      </Section>

      <Section title="Delivery">
        <Rows
          rows={[
            ['Incoterms', c.delivery?.deliveryBasis],
            ['By air', c.delivery?.byAir ? 'Yes' : ''],
            ['Address', address(c.delivery)],
            ['Delivery from', day(c.delivery?.dateFrom)],
            ['Delivery to', day(c.delivery?.dateTo)],
            ['Contact person', person(c.delivery)],
            ['Contact e-mail', c.delivery?.contactPersonEmail],
            ['Contact phone', c.delivery?.contactPersonPhone],
            ['Instructions', c.delivery?.instructions],
          ]}
        />
      </Section>

      <Section title="Payment">
        <Rows
          rows={[
            ['Payment', pay?.paymentType],
            ['Prepayment due', day(pay?.prepaymentDetails?.prepaymentDueDate)],
            ['Payment due', day(pay?.deferredPaymentDetails?.paymentDueDate)],
            ['Days from the invoice date', filled(pay?.deferredPaymentDetails?.daysFromInvoiceDate)],
            ['Factoring', pay?.usesFactoring ? 'Yes' : ''],
            ['Notes', pay?.additionalPaymentNotes],
            ['Documents', (c.requiredDocuments ?? []).join(', ')],
          ]}
        />
      </Section>

      <Section title="Attachments">
        {c.attachments.length ? (
          <ul className="space-y-2">
            {c.attachments.map((a) => (
              <li key={a.url} className="text-sm">
                <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 text-[#CC1F1F] hover:underline break-all">
                  <Paperclip size={14} className="shrink-0" />
                  {a.fileName || 'File'}
                </a>
                <span className="text-gray-500">
                  {a.type ? ` · ${a.type}` : ''}
                  {a.uploadedBy ? ` · ${a.uploadedBy}` : ''}
                  {a.uploadedAt ? ` · ${shortDate(a.uploadedAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No attachments in the intranet.</p>
        )}
      </Section>
    </div>
  );
}
