// The API of Purchase Manager (/api/admin/users?resource=purchase, people with the `purchase` app), shared by the
// server and the browser. The data lives in the central database (Supabase nutri-central-db, schema purchase_api,
// see db/central/purchase_api.sql); the hub's server is the only one that talks to it.
//
//   GET  ?resource=purchase&view=summary                                   → ReviewSummary
//   GET  ?resource=purchase&view=review&type&category&maxConfidence&withOffers&q&page → ReviewPage
//   GET  ?resource=purchase&view=search&q                                  → { products: ProductHit[] }
//   GET  ?resource=purchase&view=lastDecision                              → { last: LastDecision | null }
//   GET  ?resource=purchase&view=proposals&status&page                     → ProposalPage
//   GET  ?resource=purchase&view=offerSearch&proposal&q                    → OfferSearchResult
//   POST ?resource=purchase  body PurchaseAction                           → { result }
//
// Purchase prices only: suggested sell prices and margins are out of scope (decision of 28.10.2026).

export type ReviewItemType = 'new_product' | 'product_mapping';

/** A product already in the catalogue, similar to the one under review (or found by the search). */
export interface ProductHit {
  productId: number;
  name: string;
  category: string | null;
  /** approved | pending */
  status: string;
  /** apex_bid | ai | … */
  source: string | null;
  similarity: number | null;
  offers: number;
}

/** One open item of core.review_queue: a product proposed by AI, or an uncertain match of a name to a product. */
export interface ReviewItem {
  id: number;
  itemType: ReviewItemType;
  /** The name exactly as the supplier or the trader wrote it. */
  fromName: string | null;
  /** The product AI proposes (new product) or matched the name to. */
  aiProposal: string;
  productId: number;
  productName: string;
  productStatus: string;
  productSource: string | null;
  category: string | null;
  /** 0–1 */
  confidence: number | null;
  aiReason: string | null;
  /** Offers behind the decision: deciding the items with most offers first unlocks most matches. */
  offers: number;
  createdAt: string;
  similar: ProductHit[];
}

export interface ReviewPage {
  total: number;
  items: ReviewItem[];
}

export interface ReviewSummary {
  open: number;
  newProducts: number;
  mappings: number;
  decidedToday: number;
  approvedProducts: number;
  categories: string[];
  /** Open items per category (only categories that have some), so people can split the review between them. */
  openByCategory: Record<string, number>;
}

export interface ReviewFilters {
  type: ReviewItemType | null;
  category: string | null;
  /** Only items with confidence below this (0–1). */
  maxConfidence: number | null;
  withOffers: boolean;
  q: string | null;
  /** From 1. */
  page: number;
}

export const REVIEW_PAGE_SIZE = 25;
export const PROPOSALS_PAGE_SIZE = 20;
/** Bulk approval takes only items AI is at least this sure of; the rest come back as skipped. */
export const BULK_MIN_CONFIDENCE = 0.9;

export type ProposalStatus = 'pending_review' | 'approved' | 'rejected' | 'sent' | 'expired';
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = ['pending_review', 'approved', 'rejected', 'sent', 'expired'];
export const PROPOSAL_STATUS_NAMES: Record<ProposalStatus, string> = {
  pending_review: 'To review',
  approved: 'Approved',
  rejected: 'Rejected',
  sent: 'Sent',
  expired: 'Expired',
};

/** A supplier offer proposed for a BID BUY. */
export interface ProposalOption {
  id: number;
  /** Position on the card, best first (db/central/bid_card_ranking.sql). */
  rank: number;
  /** The ranking score behind the position; missing until bid_card_ranking.sql runs in the central database. */
  score?: number | null;
  supplier: string | null;
  priceEurPerKg: number | null;
  /** The price as offered, in its own currency and unit (db/central/bid_original_prices.sql); EUR/kg above is for comparing. */
  price?: number | null;
  currency?: string | null;
  /** kg | mt | pcs */
  priceUnit?: string | null;
  incoterms: string | null;
  location: string | null;
  leadTime: string | null;
  quantityKg: number | null;
  offeredAt: string | null;
  /** airtable (purchase@) | apex_bid (BID SELL) | … */
  source: string | null;
  productName: string | null;
  /** Who posted a BID SELL on WhatsApp (Apex Bid does not say which supplier it comes from). */
  trader?: string | null;
  /** Whom to write about the offer (db/central/offer_email.sql): the supplier's contact, or the trader of a BID SELL. */
  email?: string | null;
  emailOf?: EmailOf | null;
}

/** supplier: the contact the offer came from (or another contact of that company); trader: who posted the BID SELL. */
export type EmailOf = 'supplier' | 'trader';

/**
 * An offer name hidden from the cards of this product ("Not this product"). Offers named like this no longer show up
 * for the product, and the name waits in Products to review as an uncertain match.
 */
export interface RejectedOffer {
  id: number;
  productName: string;
  supplier: string | null;
  rejectedBy: string;
  rejectedAt: string;
}

/** A sale from Apex Bid (BID SOLD) linked to the card's BID BUY. Only a marker: the Purchase Manager closes the card. */
export interface ProposalSale {
  dealId: number;
  soldAt: string | null;
  trader: string | null;
  quantityKg: number | null;
  /** False when the link to this BID BUY is a guess (same product and chat, close in time). */
  certain: boolean;
  /** The option of the card that was sold, when it is on the card. */
  optionId: number | null;
  text: string | null;
}

/** A line of a purchase contract from the intranet for the card's product: what we last paid, and to whom. Not an offer. */
export interface ProposalPurchase {
  id: number;
  contractId: string | null;
  status: string | null;
  supplier: string | null;
  /** Who bought. */
  buyer: string | null;
  productName: string | null;
  quantityKg: number | null;
  priceEurPerKg: number | null;
  /** The price as offered, in its own currency and unit (db/central/bid_original_prices.sql); EUR/kg above is for comparing. */
  price?: number | null;
  currency?: string | null;
  /** kg | mt | pcs */
  priceUnit?: string | null;
  incoterms: string | null;
  date: string | null;
}

/** Cards show this many best offers; the rest waits behind "Show all". */
export const TOP_OPTIONS = 5;

/** The offers a card shows before "Show all": the best ones, plus any the card must not hide (chosen, sold). */
export function topOptions(options: ProposalOption[], keep: ReadonlyArray<number | null | undefined> = [], limit = TOP_OPTIONS): ProposalOption[] {
  return options.filter((o, index) => index < limit || keep.includes(o.id));
}

/** Columns of the offers table on a BID BUY card that sort on a click (decision of 17.11.2026). */
export type OptionSortKey = 'rank' | 'supplier' | 'price' | 'quantity' | 'terms' | 'offered';
export type SortDirection = 'asc' | 'desc';
export interface OptionSort {
  key: OptionSortKey;
  direction: SortDirection;
}

/** The ranking order, as the database sends the offers. */
export const DEFAULT_OPTION_SORT: OptionSort = { key: 'rank', direction: 'asc' };

/** The direction of the first click on a column: the cheapest, the most and the newest first, names from A. */
export const FIRST_DIRECTION: Record<OptionSortKey, SortDirection> = {
  rank: 'asc',
  supplier: 'asc',
  price: 'asc',
  quantity: 'desc',
  terms: 'asc',
  offered: 'desc',
};

/** A click on a column header: the same column turns the order around, another one starts in its first direction. */
export function nextOptionSort(current: OptionSort, key: OptionSortKey): OptionSort {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: FIRST_DIRECTION[key] };
}

function sortValue(o: ProposalOption, key: OptionSortKey): string | number | null {
  switch (key) {
    case 'rank':
      return o.rank;
    case 'supplier':
      return (o.supplier ?? (o.trader ? `BID SELL from ${o.trader}` : null))?.trim().toLowerCase() || null;
    case 'price':
      return o.priceEurPerKg;
    case 'quantity':
      return o.quantityKg;
    case 'terms':
      return [o.incoterms, o.location].filter(Boolean).join(' ').trim().toLowerCase() || null;
    case 'offered': {
      const time = o.offeredAt ? Date.parse(o.offeredAt) : NaN;
      return Number.isNaN(time) ? null : time;
    }
  }
}

/** The card's offers in the chosen order. Offers without the value (no price, no date…) always go last; ties keep the ranking. */
export function sortOptions(options: ProposalOption[], sort: OptionSort): ProposalOption[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return options
    .map((o) => ({ o, value: sortValue(o, sort.key) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.o.rank - b.o.rank;
        return a.value === null ? 1 : -1;
      }
      const diff = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : String(a.value).localeCompare(String(b.value));
      return diff !== 0 ? sign * diff : a.o.rank - b.o.rank;
    })
    .map(({ o }) => o);
}

/** A price with its own currency and unit. */
export interface PriceLike {
  priceEurPerKg: number | null;
  price?: number | null;
  currency?: string | null;
  priceUnit?: string | null;
}

const UNIT_LABELS: Record<string, string> = { kg: 'kg', mt: 't', pcs: 'pcs' };

/**
 * The price as the supplier gave it, in its own currency and unit ("3.20 USD/kg", "2,800.00 EUR/t"), without
 * converting to EUR (decision of 18.11.2026). EUR/kg only when the original price is unknown (before
 * bid_original_prices.sql runs, or an offer without a currency).
 */
export function formatPrice(p: PriceLike): string | null {
  const amount = (value: number) => value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p.price != null && p.currency) {
    const unit = p.priceUnit ? (UNIT_LABELS[p.priceUnit] ?? p.priceUnit) : null;
    return `${amount(Number(p.price))} ${p.currency}${unit ? `/${unit}` : ''}`;
  }
  return p.priceEurPerKg === null ? null : `${amount(p.priceEurPerKg)} EUR/kg`;
}

/** EUR for one unit of each currency, from the latest NBP table A (GET view=nbpRates). */
export interface NbpRates {
  /** The day of the NBP table, YYYY-MM-DD. */
  date: string;
  /** e.g. 223/A/NBP/2026 */
  table: string;
  eurPer: Record<string, number>;
}

/**
 * EUR for one unit of each currency from an NBP table A answer (rates in PLN for one unit, "mid"):
 * X in EUR = X's mid / EUR's mid, PLN in EUR = 1 / EUR's mid. Null when the table has no EUR.
 */
export function nbpEurRates(answer: unknown): NbpRates | null {
  const table = Array.isArray(answer) ? answer[0] : null;
  if (!table || typeof table !== 'object') return null;
  const { no, effectiveDate, rates } = table as { no?: unknown; effectiveDate?: unknown; rates?: unknown };
  if (typeof effectiveDate !== 'string' || !Array.isArray(rates)) return null;
  const mids = new Map<string, number>();
  for (const r of rates as { code?: unknown; mid?: unknown }[]) {
    if (typeof r?.code === 'string' && typeof r.mid === 'number' && r.mid > 0) mids.set(r.code.toUpperCase(), r.mid);
  }
  const eur = mids.get('EUR');
  if (!eur) return null;
  const eurPer: Record<string, number> = { EUR: 1, PLN: 1 / eur };
  for (const [code, mid] of mids) if (code !== 'EUR') eurPer[code] = mid / eur;
  return { date: effectiveDate, table: typeof no === 'string' ? no : '', eurPer };
}

/**
 * The extra price in EUR at the NBP rate (decision of 18.11.2026), per kg when the unit is kg or a tonne
 * ("2.73 EUR/kg"), otherwise in the offer's own unit. Null for prices already in EUR or without a rate.
 */
export function eurAtNbp(p: PriceLike, rates: NbpRates | null): string | null {
  if (!rates || p.price == null || !p.currency) return null;
  const currency = p.currency.toUpperCase();
  const rate = rates.eurPer[currency];
  if (currency === 'EUR' || !rate) return null;
  let value = Number(p.price) * rate;
  let unit = p.priceUnit ? (UNIT_LABELS[p.priceUnit] ?? p.priceUnit) : null;
  if (p.priceUnit === 'mt') {
    value /= 1000;
    unit = 'kg';
  }
  return `${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR${unit ? `/${unit}` : ''}`;
}

/**
 * A ready BID SELL message for the Apex Bid WhatsApp group, in the group's own format (decision of 18.11.2026):
 * "BID SELL", the product, quantity, purchase price, terms and lead time, one per line. No supplier name: the group
 * does not name suppliers. Lines without data are left out.
 */
export function bidSellMessage(option: ProposalOption, product: string): string {
  const kg = (value: number) => `${Math.round(value).toLocaleString('en-GB')} kg`;
  return [
    'BID SELL',
    option.productName?.trim() || product,
    option.quantityKg !== null && option.quantityKg > 0 && kg(option.quantityKg),
    formatPrice(option),
    [option.incoterms, option.location].filter(Boolean).join(' '),
    option.leadTime && `LT ${option.leadTime}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** A BID BUY from Apex Bid with the best supplier offers for it. */
export interface Proposal {
  id: number;
  status: ProposalStatus;
  generatedAt: string | null;
  productId: number;
  product: string;
  category: string | null;
  bidBuyAt: string | null;
  /** When the card expires: 7 days after the BID BUY's validity in Apex Bid. Missing until bid_card_ranking.sql runs. */
  openUntil?: string | null;
  salesRep: string | null;
  customer: string | null;
  requestedKg: number | null;
  /** The price the customer asks for, from the BID BUY (not a price we suggest). */
  targetPriceEurPerKg: number | null;
  /** The BID BUY's target price in its own currency and unit (db/central/bid_original_prices.sql). */
  targetPrice?: number | null;
  targetCurrency?: string | null;
  targetPriceUnit?: string | null;
  requestedIncoterms: string | null;
  requestedLocation: string | null;
  bidBuyText: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  chosenOptionId: number | null;
  options: ProposalOption[];
  /** Missing until bid_card_ranking.sql runs in the central database. */
  sold?: ProposalSale[];
  /** The three latest purchase contracts for the product. Missing until bid_card_purchases.sql runs. */
  purchases?: ProposalPurchase[];
  /** How many purchase contract lines the product has in all. */
  purchasesTotal?: number;
  rejected: RejectedOffer[];
}

/** An offer found by the search on a BID BUY card, anywhere in the database (not only the card's product). */
export interface FoundOffer {
  offerId: number;
  supplier: string | null;
  priceEurPerKg: number | null;
  /** The price as offered, in its own currency and unit (db/central/bid_original_prices.sql); EUR/kg above is for comparing. */
  price?: number | null;
  currency?: string | null;
  /** kg | mt | pcs */
  priceUnit?: string | null;
  incoterms: string | null;
  location: string | null;
  leadTime: string | null;
  quantityKg: number | null;
  offeredAt: string | null;
  source: string | null;
  productName: string | null;
  trader: string | null;
  email?: string | null;
  emailOf?: EmailOf | null;
  /** The catalogue product the offer is matched to now, if any. */
  productId: number | null;
  product: string | null;
  /** Already matched to the card's product (hidden from the card by ✕, or added after the card was built). */
  onThisProduct: boolean;
}

/** A purchase contract from the intranet found by the search (purchase price only). */
export interface FoundContract {
  id: number;
  contractId: string | null;
  status: string | null;
  supplier: string | null;
  productName: string | null;
  product: string | null;
  quantityKg: number | null;
  priceEurPerKg: number | null;
  /** The price as offered, in its own currency and unit (db/central/bid_original_prices.sql); EUR/kg above is for comparing. */
  price?: number | null;
  currency?: string | null;
  /** kg | mt | pcs */
  priceUnit?: string | null;
  incoterms: string | null;
  date: string | null;
}

/** Newest first; offers already on the card are left out. */
export interface OfferSearchResult {
  q: string;
  total: number;
  offers: FoundOffer[];
  contractsTotal: number;
  contracts: FoundContract[];
}

/** The search needs at least this many characters. */
export const OFFER_SEARCH_MIN = 2;

export interface ProposalPage {
  total: number;
  counts: Partial<Record<ProposalStatus, number>>;
  items: Proposal[];
}

/**
 * POST body. Every action closes the item or the proposal and saves who decided (the signed-in person).
 * rejectOption hides an offer that is not the product of the BID BUY (see RejectedOffer); restoreOption brings it back.
 * chooseOffer approves the proposal with an offer found by the search; assignOffer ("Add to this product") moves every
 * offer with that offer's name to the card's product, so they show up on its cards from now on.
 */
export type PurchaseAction =
  | { action: 'approve'; itemId: number; name?: string; category?: string }
  | { action: 'merge'; itemId: number; targetId: number }
  | { action: 'notProduct'; itemId: number }
  | { action: 'remap'; itemId: number; targetId: number }
  | { action: 'approveBulk'; itemIds: number[] }
  | { action: 'decide'; proposalId: number; status: 'approved' | 'rejected' | 'pending_review'; optionId?: number; note?: string }
  | { action: 'rejectOption'; optionId: number }
  | { action: 'restoreOption'; rejectionId: number }
  | { action: 'chooseOffer'; proposalId: number; offerId: number; note?: string }
  | { action: 'assignOffer'; proposalId: number; offerId: number }
  | { action: 'undo' }
  | { action: 'refreshBids' };

/** What "Check Apex Bid now" did (POST refreshBids): the cards after reading Apex Bid again. */
export interface BidRefresh {
  /** New BID BUY cards. */
  new: number;
  /** Cards closed because their BID BUY is no longer valid. */
  expired: number;
  checkedAt: string;
  /** Someone checked less than a minute ago, so this check did not run again; the cards are already fresh. */
  recent?: boolean;
}

/** The latest review decision of the signed-in person that can still be undone (GET view=lastDecision). */
export interface LastDecision {
  id: number;
  itemId: number;
  action: 'approve' | 'merge' | 'notProduct' | 'remap';
  label: string | null;
  decidedAt: string;
}

export class PurchaseInputError extends Error {}

const positiveInt = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, max) : undefined;
};

function id(value: unknown, what: string): number {
  const n = positiveInt(value);
  if (n === null) throw new PurchaseInputError(`${what} is missing or invalid.`);
  return n;
}

/** Filters of the review list from the query string; unknown values are ignored. */
export function reviewFilters(params: URLSearchParams): ReviewFilters {
  const type = params.get('type');
  const confidence = Number(params.get('maxConfidence'));
  return {
    type: type === 'new_product' || type === 'product_mapping' ? type : null,
    category: text(params.get('category'), 100) ?? null,
    maxConfidence: params.get('maxConfidence') && confidence > 0 && confidence <= 1 ? confidence : null,
    withOffers: params.get('withOffers') === '1' || params.get('withOffers') === 'true',
    q: text(params.get('q'), 100) ?? null,
    page: positiveInt(params.get('page')) ?? 1,
  };
}

/** The query string of the review list (without defaults), the inverse of reviewFilters. */
export function reviewQuery(filters: Partial<ReviewFilters>): string {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.category) params.set('category', filters.category);
  if (filters.maxConfidence) params.set('maxConfidence', String(filters.maxConfidence));
  if (filters.withOffers) params.set('withOffers', '1');
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

export function proposalStatus(value: string | null): ProposalStatus | null {
  return PROPOSAL_STATUSES.includes(value as ProposalStatus) ? (value as ProposalStatus) : null;
}

/** Checks a POST body and keeps only the known fields. */
export function purchaseAction(body: unknown): PurchaseAction {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  switch (b.action) {
    case 'approve':
      return { action: 'approve', itemId: id(b.itemId, 'Item'), name: text(b.name, 200), category: text(b.category, 100) };
    case 'merge':
    case 'remap': {
      const itemId = id(b.itemId, 'Item');
      const targetId = id(b.targetId, 'Product');
      return { action: b.action, itemId, targetId };
    }
    case 'notProduct':
      return { action: 'notProduct', itemId: id(b.itemId, 'Item') };
    case 'approveBulk': {
      const ids = Array.isArray(b.itemIds) ? [...new Set(b.itemIds.map(positiveInt).filter((n): n is number => n !== null))] : [];
      if (!ids.length) throw new PurchaseInputError('Choose the items to approve.');
      if (ids.length > 100) throw new PurchaseInputError('Approve at most 100 items at a time.');
      return { action: 'approveBulk', itemIds: ids };
    }
    case 'decide': {
      const status = b.status;
      if (status !== 'approved' && status !== 'rejected' && status !== 'pending_review') throw new PurchaseInputError('Unknown decision.');
      const optionId = positiveInt(b.optionId) ?? undefined;
      if (status === 'approved' && !optionId) throw new PurchaseInputError('Choose a supplier option.');
      return { action: 'decide', proposalId: id(b.proposalId, 'Proposal'), status, optionId, note: text(b.note, 500) };
    }
    case 'rejectOption':
      return { action: 'rejectOption', optionId: id(b.optionId, 'Offer') };
    case 'restoreOption':
      return { action: 'restoreOption', rejectionId: id(b.rejectionId, 'Rejected offer') };
    case 'chooseOffer':
      return { action: 'chooseOffer', proposalId: id(b.proposalId, 'Proposal'), offerId: id(b.offerId, 'Offer'), note: text(b.note, 500) };
    case 'assignOffer':
      return { action: 'assignOffer', proposalId: id(b.proposalId, 'Proposal'), offerId: id(b.offerId, 'Offer') };
    case 'undo':
      return { action: 'undo' };
    case 'refreshBids':
      return { action: 'refreshBids' };
    default:
      throw new PurchaseInputError('Unknown action.');
  }
}
