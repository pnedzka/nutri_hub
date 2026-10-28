import { useEffect, useState } from 'react';
import { CheckCheck, Search } from 'lucide-react';
import {
  BULK_MIN_CONFIDENCE,
  REVIEW_PAGE_SIZE,
  reviewQuery,
  type ProductHit,
  type PurchaseAction,
  type ReviewFilters,
  type ReviewItem,
  type ReviewPage,
  type ReviewSummary,
} from '../../../shared/purchaseApi.ts';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Empty, ErrorNote, Loading } from '../leave/ui';
import { useApi } from '../leave/useApi';
import { PURCHASE_API, percent, whole } from './format';
import { Pager, Pill, ProductPicker, ProductStatus } from './ui';

const select =
  'min-h-11 sm:min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-base sm:text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent';

/** What the item card is showing below its details. */
type Mode = { kind: 'idle' } | { kind: 'edit' } | { kind: 'merge' } | { kind: 'remap' } | { kind: 'confirmNotProduct' };

function confidenceTone(value: number | null) {
  if (value === null) return 'gray' as const;
  return value >= 0.9 ? ('green' as const) : value >= 0.8 ? ('blue' as const) : ('amber' as const);
}

function ItemCard({
  item,
  categories,
  selected,
  onSelect,
  onAction,
}: {
  item: ReviewItem;
  categories: string[];
  selected: boolean;
  onSelect: (on: boolean) => void;
  onAction: (action: PurchaseAction, done: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(item.aiProposal);
  const [category, setCategory] = useState(item.category ?? '');
  const isNew = item.itemType === 'new_product';
  const bulkable = (item.confidence ?? 0) >= BULK_MIN_CONFIDENCE;

  const act = async (action: PurchaseAction, done: string) => {
    setBusy(true);
    const ok = await onAction(action, done);
    setBusy(false);
    if (ok) setMode({ kind: 'idle' });
  };

  const merge = (target: Pick<ProductHit, 'productId' | 'name'>) =>
    act({ action: 'merge', itemId: item.id, targetId: target.productId }, `Merged into ${target.name}`);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isNew ? <Pill tone="blue">New product</Pill> : <Pill tone="amber">Uncertain match</Pill>}
            <Pill tone={confidenceTone(item.confidence)} title="How sure AI is">
              AI {percent(item.confidence)}
            </Pill>
            <Pill title="Offers that wait for this decision">{whole(item.offers)} offers</Pill>
            {item.category && <span className="text-xs text-gray-500">{item.category}</span>}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">Name in the offer</dt>
              <dd className="font-medium text-gray-900 [overflow-wrap:anywhere]">{item.fromName ?? '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">{isNew ? 'AI proposes a new product' : 'AI matched it to'}</dt>
              <dd className="flex flex-wrap items-center gap-1.5 font-medium text-gray-900 [overflow-wrap:anywhere]">
                {item.aiProposal}
                {!isNew && <ProductStatus product={{ status: item.productStatus, source: item.productSource }} />}
              </dd>
            </div>
          </dl>
          {item.aiReason && <p className="mt-2 text-xs text-gray-500">AI: {item.aiReason}</p>}
        </div>
        {bulkable && (
          <label className="-m-2 inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center" title="Select for bulk approval">
            <input type="checkbox" className="h-4 w-4 accent-[#CC1F1F]" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
          </label>
        )}
      </div>

      {item.similar.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500">
            Similar in the catalogue <span className="font-normal">· only hints: merge if it is the same product, otherwise ignore</span>
          </p>
          <ul className="mt-1.5 divide-y divide-gray-100 rounded-lg border border-gray-100">
            {item.similar.map((s) => (
              <li key={s.productId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 [overflow-wrap:anywhere]">{s.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    <ProductStatus product={s} />
                    <span>
                      {percent(s.similarity)} similar · {whole(s.offers)} offers
                    </span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-11 sm:min-h-0"
                  disabled={busy}
                  onClick={() => (isNew ? merge(s) : act({ action: 'remap', itemId: item.id, targetId: s.productId }, `Matched to ${s.name}`))}
                  title={isNew ? 'This product is a duplicate of that one' : 'The name means that product'}
                >
                  {isNew ? 'Merge into this' : 'Match to this'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode.kind === 'edit' && (
        <div className="mt-3 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
            Product name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-base sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${select} sm:min-h-11`}>
              <option value="">—</option>
              {[...new Set([...categories, ...(item.category ? [item.category] : [])])].sort().map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button
              className="min-h-11"
              isLoading={busy}
              disabled={!name.trim()}
              onClick={() => act({ action: 'approve', itemId: item.id, name: name.trim(), category: category || undefined }, `Approved as ${name.trim()}`)}
            >
              Save and approve
            </Button>
            <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setMode({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(mode.kind === 'merge' || mode.kind === 'remap') && (
        <div className="mt-3">
          <ProductPicker
            initial={item.aiProposal.split(/\s+/).slice(0, 2).join(' ')}
            exclude={item.productId}
            actionLabel={mode.kind === 'merge' ? 'Merge into this' : 'Match to this'}
            busy={busy}
            onPick={(p) => (mode.kind === 'merge' ? merge(p) : act({ action: 'remap', itemId: item.id, targetId: p.productId }, `Matched to ${p.name}`))}
            onCancel={() => setMode({ kind: 'idle' })}
          />
        </div>
      )}

      {mode.kind === 'confirmNotProduct' && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>
            {isNew
              ? `“${item.aiProposal}” leaves the catalogue and its ${whole(item.offers)} offers lose the product. AI will not propose this name again.`
              : `“${item.fromName}” stops being matched to ${item.aiProposal}; its ${whole(item.offers)} offers lose the product.`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="danger" className="min-h-11 sm:min-h-0" isLoading={busy} onClick={() => act({ action: 'notProduct', itemId: item.id }, 'Marked as not a product')}>
              Yes, not a product
            </Button>
            <Button variant="ghost" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => setMode({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode.kind === 'idle' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="min-h-11 sm:min-h-0" isLoading={busy} onClick={() => act({ action: 'approve', itemId: item.id }, isNew ? 'Product approved' : 'Match approved')}>
            {isNew ? 'Approve' : 'Approve match'}
          </Button>
          {isNew && (
            <Button variant="secondary" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => setMode({ kind: 'edit' })}>
              Edit and approve
            </Button>
          )}
          <Button variant="secondary" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => setMode({ kind: isNew ? 'merge' : 'remap' })}>
            {isNew ? 'Merge with…' : 'Other product…'}
          </Button>
          <Button variant="ghost" className="min-h-11 sm:min-h-0" disabled={busy} onClick={() => setMode({ kind: 'confirmNotProduct' })}>
            Not a product
          </Button>
        </div>
      )}
    </Card>
  );
}

const emptyFilters: ReviewFilters = { type: null, category: null, maxConfidence: null, withOffers: false, q: null, page: 1 };

export function ProductReview() {
  const toast = useToast();
  const [filters, setFilters] = useState<ReviewFilters>(emptyFilters);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Items decided here disappear at once, while the list reloads (a decided item never comes back).
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const summary = useApi<ReviewSummary>(`${PURCHASE_API}&view=summary`);
  const query = reviewQuery(filters);
  const list = useApi<ReviewPage>(`${PURCHASE_API}&view=review${query ? `&${query}` : ''}`);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === (search.trim() || null) ? f : { ...f, q: search.trim() || null, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const change = (patch: Partial<ReviewFilters>) => {
    setSelected(new Set());
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  };

  const onAction = async (action: PurchaseAction, done: string): Promise<boolean> => {
    try {
      await api(PURCHASE_API, { method: 'POST', body: action });
      toast.success(done);
      if ('itemId' in action) {
        const decided = action.itemId;
        setHidden((h) => new Set(h).add(decided));
        setSelected((all) => new Set([...all].filter((id) => id !== decided)));
      }
      summary.reload();
      list.reload();
      return true;
    } catch (error) {
      toast.error('Not saved', (error as Error).message);
      return false;
    }
  };

  const approveSelected = async () => {
    setBulkBusy(true);
    try {
      const { result } = await api<{ result: { approved: number[]; skipped: number[] } }>(PURCHASE_API, {
        method: 'POST',
        body: { action: 'approveBulk', itemIds: [...selected] } satisfies PurchaseAction,
      });
      setHidden((h) => new Set([...h, ...result.approved]));
      setSelected(new Set());
      toast.success(
        `${result.approved.length} approved`,
        result.skipped.length ? `${result.skipped.length} skipped: AI is less than ${percent(BULK_MIN_CONFIDENCE)} sure of them.` : undefined,
      );
      summary.reload();
      list.reload();
    } catch (error) {
      toast.error('Not saved', (error as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const items = (list.data?.items ?? []).filter((i) => !hidden.has(i.id));
  const bulkable = items.filter((i) => (i.confidence ?? 0) >= BULK_MIN_CONFIDENCE);
  const s = summary.data;

  return (
    <div className="space-y-4">
      {s && (
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{whole(s.open)}</span> to review: {whole(s.newProducts)} new products, {whole(s.mappings)} uncertain
          matches · {whole(s.decidedToday)} decided today · {whole(s.approvedProducts)} approved products in the catalogue
        </p>
      )}

      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names…"
            className="w-full min-h-11 sm:min-h-9 rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
          />
        </div>
        <select aria-label="Type" className={select} value={filters.type ?? ''} onChange={(e) => change({ type: (e.target.value || null) as ReviewFilters['type'] })}>
          <option value="">All types</option>
          <option value="new_product">New products</option>
          <option value="product_mapping">Uncertain matches</option>
        </select>
        <select aria-label="Category" className={select} value={filters.category ?? ''} onChange={(e) => change({ category: e.target.value || null })}>
          <option value="">All categories</option>
          {(s?.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="AI confidence"
          className={select}
          value={filters.maxConfidence ?? ''}
          onChange={(e) => change({ maxConfidence: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Any confidence</option>
          <option value="0.9">AI below 90%</option>
          <option value="0.8">AI below 80%</option>
        </select>
        <label className="inline-flex min-h-11 sm:min-h-9 cursor-pointer items-center gap-2 px-1 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 accent-[#CC1F1F]" checked={filters.withOffers} onChange={(e) => change({ withOffers: e.target.checked })} />
          Only with offers
        </label>
      </Card>

      {bulkable.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2 shadow-sm">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#CC1F1F]"
              checked={bulkable.every((i) => selected.has(i.id))}
              onChange={(e) => setSelected(e.target.checked ? new Set(bulkable.map((i) => i.id)) : new Set())}
            />
            Select all on this page with AI ≥ {percent(BULK_MIN_CONFIDENCE)} ({bulkable.length})
          </label>
          <Button className="min-h-11 sm:min-h-0" disabled={!selected.size} isLoading={bulkBusy} onClick={() => void approveSelected()}>
            <CheckCheck size={16} />
            Approve selected ({selected.size})
          </Button>
        </div>
      )}

      {list.error && <ErrorNote>{list.error}</ErrorNote>}
      {!list.data && !list.error && <Loading />}
      {list.data && items.length === 0 && <Empty>{query ? 'Nothing matches these filters.' : 'Nothing to review. Well done!'}</Empty>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              categories={s?.categories ?? []}
              selected={selected.has(item.id)}
              onSelect={(on) =>
                setSelected((all) => {
                  const next = new Set(all);
                  if (on) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                })
              }
              onAction={onAction}
            />
          </li>
        ))}
      </ul>
      {list.data && <Pager page={filters.page} total={list.data.total} size={REVIEW_PAGE_SIZE} onPage={(page) => change({ page })} />}
    </div>
  );
}
