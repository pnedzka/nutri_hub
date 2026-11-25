// Complaints (/complaints): complaints from clients about delivered goods, linked to the sales and purchase contract.
// The server is api/_lib/complaints.ts (through api/people.ts?resource=complaints); data and files are in the central
// database (db/central/complaints_api.sql). This file holds the shapes and the rules both sides use, with tests.
//
// Decisions of 25.11.2026 (plan: Claude Doc "Plan: moduł Complaints w centrum aplikacji"):
//   complaints        anyone with the permission registers complaints and sees the ones they registered, handle or
//                     that concern their contract (sales or purchase);
//   complaints-admin  administration (Jadwiga Woźny): sees and handles all, assigns the handler, cancels;
//   amounts are optional; the 7 complaints of the old intranet are imported (legacyId).

export const COMPLAINT_STATUSES = ['open', 'investigating', 'with_supplier', 'resolved', 'closed', 'cancelled'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  with_supplier: 'With supplier',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Statuses of a complaint still being worked on. */
export const ACTIVE_STATUSES: readonly ComplaintStatus[] = ['open', 'investigating', 'with_supplier'];

/** Where a complaint may go from each status. Steps may be skipped (a simple case is resolved at once). */
export const NEXT_STATUSES: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  open: ['investigating', 'with_supplier', 'resolved'],
  investigating: ['with_supplier', 'resolved'],
  with_supplier: ['investigating', 'resolved'],
  resolved: ['closed', 'investigating'],
  closed: ['investigating'],
  cancelled: [],
};

export const COMPLAINT_TYPES = ['quality', 'foreign_matter', 'packaging', 'quantity', 'documents', 'late_delivery', 'other'] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

export const TYPE_LABELS: Record<ComplaintType, string> = {
  quality: 'Quality / out of specification',
  foreign_matter: 'Foreign matter',
  packaging: 'Damaged packaging',
  quantity: 'Quantity / weight',
  documents: 'Documents (COA, certificates)',
  late_delivery: 'Late delivery',
  other: 'Other',
};

export const OUTCOMES = ['accepted', 'partly_accepted', 'rejected', 'withdrawn'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABELS: Record<Outcome, string> = {
  accepted: 'Accepted',
  partly_accepted: 'Partly accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn by the client',
};

export const SETTLEMENTS = ['credit_note', 'replacement', 'discount', 'return', 'none'] as const;
export type Settlement = (typeof SETTLEMENTS)[number];
export const SETTLEMENT_LABELS: Record<Settlement, string> = {
  credit_note: 'Credit note',
  replacement: 'Replacement',
  discount: 'Discount',
  return: 'Return of goods',
  none: 'None',
};

export const FILE_CATEGORIES = ['photos', 'delivery_protocol', 'lab_report', 'correspondence', 'final_report', 'other'] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];
export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  photos: 'Photos',
  delivery_protocol: 'Delivery protocol',
  lab_report: 'Lab report / COA',
  correspondence: 'Correspondence',
  final_report: 'Final report',
  other: 'Other',
};

export const CURRENCIES = ['EUR', 'PLN', 'USD', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const MAX_FILE_MB = 20;
export const MAX_DESCRIPTION = 20_000;

/** What the contract number tells about a complaint (complaints_api.contract_lookup): new module or intranet. */
export interface ContractInfo {
  id: string;
  type: 'S' | 'P';
  companyName: string;
  products: string;
  ownerName: string;
  /** Known for contracts of the hub's Contract generator; intranet contracts know only the name. */
  ownerEmail: string | null;
  source: 'hub' | 'intranet';
}

export interface Person {
  email: string;
  name: string;
}

export interface ComplaintFile {
  id: number;
  category: FileCategory;
  fileName: string;
  path: string;
  uploadedBy: Person;
  uploadedAt: string;
  /** Signed link (10 minutes), added by the server when one complaint is read. */
  url?: string | null;
}

export interface ComplaintEvent {
  at: string;
  actorEmail: string;
  actorName: string;
  /** created | status | details | assigned | comment | file_added | file_removed | imported */
  action: string;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus | null;
  comment: string | null;
}

/** The two sides of the money, all optional (decision of 25.11.2026). */
export interface Money {
  clientClaimed: number | null;
  clientAgreed: number | null;
  clientCurrency: Currency;
  supplierClaimed: number | null;
  supplierAccepted: number | null;
  supplierCurrency: Currency;
}

export interface ComplaintDetails extends Money {
  batchNumber: string;
  quantityKg: number | null;
  clientResponseDue: string | null;
  supplierRef: string;
  supplierReportedOn: string | null;
}

export interface ComplaintSummary {
  id: string;
  status: ComplaintStatus;
  type: ComplaintType;
  salesContractId: string;
  purchaseContractId: string;
  clientName: string;
  supplierName: string;
  productName: string;
  handler: Person;
  createdAt: string;
  updatedAt: string;
}

export interface Complaint extends ComplaintSummary, ComplaintDetails {
  description: string;
  trader: Person | null;
  purchaseOwner: Person | null;
  createdBy: Person;
  outcome: Outcome | null;
  settlement: Settlement | null;
  resolutionNotes: string;
  resolvedAt: string | null;
  legacyId: string | null;
  files: ComplaintFile[];
  events: ComplaintEvent[];
}

export const LIST_SCOPES = ['mine', 'open', 'all'] as const;
export type ListScope = (typeof LIST_SCOPES)[number];

export interface ComplaintList {
  total: number;
  items: ComplaintSummary[];
}

export interface Viewer {
  email: string;
  isComplaintAdmin: boolean;
}

export interface ComplaintSetup {
  me: Viewer & { name: string };
  /** People who may handle complaints (complaints-admin can assign them). */
  handlers: Person[];
}

export type ComplaintAction = 'comment' | 'attach' | 'edit' | 'status' | 'assign' | 'cancel';

const same = (a: string | null | undefined, b: string) => Boolean(a) && a!.toLowerCase() === b.toLowerCase();

/** The people a complaint concerns: who registered it, who handles it, the trader and the owner of the purchase contract. */
export function participants(c: Pick<Complaint, 'createdBy' | 'handler' | 'trader' | 'purchaseOwner'>): string[] {
  return [...new Set([c.createdBy?.email, c.handler?.email, c.trader?.email, c.purchaseOwner?.email].filter(Boolean).map((e) => e!.toLowerCase()))];
}

/** Whether this person may open the complaint. */
export function maySee(c: Pick<Complaint, 'createdBy' | 'handler' | 'trader' | 'purchaseOwner'>, v: Viewer): boolean {
  return v.isComplaintAdmin || participants(c).includes(v.email.toLowerCase());
}

/** What this person may do with the complaint now. */
export function allowedActions(c: Pick<Complaint, 'status' | 'createdBy' | 'handler' | 'trader' | 'purchaseOwner'>, v: Viewer): ComplaintAction[] {
  if (!maySee(c, v)) return [];
  const handles = v.isComplaintAdmin || same(c.handler?.email, v.email);
  const actions: ComplaintAction[] = ['comment'];
  if (c.status === 'cancelled') return actions;
  actions.push('attach');
  if (handles) actions.push('edit');
  if (handles && NEXT_STATUSES[c.status].length) actions.push('status');
  if (v.isComplaintAdmin) actions.push('assign');
  // The person who registered it may withdraw it while nothing happened yet; administration any time before closing.
  if ((v.isComplaintAdmin && c.status !== 'closed') || (c.status === 'open' && same(c.createdBy?.email, v.email))) actions.push('cancel');
  return actions;
}

/** The statuses this person may move the complaint to. */
export function nextStatuses(c: Pick<Complaint, 'status' | 'createdBy' | 'handler' | 'trader' | 'purchaseOwner'>, v: Viewer): ComplaintStatus[] {
  return allowedActions(c, v).includes('status') ? [...NEXT_STATUSES[c.status]] : [];
}

/** C-2026-007: the number, from the year and the sequence of that year. */
export const complaintNumber = (year: number, seq: number) => `C-${year}-${String(seq).padStart(3, '0')}`;

/** A contract number as people type it: trimmed, upper case, spaces dropped (e.g. "64-s-db-2026 " → "64-S-DB-2026"). */
export function normalizeContractId(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 40);
}

/** The type of contract from its number: 64-S-DB-2026 is a sales contract. */
export function contractTypeOf(id: string): 'S' | 'P' | null {
  const m = /^\d+-([SP])-[A-Z]{1,4}-\d{4}$/.exec(id);
  return m ? (m[1] as 'S' | 'P') : null;
}

export interface ComplaintInput {
  salesContractId: string;
  purchaseContractId: string;
  type: ComplaintType;
  batchNumber: string;
  quantityKg: number | null;
  description: string;
  clientResponseDue: string | null;
}

export interface Problem {
  field: string;
  message: string;
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown) => (typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null);

/** A number typed with a comma or a point; empty = null; anything else = NaN (reported as a problem). */
export function amount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN;
  const s = String(v).replace(/\s+/g, '').replace(',', '.');
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

const currency = (v: unknown): Currency => ((CURRENCIES as readonly string[]).includes(String(v)) ? (v as Currency) : 'EUR');

/** A new complaint from the form, cleaned, with what is missing or wrong. */
export function cleanComplaint(raw: unknown): { complaint: ComplaintInput; problems: Problem[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const problems: Problem[] = [];
  const salesContractId = normalizeContractId(r.salesContractId);
  const purchaseContractId = normalizeContractId(r.purchaseContractId);
  const quantityKg = amount(r.quantityKg);
  const complaint: ComplaintInput = {
    salesContractId,
    purchaseContractId,
    type: (COMPLAINT_TYPES as readonly string[]).includes(String(r.type)) ? (r.type as ComplaintType) : 'quality',
    batchNumber: text(r.batchNumber, 200),
    quantityKg: Number.isNaN(quantityKg) ? null : quantityKg,
    description: text(r.description, MAX_DESCRIPTION),
    clientResponseDue: date(r.clientResponseDue),
  };
  if (!salesContractId) problems.push({ field: 'salesContractId', message: 'Enter the sales contract number.' });
  else if (contractTypeOf(salesContractId) !== 'S') problems.push({ field: 'salesContractId', message: 'The sales contract number looks like 64-S-DB-2026.' });
  if (purchaseContractId && contractTypeOf(purchaseContractId) !== 'P') {
    problems.push({ field: 'purchaseContractId', message: 'The purchase contract number looks like 100-P-DB-2026.' });
  }
  if (Number.isNaN(quantityKg)) problems.push({ field: 'quantityKg', message: 'Enter the quantity in kg as a number.' });
  if (complaint.description.length < 10) problems.push({ field: 'description', message: 'Describe the problem (at least 10 characters).' });
  return { complaint, problems };
}

/** The handler's fields (supplier side, amounts, dates), cleaned. */
export function cleanDetails(raw: unknown): { details: ComplaintDetails; problems: Problem[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const problems: Problem[] = [];
  const num = (field: keyof ComplaintDetails, label: string) => {
    const n = amount(r[field]);
    if (Number.isNaN(n)) {
      problems.push({ field, message: `${label}: enter a number.` });
      return null;
    }
    return n;
  };
  const details: ComplaintDetails = {
    batchNumber: text(r.batchNumber, 200),
    quantityKg: num('quantityKg', 'Quantity'),
    clientResponseDue: date(r.clientResponseDue),
    supplierRef: text(r.supplierRef, 120),
    supplierReportedOn: date(r.supplierReportedOn),
    clientClaimed: num('clientClaimed', 'Claimed by the client'),
    clientAgreed: num('clientAgreed', 'Agreed with the client'),
    clientCurrency: currency(r.clientCurrency),
    supplierClaimed: num('supplierClaimed', 'Claimed from the supplier'),
    supplierAccepted: num('supplierAccepted', 'Accepted by the supplier'),
    supplierCurrency: currency(r.supplierCurrency),
  };
  return { details, problems };
}

export interface StatusChange {
  to: ComplaintStatus;
  comment: string;
  outcome: Outcome | null;
  settlement: Settlement | null;
  resolutionNotes: string;
}

/** A change of status: "Resolved" needs the outcome and the settlement. */
export function cleanStatusChange(raw: unknown): { change: StatusChange; problems: Problem[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const change: StatusChange = {
    to: (COMPLAINT_STATUSES as readonly string[]).includes(String(r.to)) ? (r.to as ComplaintStatus) : 'open',
    comment: text(r.comment, 2000),
    outcome: (OUTCOMES as readonly string[]).includes(String(r.outcome)) ? (r.outcome as Outcome) : null,
    settlement: (SETTLEMENTS as readonly string[]).includes(String(r.settlement)) ? (r.settlement as Settlement) : null,
    resolutionNotes: text(r.resolutionNotes, 4000),
  };
  const problems: Problem[] = [];
  if (!(COMPLAINT_STATUSES as readonly string[]).includes(String(r.to)) || change.to === 'cancelled') problems.push({ field: 'to', message: 'Choose the new status.' });
  if (change.to === 'resolved') {
    if (!change.outcome) problems.push({ field: 'outcome', message: 'Choose the outcome.' });
    if (!change.settlement) problems.push({ field: 'settlement', message: 'Choose how it was settled.' });
  }
  return { change, problems };
}

/** Days since the complaint was registered (whole days, never negative). */
export function daysOpen(createdAt: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000));
}

/** Days without any change: an active complaint quiet for a week is flagged in the list. */
export const STALE_DAYS = 7;
export function isStale(c: Pick<ComplaintSummary, 'status' | 'updatedAt'>, now = new Date()): boolean {
  return ACTIVE_STATUSES.includes(c.status) && daysOpen(c.updatedAt, now) >= STALE_DAYS;
}

/** Money as people read it: "1 250.50 EUR". */
export function money(value: number | null, cur: Currency): string {
  if (value === null) return '';
  return `${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/,/g, ' ')} ${cur}`;
}

/** A file name safe for storage paths. */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(-80) || 'file'
  );
}

/** Statuses of the old intranet mapped to the new ones (import of 25.11.2026). */
export function legacyStatus(status: string): ComplaintStatus {
  switch (status) {
    case 'New':
      return 'open';
    case 'Internal Review':
    case 'Supplier Rejected':
      return 'investigating';
    case 'Sent to Supplier':
    case 'Awaiting Supplier Decision':
      return 'with_supplier';
    case 'Supplier Approved':
    case 'Settled':
      return 'resolved';
    case 'Closed':
      return 'closed';
    default:
      return 'open';
  }
}
