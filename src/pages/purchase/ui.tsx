import { useEffect, useState } from 'react';
import { Mail, MessageSquare, Search } from 'lucide-react';
import { eurAtNbp, formatPrice, type EmailOf, type PriceLike, type ProductHit } from '../../../shared/purchaseApi.ts';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { PURCHASE_API, sourceName, whole } from './format';
import { useNbpRates } from './nbp';

export function Pill({ children, tone = 'gray', title }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue'; title?: string }) {
  const tones = {
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    green: 'bg-green-50 text-green-800 border-green-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
  };
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** "Approved · Apex Bid" for a catalogue product. */
export function ProductStatus({ product }: { product: Pick<ProductHit, 'status' | 'source'> }) {
  return (
    <>
      {product.status === 'approved' ? <Pill tone="green">Approved</Pill> : <Pill tone="amber">Pending</Pill>}
      {product.source && <Pill>{sourceName(product.source)}</Pill>}
    </>
  );
}

export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button variant="secondary" className="min-h-11 sm:min-h-0" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <p className="text-center text-xs text-gray-500">
        Page {page} of {pages} · {whole(from)}–{whole(to)} of {whole(total)}
      </p>
      <Button variant="secondary" className="min-h-11 sm:min-h-0" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

/** Search in the product catalogue (approved and pending products), to merge into or to match a name to. */
export function ProductPicker({
  initial,
  exclude,
  actionLabel,
  busy,
  onPick,
  onCancel,
}: {
  initial: string;
  exclude: number;
  actionLabel: string;
  busy: boolean;
  onPick: (product: ProductHit) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<{ query: string; hits: ProductHit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = q.trim();
  // Results of an older query stay hidden until the current one answers.
  const hits = query.length >= 2 && found?.query === query ? found.hits : null;

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<{ products: ProductHit[] }>(`${PURCHASE_API}&view=search&q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => {
          setFound({ query, hits: r.products.filter((p) => p.productId !== exclude) });
          setError(null);
        })
        .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, exclude]);

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the catalogue…"
          className="w-full min-h-11 rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {hits && hits.length === 0 && <p className="py-2 text-sm text-gray-500">No products found.</p>}
      {hits && hits.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
          {hits.map((p) => (
            <li key={p.productId} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <ProductStatus product={p} />
                  {p.category && <span>{p.category}</span>}
                  <span>· {whole(p.offers)} offers</span>
                </p>
              </div>
              <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => onPick(p)}>
                {actionLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-0" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** "Copy e-mail" next to an offer, so Purchase Manager can ask the supplier about availability or price. */
export function CopyEmail({ email, of }: { email?: string | null; of?: EmailOf | null }) {
  const toast = useToast();
  if (!email) return null;
  const whose = of === 'trader' ? 'trader who posted this BID SELL' : 'supplier';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('E-mail copied', email);
    } catch {
      toast.error('Could not copy', email);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={`Copy the e-mail of the ${whose}: ${email}`}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 sm:min-h-7"
    >
      <Mail className="h-3.5 w-3.5" aria-hidden />
      {of === 'trader' ? 'Copy trader e-mail' : 'Copy e-mail'}
    </button>
  );
}

/** Copies a ready BID SELL message for the Apex Bid WhatsApp group (bidSellMessage in shared/purchaseApi.ts). */
export function CopyBidSell({ text }: { text: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('BID SELL copied', 'Paste it into WhatsApp.');
    } catch {
      toast.error('Could not copy', text);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={`Copy a ready BID SELL message for WhatsApp:\n\n${text}`}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 sm:min-h-7"
    >
      <MessageSquare className="h-3.5 w-3.5" aria-hidden />
      Copy BID SELL
    </button>
  );
}

const dayMonth = (date: string) => date.split('-').reverse().slice(0, 2).join('.');

/**
 * A price as offered, in its own currency (decision of 18.11.2026), with the EUR price at today's NBP rate under it
 * for other currencies.
 */
export function Price({ price, className = 'font-medium text-gray-900' }: { price: PriceLike; className?: string }) {
  const rates = useNbpRates();
  const extra = eurAtNbp(price, rates);
  return (
    <span className="inline-flex flex-col">
      <span className={`whitespace-nowrap ${className}`}>{formatPrice(price) ?? '—'}</span>
      {extra && rates && (
        <span className="whitespace-nowrap text-xs font-normal text-gray-500" title={`NBP table ${rates.table}, mid rate of ${rates.date}`}>
          ≈ {extra} (NBP {dayMonth(rates.date)})
        </span>
      )}
    </span>
  );
}
