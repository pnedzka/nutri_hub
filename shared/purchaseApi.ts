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
  rank: number;
  supplier: string | null;
  priceEurPerKg: number | null;
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

/** A BID BUY from Apex Bid with the best supplier offers for it. */
export interface Proposal {
  id: number;
  status: ProposalStatus;
  generatedAt: string | null;
  productId: number;
  product: string;
  category: string | null;
  bidBuyAt: string | null;
  salesRep: string | null;
  customer: string | null;
  requestedKg: number | null;
  /** The price the customer asks for, from the BID BUY (not a price we suggest). */
  targetPriceEurPerKg: number | null;
  requestedIncoterms: string | null;
  requestedLocation: string | null;
  bidBuyText: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  chosenOptionId: number | null;
  options: ProposalOption[];
  rejected: RejectedOffer[];
}

/** An offer found by the search on a BID BUY card, anywhere in the database (not only the card's product). */
export interface FoundOffer {
  offerId: number;
  supplier: string | null;
  priceEurPerKg: number | null;
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
  | { action: 'undo' };

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
    default:
      throw new PurchaseInputError('Unknown action.');
  }
}
