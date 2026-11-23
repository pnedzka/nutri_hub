// Notifications of the hub (the bell in the header, /notifications). The server writes them
// (api/_lib/notifications.ts); the browser reads its own rows straight from Supabase (RLS) and marks them as read.
// The full plan of notifications per module: README, "Powiadomienia".

export const NOTIFICATION_MODULES = ['leave', 'news', 'contracts', 'purchase', 'sales', 'contests', 'mailbox', 'account'] as const;
export type NotificationModule = (typeof NOTIFICATION_MODULES)[number];

export const MODULE_NAMES: Record<NotificationModule, string> = {
  leave: 'Leave',
  news: 'News',
  contracts: 'Contracts',
  purchase: 'Purchase Manager',
  sales: 'Sales proposals',
  contests: 'Sales contests',
  mailbox: 'Mailbox',
  account: 'Account',
};

export const isNotificationModule = (value: unknown): value is NotificationModule =>
  typeof value === 'string' && (NOTIFICATION_MODULES as readonly string[]).includes(value);

/** A row of public.notifications as the browser reads it. */
export interface NotificationItem {
  id: string;
  module: NotificationModule;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

export const NOTIFICATION_COLUMNS = 'id, module, kind, title, body, link, created_at, read_at';

/** How long notifications are kept. */
export const KEEP_DAYS = 180;

/** A link inside the hub (opened by the router) or nothing; outside links must be https. */
export function safeLink(link: string | null | undefined): { internal: boolean; href: string } | null {
  if (!link) return null;
  if (link.startsWith('/') && !link.startsWith('//')) return { internal: true, href: link };
  if (/^https:\/\/[^\s]+$/i.test(link)) return { internal: false, href: link };
  return null;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or the date. */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(then.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
