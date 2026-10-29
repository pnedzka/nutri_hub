// Formatting and the API address of Purchase Manager, shared by its screens.

export const PURCHASE_API = '/api/admin/users?resource=purchase';

export const whole = (value: number) => value.toLocaleString('en-GB');
export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
export const eur = (value: number | null) =>
  value === null ? '—' : `${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR/kg`;
export const kg = (value: number | null) => (value === null ? null : `${Math.round(value).toLocaleString('en-GB')} kg`);

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
