// Contracts → "Archive (intranet)": contracts from the old intranet, read only. The data comes from the central database
// (raw.intranet_records, refreshed every hour by n8n) through contracts_api.archive_list / archive_get
// (db/central/contracts_archive.sql). The shapes follow the intranet, so most fields are optional.

export interface ArchiveItem {
  id: string;
  type: string;
  status: string;
  archived: boolean;
  ownerName: string;
  companyName: string;
  submissionDate: string | null;
  currency: string;
  amount: number;
  products: string;
}

export interface ArchiveList {
  total: number;
  items: ArchiveItem[];
  /** Traders and years in the archive the viewer may see, for the filters. */
  owners: string[];
  years: number[];
}

/** A date as the intranet stored it: ISO text or a Firestore timestamp. */
export type ArchiveDate = string | { seconds: number } | null | undefined;

export interface ArchiveParty {
  companyName?: string;
  vatId?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  email?: string;
  phone?: string;
  contactPersonFirstName?: string;
  contactPersonLastName?: string;
  contactPersonPosition?: string;
}

export interface ArchiveProduct {
  productName?: string;
  productGrade?: string;
  quantity?: string | number;
  unit?: string;
  unitPrice?: string | number;
  priceUnit?: string;
  currency?: string;
}

export interface ArchiveContract extends ArchiveItem {
  buyer: ArchiveParty | null;
  lines: ArchiveProduct[];
  delivery: (ArchiveParty & { deliveryBasis?: string; dateFrom?: ArchiveDate; dateTo?: ArchiveDate; byAir?: boolean; instructions?: string;
    contactPersonEmail?: string; contactPersonPhone?: string }) | null;
  paymentTerms: {
    paymentType?: string;
    usesFactoring?: boolean;
    additionalPaymentNotes?: string;
    prepaymentDetails?: { prepaymentDueDate?: ArchiveDate } | null;
    deferredPaymentDetails?: { paymentDueDate?: ArchiveDate; daysFromInvoiceDate?: number | string } | null;
  } | null;
  requiredDocuments: string[] | null;
  representative: string | null;
  signedByRepresentative: boolean | null;
  linkedContractId: string | null;
  proformaInvoiceNumber: string | null;
  vatInvoiceNumber: string | null;
  shipmentDate: ArchiveDate;
  attachments: { type: string | null; fileName: string | null; url: string; uploadedAt: string | null; uploadedBy: string | null }[];
}

/** ISO date (YYYY-MM-DD) from an intranet date, or null. */
export function archiveDate(value: ArchiveDate): string | null {
  if (!value) return null;
  if (typeof value === 'object') return Number.isFinite(value.seconds) ? new Date(value.seconds * 1000).toISOString().slice(0, 10) : null;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** The intranet writes "-" in fields that were left empty. */
export const filled = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text === '-' ? '' : text;
};

/** Value of one line, with the units converted as in the module (quantity in MT, price per KG and back). */
export function archiveLineTotal(line: ArchiveProduct): number | null {
  const quantity = Number(String(line.quantity ?? '').replace(',', '.'));
  const price = Number(String(line.unitPrice ?? '').replace(',', '.'));
  if (!Number.isFinite(quantity) || !Number.isFinite(price) || filled(line.quantity) === '' || filled(line.unitPrice) === '') return null;
  const factor = line.unit === 'MT' && line.priceUnit === 'KG' ? 1000 : line.unit === 'KG' && line.priceUnit === 'MT' ? 0.001 : 1;
  return Math.round(quantity * price * factor * 100) / 100;
}

/** Who sees which old contracts: a trader only their own (by name, the intranet has no e-mails); null = all. */
export function archiveViewerName(viewer: { name: string; isContractAdmin: boolean; canSign: boolean }): string | null {
  return viewer.isContractAdmin || viewer.canSign ? null : viewer.name;
}
