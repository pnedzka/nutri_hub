// Formatting and the API address of Purchase Manager, shared by its screens.

import { formatPrice, type PriceLike } from '../../../shared/purchaseApi';

export const PURCHASE_API = '/api/admin/users?resource=purchase';

export const whole = (value: number) => value.toLocaleString('en-GB');
export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
/** The price in its own currency and unit (shared/purchaseApi.ts, formatPrice). */
export const money = (p: PriceLike) => formatPrice(p) ?? '—';
export const kg = (value: number | null) => (value === null ? null : `${Math.round(value).toLocaleString('en-GB')} kg`);

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** "21 Oct 2026" */
export const day = (iso: string) => dateFormat.format(new Date(iso));
/** "21 Oct 2026 · 7 days ago" */
export function dateAgo(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / DAY);
  const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${dateFormat.format(date)} · ${ago}`;
}

export const SOURCE_NAMES: Record<string, string> = {
  apex_bid: 'Apex Bid',
  airtable: 'purchase@',
  ai: 'AI',
  intranet: 'Intranet',
  hubspot: 'HubSpot',
};
export const sourceName = (source: string | null) => (source ? (SOURCE_NAMES[source] ?? source) : '—');
