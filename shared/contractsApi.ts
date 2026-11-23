// The API of the Contract generator (/contracts, people with the `contracts` app), shared by the server and the browser.
// Served by api/people.ts with ?resource=contracts (the Hobby plan allows 12 functions, all used). The data lives in
// the central database (Supabase nutri-central-db, schemas contracts and contracts_api, db/central/contracts_api.sql).
//
//   GET  ?resource=contracts&view=list&scope=mine|todo|all&q&status → ContractList
//   GET  ?resource=contracts&view=one&id                       → { contract: Contract, can: ContractAction[], files }
//   GET  ?resource=contracts&view=companies&q                  → { companies: CompanyHit[] }
//   GET  ?resource=contracts&view=products&q                   → { products: ProductOption[] }
//   GET  ?resource=contracts&view=setup&type&owner             → ContractSetup (number preview, owners, signers)
//   GET  ?resource=contracts&view=files                        → { files: SettingsFile[] } (terms and signatures)
//   GET  ?resource=contracts&view=cn&q                         → { codes: CnHit[] } (CN code by product name or code)
//   GET  ?resource=contracts&view=drafts                       → { drafts: DraftSummary[] } (own drafts)
//   GET  ?resource=contracts&view=draft&id                     → { draft: Draft }
//   POST ?resource=contracts  body ContractRequest             → { contract }
//
// The flow (decisions of 23.11.2026): the trader generates the contract → administration (Jadwiga) accepts it after
// entering the order in enova → Marcin Niećko signs up to 100 000 EUR net, above that he approves and a board member
// signs → the trader downloads the contract and the terms (OWS for sales, OWZ for purchases), sends them to the
// client and uploads the scan the client signed. Invoices and internal documents are made in enova.

export const CONTRACT_TYPES = ['S', 'P'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const QUANTITY_UNITS = ['KG', 'MT', 'PCS'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const PRICE_UNITS = ['KG', 'MT', 'PCS', '1000PCS'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const CURRENCIES = ['EUR', 'USD', 'PLN'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Incoterms 2020. The first five are the ones used in practice (1089 intranet contracts); the rest under "More". */
export const INCOTERMS = ['DDP', 'FCA', 'EXW', 'CIP', 'DAP', 'FOB', 'CFR', 'CIF', 'CPT', 'DPU', 'FAS'] as const;
export type Incoterm = (typeof INCOTERMS)[number];
export const COMMON_INCOTERMS: readonly Incoterm[] = INCOTERMS.slice(0, 5);

export const INCOTERM_NAMES: Record<Incoterm, string> = {
  EXW: 'Ex Works',
  FCA: 'Free Carrier',
  FAS: 'Free Alongside Ship',
  FOB: 'Free On Board',
  CFR: 'Cost and Freight',
  CIF: 'Cost, Insurance and Freight',
  CPT: 'Carriage Paid To',
  CIP: 'Carriage and Insurance Paid To',
  DAP: 'Delivered At Place',
  DPU: 'Delivered at Place Unloaded',
  DDP: 'Delivered Duty Paid',
};

export const DOCUMENTS = ['Invoice', 'COA', 'Packing list', 'CMR'] as const;
export type RequiredDocument = (typeof DOCUMENTS)[number];
export const DEFAULT_DOCUMENTS: readonly RequiredDocument[] = ['Invoice', 'COA'];

/** What the payment days count from. */
export const PAYMENT_FROM = ['delivery', 'collection', 'invoice'] as const;
export type PaymentFrom = (typeof PAYMENT_FROM)[number];
const PAYMENT_FROM_TEXT: Record<PaymentFrom, string> = { delivery: 'after delivery', collection: 'after collection', invoice: 'from the invoice date' };

/** Above this net amount in EUR a board member signs after Marcin's approval. */
export const BOARD_THRESHOLD_EUR = 100_000;

export interface Party {
  companyName: string;
  vatId: string;
  contactFirstName: string;
  contactLastName: string;
  contactPosition: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
}

export interface ProductLine {
  name: string;
  /** core.products id when picked from the list. */
  productId: number | null;
  /** CN code (Combined Nomenclature), digits only; optional until enova has codes for every product. */
  cnCode: string;
  quantity: number;
  unit: QuantityUnit;
  unitPrice: number;
  priceUnit: PriceUnit;
}

export interface Delivery {
  incoterm: Incoterm;
  /** Only with CIP. */
  byAir: boolean;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  /** yyyy-mm-dd */
  dateFrom: string;
  dateTo: string;
  instructions: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export interface Payment {
  /** 0–100; 100 = everything before shipment. */
  prepaymentPercent: number;
  /** Days for the rest (when prepayment < 100). */
  days: number;
  from: PaymentFrom;
  factoring: boolean;
  notes: string;
}

/** What the form sends. The owner, number and amounts are worked out by the server and the database. */
export interface ContractInput {
  type: ContractType;
  /** yyyy-mm-dd, not in the future. */
  submissionDate: string;
  /** E-mail of the trader who owns the contract; only contract administrators may pick someone else. */
  ownerEmail: string;
  companyId: number | null;
  party: Party;
  currency: Currency;
  products: ProductLine[];
  delivery: Delivery;
  payment: Payment;
  documents: RequiredDocument[];
}

/** The stored content (contracts.contracts.data). */
export type ContractData = Pick<ContractInput, 'party' | 'products' | 'delivery' | 'payment' | 'documents'>;

export const STATUSES = ['admin_review', 'signature', 'board', 'signed', 'client_signed', 'returned', 'cancelled'] as const;
export type ContractStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<ContractStatus, string> = {
  admin_review: 'Waiting for administration',
  signature: 'Waiting for signature',
  board: 'Waiting for the board',
  signed: 'Signed by Nutri Partners',
  client_signed: 'Signed by the client',
  returned: 'Returned for corrections',
  cancelled: 'Cancelled',
};

export interface Stamp {
  email: string;
  name: string;
  at: string;
}

export interface Contract {
  id: string;
  type: ContractType;
  status: ContractStatus;
  ownerEmail: string;
  ownerName: string;
  createdByEmail: string;
  submissionDate: string;
  companyId: number | null;
  companyName: string;
  currency: Currency;
  amountNet: number;
  fxEurPerUnit: number;
  amountEur: number;
  boardRequired: boolean;
  factoring: boolean;
  data: ContractData;
  version: number;
  enovaOrder: string | null;
  acceptedBy: Stamp | null;
  approvedBy: Stamp | null;
  signedBy: (Stamp & { title: string }) | null;
  clientScan: { path: string; fileName: string; email: string; at: string } | null;
  returnComment: string | null;
  createdAt: string;
  updatedAt: string;
  events?: ContractEvent[];
}

export interface ContractEvent {
  at: string;
  actorEmail: string;
  actorName: string;
  action: string;
  fromStatus: ContractStatus | null;
  toStatus: ContractStatus | null;
  comment: string | null;
}

export type ContractSummary = Pick<
  Contract,
  'id' | 'type' | 'status' | 'ownerEmail' | 'ownerName' | 'companyName' | 'currency' | 'amountNet' | 'amountEur' | 'boardRequired' | 'submissionDate' | 'updatedAt'
>;

export interface ContractList {
  total: number;
  items: ContractSummary[];
}

export const LIST_SCOPES = ['mine', 'todo', 'all'] as const;
export type ListScope = (typeof LIST_SCOPES)[number];

export interface CompanyHit {
  companyId: number;
  name: string;
  vatId: string | null;
  country: string | null;
  /** The client card from the intranet (address, contact, saved delivery addresses), when there is one. */
  intranet: Record<string, unknown> | null;
  /** The party and delivery of the latest contract of this company in this module. */
  last: { party: Party; delivery: Delivery } | null;
}

export interface ProductOption {
  id: number;
  name: string;
  enovaCode: string | null;
  /** The CN code remembered from earlier contracts with this product. */
  cnCode: string | null;
}

/** A hit of the CN code search: a product with a remembered code, or an entry of the nomenclature. */
export interface CnHit {
  code: string;
  label: string;
  kind: 'product' | 'code';
}

export interface DraftSummary {
  id: string;
  ownerEmail: string;
  type: ContractType;
  companyName: string;
  updatedAt: string;
}

export interface Draft extends DraftSummary {
  /** The form as it was saved (not validated). */
  data: ContractInput;
  createdAt: string;
}

export interface OwnerOption {
  email: string;
  name: string;
  initials: string;
}

export interface ContractSetup {
  /** The number the contract would get now (the database gives the final one when it is saved). */
  numberPreview: string;
  owners: OwnerOption[];
  me: { email: string; isContractAdmin: boolean; canSign: boolean };
}

/** A file of the module's settings: the terms (OWS, OWZ) and the signatures of the people who sign. */
export interface SettingsFile {
  key: string;
  label: string;
  /** Signed link for 10 minutes, or null when it is not uploaded yet. */
  url: string | null;
}

export const TERMS_FILE: Record<ContractType, string> = { S: 'terms/ows.pdf', P: 'terms/owz.pdf' };
export const TERMS_TITLE: Record<ContractType, string> = {
  S: 'General Terms and Conditions of Sale',
  P: 'General Terms and Conditions of Purchase',
};
export const signatureFile = (email: string) => `signatures/${email.trim().toLowerCase()}.png`;

export type ContractAction = 'accept' | 'approve' | 'sign' | 'return' | 'cancel' | 'client_scan' | 'edit';

export type ContractRequest =
  | { action: 'create'; contract: ContractInput; draftId?: string }
  | { action: 'saveDraft'; id?: string; contract: ContractInput }
  | { action: 'deleteDraft'; id: string }
  | { action: 'update'; id: string; contract: ContractInput }
  | { action: 'accept'; id: string; enovaOrder?: string; comment?: string }
  | { action: 'approve' | 'sign'; id: string; comment?: string }
  | { action: 'return' | 'cancel'; id: string; comment: string }
  | { action: 'scanUploadUrl'; id: string; fileName: string }
  | { action: 'client_scan'; id: string; path: string; fileName: string }
  | { action: 'settingsUploadUrl'; key: string };

export class ContractInputError extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// Amounts

/** The value of one line in the contract currency; null when the units cannot be combined (pieces priced by weight). */
export function lineTotal(line: Pick<ProductLine, 'quantity' | 'unit' | 'unitPrice' | 'priceUnit'>): number | null {
  const { quantity, unit, unitPrice, priceUnit } = line;
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;
  if (priceUnit === 'PCS' || priceUnit === '1000PCS') {
    if (unit !== 'PCS') return null;
    return round2(priceUnit === 'PCS' ? quantity * unitPrice : (quantity / 1000) * unitPrice);
  }
  if (unit === 'PCS') return null;
  const kg = unit === 'MT' ? quantity * 1000 : quantity;
  return round2(priceUnit === 'KG' ? kg * unitPrice : (kg / 1000) * unitPrice);
}

export function contractTotal(products: ContractInput['products']): number {
  return round2(products.reduce((sum, line) => sum + (lineTotal(line) ?? 0), 0));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The payment terms as one sentence for the contract, e.g. "30% prepayment before shipment, 70% within 14 days after delivery." */
export function paymentText({ prepaymentPercent, days, from }: Pick<Payment, 'prepaymentPercent' | 'days' | 'from'>): string {
  const rest = 100 - prepaymentPercent;
  const later = `within ${days} ${days === 1 ? 'day' : 'days'} ${PAYMENT_FROM_TEXT[from]}`;
  if (prepaymentPercent >= 100) return '100% prepayment before shipment.';
  if (prepaymentPercent <= 0) return `100% of the order value ${later}.`;
  return `${prepaymentPercent}% prepayment before shipment, ${rest}% ${later}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Numbers and initials

const PL: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

/**
 * The owner's initials in the contract number, without Polish letters: "Mateusz Świdnik" → "MS". Two words at most
 * (first and last name), like the intranet's numbers.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 2 ? [words[0], words[words.length - 1]] : words;
  return picked
    .map((w) => w[0].toLowerCase())
    .map((c) => PL[c] ?? c)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

// ---------------------------------------------------------------------------------------------------------------
// Who may do what

export interface Viewer {
  email: string;
  isContractAdmin: boolean;
  canSign: boolean;
  isBoard: boolean;
}

/** The steps this person may take on the contract now. */
export function allowedActions(contract: Pick<Contract, 'status' | 'ownerEmail' | 'boardRequired'>, viewer: Viewer): ContractAction[] {
  const own = contract.ownerEmail.toLowerCase() === viewer.email.toLowerCase();
  const can: ContractAction[] = [];
  switch (contract.status) {
    case 'admin_review':
      if (viewer.isContractAdmin) can.push('accept', 'return');
      break;
    case 'signature':
      if (viewer.canSign) can.push(contract.boardRequired ? 'approve' : 'sign', 'return');
      break;
    case 'board':
      if (viewer.canSign && viewer.isBoard) can.push('sign', 'return');
      break;
    case 'signed':
    case 'client_signed':
      if (own || viewer.isContractAdmin) can.push('client_scan');
      break;
    case 'returned':
      if (own || viewer.isContractAdmin) can.push('edit');
      break;
  }
  if (['admin_review', 'signature', 'board', 'returned'].includes(contract.status) && (own || viewer.isContractAdmin)) can.push('cancel');
  return can;
}

/** The statuses waiting for this person, for the "To do" list. */
export function todoStatuses(viewer: Viewer): ContractStatus[] {
  const statuses: ContractStatus[] = [];
  if (viewer.isContractAdmin) statuses.push('admin_review');
  if (viewer.canSign) statuses.push('signature');
  if (viewer.canSign && viewer.isBoard) statuses.push('board');
  return statuses;
}

// ---------------------------------------------------------------------------------------------------------------
// Validation (the server checks again what the form checks)

const text = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
const num = (value: unknown) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN);

export interface Problem {
  field: string;
  message: string;
}

/** The contract as entered, cleaned, with the list of problems (empty when it may be saved). */
export function cleanContract(raw: unknown, today = new Date().toISOString().slice(0, 10)): { contract: ContractInput; problems: Problem[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const problems: Problem[] = [];
  const need = (field: string, value: string, label: string) => {
    if (!value) problems.push({ field, message: `${label} is required.` });
  };
  const p = (r.party ?? {}) as Record<string, unknown>;
  const party: Party = {
    companyName: text(p.companyName),
    vatId: text(p.vatId, 30).replace(/\s+/g, '').toUpperCase(),
    contactFirstName: text(p.contactFirstName, 80),
    contactLastName: text(p.contactLastName, 80),
    contactPosition: text(p.contactPosition, 120),
    email: text(p.email, 200).toLowerCase(),
    phone: text(p.phone, 40),
    street: text(p.street),
    postalCode: text(p.postalCode, 20),
    city: text(p.city, 100),
    country: text(p.country, 2).toUpperCase(),
  };
  need('party.companyName', party.companyName, 'Company name');
  need('party.contactFirstName', party.contactFirstName, 'First name of the contact person');
  need('party.contactLastName', party.contactLastName, 'Last name of the contact person');
  need('party.street', party.street, 'Street');
  need('party.postalCode', party.postalCode, 'Postal code');
  need('party.city', party.city, 'City');
  if (!/^[A-Z]{2}$/.test(party.country)) problems.push({ field: 'party.country', message: 'Choose the country.' });
  if (!EMAIL.test(party.email)) problems.push({ field: 'party.email', message: 'Enter a valid e-mail address.' });
  need('party.phone', party.phone, 'Phone');
  if (party.country !== 'PL' && isEu(party.country) && !party.vatId) problems.push({ field: 'party.vatId', message: 'VAT ID is required for companies in the EU.' });
  if (party.country === 'PL' && !party.vatId) problems.push({ field: 'party.vatId', message: 'VAT ID (NIP) is required.' });

  const products: ProductLine[] = (Array.isArray(r.products) ? r.products : []).slice(0, 30).map((line: Record<string, unknown>) => ({
    name: text(line.name),
    productId: Number.isInteger(line.productId) ? (line.productId as number) : null,
    cnCode: text(line.cnCode, 20).replace(/[^0-9]/g, ''),
    quantity: num(line.quantity),
    unit: pick(line.unit, QUANTITY_UNITS, 'KG'),
    unitPrice: num(line.unitPrice),
    priceUnit: pick(line.priceUnit, PRICE_UNITS, 'KG'),
  }));
  if (!products.length) problems.push({ field: 'products', message: 'Add at least one product.' });
  products.forEach((line, i) => {
    if (!line.name) problems.push({ field: `products.${i}.name`, message: 'Product name is required.' });
    if (!(line.quantity > 0)) problems.push({ field: `products.${i}.quantity`, message: 'Quantity must be more than 0.' });
    if (!(line.unitPrice >= 0)) problems.push({ field: `products.${i}.unitPrice`, message: 'Enter the unit price.' });
    if (line.cnCode && !/^\d{4,10}$/.test(line.cnCode)) problems.push({ field: `products.${i}.cnCode`, message: 'A CN code has 8 digits (4–10 for a heading).' });
    if (lineTotal(line) === null) problems.push({ field: `products.${i}.priceUnit`, message: 'A quantity in pieces needs a price per piece (and a weight needs a price per KG or MT).' });
  });

  const d = (r.delivery ?? {}) as Record<string, unknown>;
  const delivery: Delivery = {
    incoterm: pick(d.incoterm, INCOTERMS, 'DDP'),
    byAir: d.incoterm === 'CIP' && d.byAir === true,
    street: text(d.street),
    postalCode: text(d.postalCode, 20),
    city: text(d.city, 100),
    country: text(d.country, 2).toUpperCase(),
    dateFrom: text(d.dateFrom, 10),
    dateTo: text(d.dateTo, 10),
    instructions: text(d.instructions, 1000),
    contactName: text(d.contactName, 120),
    contactEmail: text(d.contactEmail, 200).toLowerCase(),
    contactPhone: text(d.contactPhone, 40),
  };
  need('delivery.street', delivery.street, 'Delivery street');
  need('delivery.postalCode', delivery.postalCode, 'Delivery postal code');
  need('delivery.city', delivery.city, 'Delivery city');
  if (!/^[A-Z]{2}$/.test(delivery.country)) problems.push({ field: 'delivery.country', message: 'Choose the delivery country.' });
  if (!isDate(delivery.dateFrom)) problems.push({ field: 'delivery.dateFrom', message: 'Choose the first delivery date.' });
  if (!isDate(delivery.dateTo)) problems.push({ field: 'delivery.dateTo', message: 'Choose the last delivery date.' });
  else if (isDate(delivery.dateFrom) && delivery.dateTo < delivery.dateFrom) problems.push({ field: 'delivery.dateTo', message: 'The last delivery date cannot be before the first.' });
  if (delivery.contactEmail && !EMAIL.test(delivery.contactEmail)) problems.push({ field: 'delivery.contactEmail', message: 'Enter a valid e-mail address.' });

  const pay = (r.payment ?? {}) as Record<string, unknown>;
  const payment: Payment = {
    prepaymentPercent: Math.round(num(pay.prepaymentPercent)),
    days: Math.round(num(pay.days)),
    from: pick(pay.from, PAYMENT_FROM, 'delivery'),
    factoring: pay.factoring === true,
    notes: text(pay.notes, 1000),
  };
  if (!(payment.prepaymentPercent >= 0 && payment.prepaymentPercent <= 100)) problems.push({ field: 'payment.prepaymentPercent', message: 'Prepayment must be between 0 and 100%.' });
  if (payment.prepaymentPercent >= 100) payment.days = 0;
  else if (!(payment.days >= 0 && payment.days <= 365)) problems.push({ field: 'payment.days', message: 'Enter the number of days (0–365).' });

  const documents = DOCUMENTS.filter((doc) => Array.isArray(r.documents) && r.documents.includes(doc));
  if (!documents.length) problems.push({ field: 'documents', message: 'Choose at least one required document.' });

  const submissionDate = text(r.submissionDate, 10);
  if (!isDate(submissionDate)) problems.push({ field: 'submissionDate', message: 'Choose the contract date.' });
  else if (submissionDate > today) problems.push({ field: 'submissionDate', message: 'The contract date cannot be in the future.' });

  const contract: ContractInput = {
    type: pick(r.type, CONTRACT_TYPES, 'S'),
    submissionDate,
    ownerEmail: text(r.ownerEmail, 200).toLowerCase(),
    companyId: Number.isInteger(r.companyId) ? (r.companyId as number) : null,
    party,
    currency: pick(r.currency, CURRENCIES, 'EUR'),
    products,
    delivery,
    payment,
    documents,
  };
  return { contract, problems };
}

const EU = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
export const isEu = (country: string) => EU.includes(country);

/** Countries for the lists (English names), most used first is left to the browser's search. */
export const COUNTRIES: [string, string][] = [
  ['AE', 'United Arab Emirates'], ['AL', 'Albania'], ['AT', 'Austria'], ['AU', 'Australia'], ['BA', 'Bosnia and Herzegovina'],
  ['BE', 'Belgium'], ['BG', 'Bulgaria'], ['BR', 'Brazil'], ['CA', 'Canada'], ['CH', 'Switzerland'], ['CN', 'China'],
  ['CY', 'Cyprus'], ['CZ', 'Czech Republic'], ['DE', 'Germany'], ['DK', 'Denmark'], ['EE', 'Estonia'], ['EG', 'Egypt'],
  ['ES', 'Spain'], ['FI', 'Finland'], ['FR', 'France'], ['GB', 'United Kingdom'], ['GR', 'Greece'], ['HR', 'Croatia'],
  ['HU', 'Hungary'], ['ID', 'Indonesia'], ['IE', 'Ireland'], ['IL', 'Israel'], ['IN', 'India'], ['IS', 'Iceland'],
  ['IT', 'Italy'], ['JP', 'Japan'], ['KR', 'South Korea'], ['KZ', 'Kazakhstan'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'],
  ['LV', 'Latvia'], ['MA', 'Morocco'], ['MD', 'Moldova'], ['ME', 'Montenegro'], ['MK', 'North Macedonia'], ['MT', 'Malta'],
  ['MX', 'Mexico'], ['MY', 'Malaysia'], ['NL', 'Netherlands'], ['NO', 'Norway'], ['NZ', 'New Zealand'], ['PL', 'Poland'],
  ['PT', 'Portugal'], ['RO', 'Romania'], ['RS', 'Serbia'], ['SA', 'Saudi Arabia'], ['SE', 'Sweden'], ['SG', 'Singapore'],
  ['SI', 'Slovenia'], ['SK', 'Slovakia'], ['TH', 'Thailand'], ['TN', 'Tunisia'], ['TR', 'Turkey'], ['UA', 'Ukraine'],
  ['US', 'United States'], ['VN', 'Vietnam'], ['ZA', 'South Africa'],
];
export const countryName = (code: string) => COUNTRIES.find(([c]) => c === code)?.[1] ?? code;

// ---------------------------------------------------------------------------------------------------------------
// Prefill from a company

export const emptyParty = (): Party => ({
  companyName: '', vatId: '', contactFirstName: '', contactLastName: '', contactPosition: '', email: '', phone: '', street: '', postalCode: '', city: '', country: '',
});

export const emptyDelivery = (): Delivery => ({
  incoterm: 'DDP', byAir: false, street: '', postalCode: '', city: '', country: '', dateFrom: '', dateTo: '', instructions: '', contactName: '', contactEmail: '', contactPhone: '',
});

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
/** The intranet wrote "-" or "x" when there was nothing to say. */
const real = (value: unknown) => (['-', 'x', 'X', 'n/a'].includes(str(value)) ? '' : str(value));

/**
 * The party and delivery address for a company picked in the form: from its latest contract in this module, else
 * from its client card in the intranet (the first saved delivery address), else only the name and VAT ID.
 */
export function prefillFromCompany(hit: CompanyHit): { party: Party; delivery: Delivery | null } {
  if (hit.last) return { party: { ...emptyParty(), ...hit.last.party }, delivery: { ...emptyDelivery(), ...hit.last.delivery, dateFrom: '', dateTo: '' } };
  const c = hit.intranet ?? {};
  const party: Party = {
    companyName: str(c.companyName) || hit.name,
    vatId: (str(c.vatId) || hit.vatId || '').replace(/\s+/g, '').toUpperCase(),
    contactFirstName: real(c.contactPersonFirstName),
    contactLastName: real(c.contactPersonLastName),
    contactPosition: real(c.contactPersonPosition),
    email: real(c.email).toLowerCase(),
    phone: real(c.phone),
    street: real(c.street),
    postalCode: real(c.postalCode),
    city: real(c.city),
    country: (str(c.countryCode) || hit.country || '').toUpperCase().slice(0, 2),
  };
  const saved = Array.isArray(c.savedAddresses) ? (c.savedAddresses.find((a) => a && typeof a === 'object') as Record<string, unknown> | undefined) : undefined;
  if (!saved) return { party, delivery: null };
  const incoterm = str(saved.deliveryBasis).toUpperCase();
  const delivery: Delivery = {
    ...emptyDelivery(),
    incoterm: (INCOTERMS as readonly string[]).includes(incoterm) ? (incoterm as Incoterm) : 'DDP',
    byAir: incoterm === 'CIP' && saved.byAir === true,
    street: real(saved.street),
    postalCode: real(saved.postalCode),
    city: real(saved.city),
    country: str(saved.countryCode).toUpperCase().slice(0, 2),
    instructions: real(saved.instructions),
    contactName: [real(saved.contactPersonFirstName), real(saved.contactPersonLastName)].filter(Boolean).join(' '),
    contactEmail: real(saved.contactPersonEmail).toLowerCase(),
    contactPhone: real(saved.contactPersonPhone),
  };
  return { party, delivery };
}

/** "12 345.60 EUR" */
export function money(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ')} ${currency}`;
}

/** Whether this person may open the Contract generator at all. */
export function usesContracts(person: { role: 'admin' | 'user'; apps: readonly string[] }): boolean {
  return person.role === 'admin' || ['contracts', 'contracts-admin', 'contracts-sign'].some((app) => person.apps.includes(app));
}

/** "21069098" → "2106 90 98" (CN codes are written in pairs after the first four digits). */
export function formatCn(code: string): string {
  const digits = code.replace(/[^0-9]/g, '');
  if (digits.length <= 4) return digits;
  return [digits.slice(0, 4), ...(digits.slice(4).match(/.{1,2}/g) ?? [])].join(' ');
}
