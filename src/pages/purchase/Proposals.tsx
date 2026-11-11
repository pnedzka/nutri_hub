import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import {
  PROPOSALS_PAGE_SIZE,
  PROPOSAL_STATUS_NAMES,
  TOP_OPTIONS,
  topOptions,
  type BidRefresh,
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
import { PURCHASE_API, dateAgo, day, eur, kg, sourceName } from './format';
import { OfferSearch } from './OfferSearch';
import { CopyEmail, Pager, Pill } from './ui';

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
  const [showAll, setShowAll] = useState(false);
  const open = p.status === 'pending_review';
  const decided = p.status === 'approved' || p.status === 'rejected';
  // Missing until db/central/bid_option_reject.sql runs in the central database.
  const rejected = p.rejected ?? [];
  // Missing until db/central/bid_card_ranking.sql runs in the central database.
  const sold = p.sold ?? [];
  const soldOptions = sold.map((s) => s.optionId);
  // Missing until db/central/bid_card_purchases.sql runs in the central database.
  const purchases = p.purchases ?? [];
  // The best offers first; the chosen and the sold ones stay visible wherever they rank.
  const options = showAll ? p.options : topOptions(p.options, [p.chosenOptionId, option, ...soldOptions]);
  const hidden = p.options.length - options.length;

  const decide = async (action: PurchaseAction, done: string) => {
    setBusy(true);
    const ok = await onDecide(action, done);
    setBusy(false);
    if (ok) setRejecting(false);
    return ok;
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
            {[p.category, `BID BUY ${dateAgo(p.bidBuyAt)}`, open && p.openUntil && `open until ${day(p.openUntil)}`].filter(Boolean).join(' · ')}
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
      {sold.map((s) => (
        <div key={s.dealId} className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          <p className="font-medium">
            {s.certain ? 'Sold in Apex Bid' : 'Probably sold in Apex Bid'}
            <span className="font-normal">
              {' · '}
              {[dateAgo(s.soldAt), s.trader, kg(s.quantityKg)].filter(Boolean).join(' · ')}
            </span>
          </p>
          <p className="text-xs text-green-800">
            {s.certain ? 'Apex Bid linked this sale to the BID BUY.' : 'Matched by product, chat and time, so check the message.'}{' '}
            {s.optionId ? 'The sold offer is marked below.' : 'The sold offer is not on this card.'}
            {open && ' The card stays open until you approve or reject it.'}
          </p>
          {s.text && (
            <details className="mt-1">
              <summary className="cursor-pointer select-none text-xs text-green-800">BID SOLD message</summary>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm [overflow-wrap:anywhere]">{s.text}</pre>
            </details>
          )}
        </div>
      ))}
      {p.bidBuyText && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer select-none text-xs text-gray-500">BID BUY message</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-sans text-sm text-gray-800 [overflow-wrap:anywhere]">{p.bidBuyText}</pre>
        </details>
      )}

      {/* What we last paid for the product: purchase contracts from the intranet. Information next to the offers, not an offer. */}
      {purchases.length > 0 && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-gray-500">
            Last purchases (contracts)
            {(p.purchasesTotal ?? 0) > purchases.length && <span className="font-normal"> · latest {purchases.length} of {p.purchasesTotal}</span>}
          </p>
          <ul className="mt-1 space-y-1">
            {purchases.map((c) => (
              <li key={c.id} className="text-gray-800 [overflow-wrap:anywhere]">
                <span className="font-medium">{eur(c.priceEurPerKg)}</span>
                {' · '}
                {[c.supplier ?? 'Unknown supplier', kg(c.quantityKg), c.incoterms, c.date && dateAgo(c.date)].filter(Boolean).join(' · ')}
                <span className="block text-xs text-gray-500">
                  {[c.contractId && `Contract ${c.contractId}`, c.buyer, c.productName !== p.product && c.productName].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The best offers by rank (decision of 10.11.2026); "Show all" brings every offer for the product, scrolling inside the card. */}
      <div className="mt-3 -mx-4 max-h-[22rem] overflow-auto sm:mx-0">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="sticky top-0 z-10 border-y border-gray-100 bg-gray-50">
            <tr>
              <th className={`${th} w-10`}>
                <span className="sr-only">Choose</span>
              </th>
              <th className={th}>Supplier</th>
              <th className={th}>Purchase price</th>
              <th className={th}>Terms</th>
              <th className={th}>Offer</th>
              {open && (
                <th className={`${th} w-10`}>
                  <span className="sr-only">Not this product</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {options.map((o) => {
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
                    <p className="font-medium text-gray-900">{o.supplier ?? (o.trader ? `BID SELL from ${o.trader}` : 'Unknown supplier')}</p>
                    {o.productName && <p className="text-xs text-gray-500 [overflow-wrap:anywhere]">{o.productName}</p>}
                    {soldOptions.includes(o.id) && (
                      <p className="mt-1">
                        <Pill tone="green">Sold</Pill>
                      </p>
                    )}
                    <div className="-ml-2">
                      <CopyEmail email={o.email} of={o.emailOf} />
                    </div>
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
                  {open && (
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        disabled={busy}
                        title="Not this product: hide offers with this name from this product's cards and send the name to Products to review"
                        aria-label={`Not this product: ${o.productName ?? o.supplier ?? `option ${o.rank}`}`}
                        onClick={() =>
                          void decide({ action: 'rejectOption', optionId: o.id }, 'Offer hidden. The name is waiting in Products to review.')
                        }
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-[#CC1F1F] disabled:opacity-50 sm:min-h-8 sm:min-w-8"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {p.options.length > TOP_OPTIONS && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          <Button size="sm" variant="ghost" className="-ml-2 min-h-11 sm:min-h-0" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? `Show the best ${TOP_OPTIONS}` : `Show all ${p.options.length} offers`}
          </Button>
          {!showAll && hidden > 0 && <p className="text-xs text-gray-500">{hidden} more, ranked lower</p>}
        </div>
      )}
      {open && p.options.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">No supplier offers left for this product. Reject the proposal or wait for new offers.</p>
      )}
      {rejected.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer select-none text-xs text-gray-500">
            {rejected.length === 1 ? '1 offer name' : `${rejected.length} offer names`} marked as not this product
          </summary>
          <ul className="mt-1 divide-y divide-gray-100 rounded-lg bg-gray-50">
            {rejected.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-gray-900 [overflow-wrap:anywhere]">{r.productName}</p>
                  <p className="text-xs text-gray-500">
                    {[r.supplier, `${r.rejectedBy}, ${formatDateTime(r.rejectedAt)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 sm:min-h-0"
                  disabled={busy}
                  onClick={() => void decide({ action: 'restoreOption', rejectionId: r.id }, 'Offer restored')}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <OfferSearch proposalId={p.id} open={open} busy={busy} onDecide={decide} />

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

  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<BidRefresh | null>(null);
  // Reads Apex Bid right now instead of waiting for the hourly run (about ten seconds), then shows the cards again.
  const checkApex = async () => {
    setChecking(true);
    try {
      const { result } = await api<{ result: BidRefresh }>(PURCHASE_API, { method: 'POST', body: { action: 'refreshBids' } satisfies PurchaseAction });
      setChecked(result);
      toast.success('Apex Bid checked', result.new > 0 ? `${result.new} new BID BUY ${result.new === 1 ? 'card' : 'cards'}.` : 'No new BID BUY.');
      reload();
    } catch (e) {
      toast.error('Apex Bid not checked', (e as Error).message);
    }
    setChecking(false);
  };

  const count = (f: Filter) => (f === 'all' ? Object.values(data?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0) : (data?.counts[f] ?? 0));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Each BID BUY from Apex Bid with the {TOP_OPTIONS} best supplier offers for the same product (purchase prices only): offers close in time to
        the BID BUY, BID SELLs from Apex Bid, low prices and enough quantity rank higher. Show all brings the rest. Approve the offer you would
        send to the sales rep, or reject the proposal. A green note means Apex Bid recorded a sale for the BID BUY. Last purchases shows what we paid for the product in our latest purchase contracts. If an offer is for a different product, remove it with ✕: offers with that name stop showing up
        for this product, and the name goes to Products to review. To find an offer the card missed, search all offers and purchase contracts on the
        card: approve the one you found, or add it to the card's product.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-0" isLoading={checking} onClick={() => void checkApex()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Check Apex Bid now
        </Button>
        <p className="text-xs text-gray-500" aria-live="polite">
          {checking
            ? 'Reading BID BUY and offers from Apex Bid, about ten seconds…'
            : checked
              ? `Checked ${formatDateTime(checked.checkedAt)}.`
              : 'Apex Bid is read every hour. Check now if you expect a new BID BUY.'}
        </p>
      </div>
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
