import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OFFER_SEARCH_MIN, type OfferSearchResult, type PurchaseAction } from '../../../shared/purchaseApi.ts';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';
import { PURCHASE_API, dateAgo, eur, kg, sourceName, whole } from './format';
import { Pill } from './ui';

/**
 * The search on a BID BUY card (decision of 30.10.2026): a phrase looked up in all offers of the database and in the
 * intranet's purchase contracts, not only in the offers matched to the card's product. Newest first. A found offer
 * can be approved for the proposal, or added to the card's product so offers with its name show up there from now on.
 */
export function OfferSearch({
  proposalId,
  open,
  busy,
  onDecide,
}: {
  proposalId: number;
  open: boolean;
  busy: boolean;
  onDecide: (action: PurchaseAction, done: string) => Promise<boolean>;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<OfferSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a decision, so the results ask again (offers added to the product leave them).
  const [round, setRound] = useState(0);
  const query = q.trim().replace(/\s+/g, ' ');
  const result = query.length >= OFFER_SEARCH_MIN && found?.q === query ? found : null;
  const searching = query.length >= OFFER_SEARCH_MIN && !result && !error;

  useEffect(() => {
    if (query.length < OFFER_SEARCH_MIN) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<OfferSearchResult>(`${PURCHASE_API}&view=offerSearch&proposal=${proposalId}&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => {
          setFound({ ...r, q: query });
          setError(null);
        })
        .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, proposalId, round]);

  const act = async (action: PurchaseAction, done: string) => {
    if (await onDecide(action, done)) setRound((r) => r + 1);
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setError(null);
          }}
          aria-label="Search all offers"
          placeholder="Search all offers and contracts, e.g. creatine 200 mesh"
          maxLength={100}
          className="w-full min-h-11 rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {searching && <p className="text-xs text-gray-500">Searching…</p>}
      {result && (
        <div className="space-y-3">
          <section>
            <h4 className="text-xs font-medium text-gray-500">
              Other offers in the database · {result.total === 0 ? 'none found' : whole(result.total)}
              {result.total > result.offers.length && ` (newest ${result.offers.length} shown, narrow the search)`}
            </h4>
            {result.offers.length > 0 && (
              <ul className="mt-1 max-h-[22rem] divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-100">
                {result.offers.map((o) => (
                  <li key={o.offerId} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5 text-sm">
                    <div className="min-w-48 flex-1">
                      <p className="font-medium text-gray-900">{o.supplier ?? (o.trader ? `BID SELL from ${o.trader}` : 'Unknown supplier')}</p>
                      {o.productName && <p className="text-xs text-gray-600 [overflow-wrap:anywhere]">{o.productName}</p>}
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        {o.onThisProduct ? (
                          <Pill tone="green">This product</Pill>
                        ) : (
                          <Pill title="The catalogue product this offer is matched to now">{o.product ?? 'No product'}</Pill>
                        )}
                        <span>
                          {dateAgo(o.offeredAt)} · {sourceName(o.source)}
                        </span>
                      </p>
                    </div>
                    <div className="min-w-32">
                      <p className="whitespace-nowrap font-medium text-gray-900">{eur(o.priceEurPerKg)}</p>
                      <p className="text-xs text-gray-500">{[o.incoterms, o.location].filter(Boolean).join(' ') || '—'}</p>
                      {o.quantityKg !== null && <p className="text-xs text-gray-500">{kg(o.quantityKg)} available</p>}
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                      {open && (
                        <Button
                          size="sm"
                          className="min-h-11 sm:min-h-0"
                          disabled={busy}
                          onClick={() => void act({ action: 'chooseOffer', proposalId, offerId: o.offerId }, 'Proposal approved with the offer you found')}
                        >
                          Approve this offer
                        </Button>
                      )}
                      {!o.onThisProduct && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="min-h-11 sm:min-h-0"
                          disabled={busy}
                          title="Offers with this name go to this card's product from now on (undo with ✕ on the card)"
                          onClick={() =>
                            void act({ action: 'assignOffer', proposalId, offerId: o.offerId }, 'Added to this product. Offers with this name are on the card now.')
                          }
                        >
                          Add to this product
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4 className="text-xs font-medium text-gray-500">
              Purchase contracts (intranet) · {result.contractsTotal === 0 ? 'none found' : whole(result.contractsTotal)}
              {result.contractsTotal > result.contracts.length && ` (newest ${result.contracts.length} shown)`}
            </h4>
            {result.contracts.length > 0 && (
              <ul className="mt-1 max-h-[16rem] divide-y divide-gray-100 overflow-auto rounded-lg border border-gray-100">
                {result.contracts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
                    <div className="min-w-48 flex-1">
                      <p className="font-medium text-gray-900">{c.supplier ?? 'Unknown supplier'}</p>
                      {c.productName && <p className="text-xs text-gray-600 [overflow-wrap:anywhere]">{c.productName}</p>}
                      <p className="mt-0.5 text-xs text-gray-500">{[c.contractId, c.status, dateAgo(c.date)].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="min-w-32">
                      <p className="whitespace-nowrap font-medium text-gray-900">{eur(c.priceEurPerKg)}</p>
                      <p className="text-xs text-gray-500">{[kg(c.quantityKg), c.incoterms].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
