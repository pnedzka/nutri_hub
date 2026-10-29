import { useState } from 'react';
import {
  PROPOSALS_PAGE_SIZE,
  PROPOSAL_STATUS_NAMES,
  type Proposal,
  type ProposalPage,
  type ProposalStatus,
  type PurchaseAction,
} from '../../../shared/purchaseApi.ts';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useToast } from '../../lib/toast';
import { Empty, ErrorNote, Loading } from '../leave/ui';
import { useApi } from '../leave/useApi';
import { PURCHASE_API, dateAgo, eur, kg, sourceName } from './format';
import { Pager, Pill } from './ui';

type Filter = ProposalStatus | 'all';
const FILTERS: Filter[] = ['pending_review', 'approved', 'rejected', 'expired', 'all'];

const STATUS_TONE: Record<ProposalStatus, 'amber' | 'green' | 'red' | 'gray' | 'blue'> = {
  pending_review: 'amber',
  approved: 'green',
  rejected: 'red',
  sent: 'blue',
  expired: 'gray',
};

const th = 'px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap';
const td = 'px-3 py-2.5 align-top';

function ProposalCard({ proposal: p, onDecide }: { proposal: Proposal; onDecide: (action: PurchaseAction, done: string) => Promise<boolean> }) {
  const [option, setOption] = useState<number | null>(p.chosenOptionId ?? p.options[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = p.status === 'pending_review';
  const decided = p.status === 'approved' || p.status === 'rejected';

  const decide = async (action: PurchaseAction, done: string) => {
    setBusy(true);
    const ok = await onDecide(action, done);
    setBusy(false);
    if (ok) setRejecting(false);
  };

  const request = [kg(p.requestedKg), [p.requestedIncoterms, p.requestedLocation].filter(Boolean).join(' '), p.targetPriceEurPerKg !== null && `target ${eur(p.targetPriceEurPerKg)}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 [overflow-wrap:anywhere]">{p.product}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {[p.category, `BID BUY ${dateAgo(p.bidBuyAt)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Pill tone={STATUS_TONE[p.status]}>{PROPOSAL_STATUS_NAMES[p.status]}</Pill>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-gray-500">Sales rep</dt>
          <dd className="text-gray-900">{p.salesRep ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Customer</dt>
          <dd className="text-gray-900">{p.customer ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Request</dt>
          <dd className="text-gray-900">{request || '—'}</dd>
        </div>
      </dl>
      {p.bidBuyText && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer select-none text-xs text-gray-500">BID BUY message</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-sans text-sm text-gray-800 [overflow-wrap:anywhere]">{p.bidBuyText}</pre>
        </details>
      )}

      <div className="mt-3 -mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="border-y border-gray-100 bg-gray-50">
            <tr>
              <th className={`${th} w-10`}>
                <span className="sr-only">Choose</span>
              </th>
              <th className={th}>Supplier</th>
              <th className={th}>Purchase price</th>
              <th className={th}>Terms</th>
              <th className={th}>Offer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.options.map((o) => {
              const chosen = p.chosenOptionId === o.id;
              return (
                <tr key={o.id} className={chosen ? 'bg-green-50/60' : undefined}>
                  <td className={td}>
                    {open ? (
                      <input
                        type="radio"
                        name={`proposal-${p.id}`}
                        aria-label={`Option ${o.rank}`}
                        className="mt-0.5 h-4 w-4 accent-[#CC1F1F]"
                        checked={option === o.id}
                        onChange={() => setOption(o.id)}
                      />
                    ) : (
                      <span className="text-gray-400">{o.rank}</span>
                    )}
                  </td>
                  <td className={`${td} min-w-40`}>
                    <p className="font-medium text-gray-900">{o.supplier ?? 'Unknown supplier'}</p>
                    {o.productName && <p className="text-xs text-gray-500 [overflow-wrap:anywhere]">{o.productName}</p>}
                  </td>
                  <td className={`${td} whitespace-nowrap font-medium text-gray-900`}>{eur(o.priceEurPerKg)}</td>
                  <td className={`${td} text-gray-700`}>
                    {[o.incoterms, o.location].filter(Boolean).join(' ') || '—'}
                    {o.quantityKg !== null && <p className="text-xs text-gray-500">{kg(o.quantityKg)} available</p>}
                    {o.leadTime && <p className="text-xs text-gray-500">{o.leadTime}</p>}
                  </td>
                  <td className={`${td} text-gray-700`}>
                    <p className="whitespace-nowrap">{dateAgo(o.offeredAt)}</p>
                    <p className="text-xs text-gray-500">{sourceName(o.source)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(p.reviewedBy || p.reviewNote) && (
        <p className="mt-3 text-xs text-gray-500">
          {p.reviewedBy && `${PROPOSAL_STATUS_NAMES[p.status]} by ${p.reviewedBy}, ${formatDateTime(p.reviewedAt)}`}
          {p.reviewNote && ` · “${p.reviewNote}”`}
        </p>
      )}

      {open && !rejecting && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            className="min-h-11 sm:min-h-0"
            isLoading={busy}
            disabled={!option}
            onClick={() => option && void decide({ action: 'decide', proposalId: p.id, status: 'approved', optionId: option }, 'Proposal approved')}
          >
            Approve chosen offer
          </Button>
          <Button variant="ghost" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
      {open && rejecting && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? (optional)"
            maxLength={500}
            className="min-h-11 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
          />
          <Button
            variant="danger"
            className="min-h-11"
            isLoading={busy}
            onClick={() => void decide({ action: 'decide', proposalId: p.id, status: 'rejected', note: note.trim() || undefined }, 'Proposal rejected')}
          >
            Reject proposal
          </Button>
          <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setRejecting(false)}>
            Cancel
          </Button>
        </div>
      )}
      {decided && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-0"
            isLoading={busy}
            onClick={() => void decide({ action: 'decide', proposalId: p.id, status: 'pending_review' }, 'Back to review')}
          >
            Undo decision
          </Button>
        </div>
      )}
    </Card>
  );
}

export function Proposals() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('pending_review');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApi<ProposalPage>(`${PURCHASE_API}&view=proposals&status=${filter}&page=${page}`);

  const onDecide = async (action: PurchaseAction, done: string) => {
    try {
      await api(PURCHASE_API, { method: 'POST', body: action });
      toast.success(done);
      reload();
      return true;
    } catch (e) {
      toast.error('Not saved', (e as Error).message);
      return false;
    }
  };

  const count = (f: Filter) => (f === 'all' ? Object.values(data?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0) : (data?.counts[f] ?? 0));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Each BID BUY from Apex Bid with the cheapest recent supplier offers for the same product (purchase prices only). Approve the offer you would
        send to the sales rep, or reject the proposal.
      </p>
      <nav className="-mx-4 overflow-x-auto sm:mx-0" aria-label="Status">
        <div className="flex gap-2 px-4 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 ${
                  active ? 'border-[#CC1F1F] bg-[#CC1F1F] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {f === 'all' ? 'All' : PROPOSAL_STATUS_NAMES[f]}
                {data && <span className={active ? 'ml-1.5 text-white/80' : 'ml-1.5 text-gray-400'}>{count(f)}</span>}
              </button>
            );
          })}
        </div>
      </nav>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <Empty>No proposals here.</Empty>}
      <ul className="space-y-3">
        {data?.items.map((p) => (
          <li key={`${p.id}-${p.status}`}>
            <ProposalCard proposal={p} onDecide={onDecide} />
          </li>
        ))}
      </ul>
      {data && <Pager page={page} total={data.total} size={PROPOSALS_PAGE_SIZE} onPage={setPage} />}
    </div>
  );
}
