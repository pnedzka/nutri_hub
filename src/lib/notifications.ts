import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { NOTIFICATION_COLUMNS, safeLink, type NotificationItem, type NotificationModule } from '../../shared/notifications.ts';
import { supabase } from './supabase';

// The signed-in person's notifications, read straight from Supabase (RLS: only their own rows; the browser may only
// set read_at). The bell checks every minute and when the tab comes back; nothing goes through the hub's API.

export const PAGE = 25;
const LATEST = 8;
const EVERY_MS = 60_000;

interface NotificationsState {
  latest: NotificationItem[];
  unread: number;
  loaded: boolean;
  /** Newest unread notification seen since the page opened (for a toast). */
  fresh: NotificationItem | null;
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
}

let newestSeen: string | null = null;

export const useNotifications = create<NotificationsState>((set, get) => ({
  latest: [],
  unread: 0,
  loaded: false,
  fresh: null,
  refresh: async () => {
    if (!supabase) return;
    const [list, count] = await Promise.all([
      supabase.from('notifications').select(NOTIFICATION_COLUMNS).order('created_at', { ascending: false }).limit(LATEST),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ]);
    if (list.error || count.error) return;
    const latest = (list.data ?? []) as NotificationItem[];
    const top = latest[0];
    const fresh = get().loaded && top && !top.read_at && newestSeen !== null && top.created_at > newestSeen ? top : null;
    if (top && (newestSeen === null || top.created_at > newestSeen)) newestSeen = top.created_at;
    else if (newestSeen === null) newestSeen = '';
    set({ latest, unread: count.count ?? 0, loaded: true, fresh });
  },
  markRead: async (ids) => {
    if (!supabase || !ids.length) return;
    const now = new Date().toISOString();
    set((s) => ({
      latest: s.latest.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)),
      unread: Math.max(0, s.unread - s.latest.filter((n) => ids.includes(n.id) && !n.read_at).length),
    }));
    await supabase.from('notifications').update({ read_at: now }).in('id', ids).is('read_at', null);
    await get().refresh();
  },
  markAllRead: async () => {
    if (!supabase) return;
    const now = new Date().toISOString();
    set((s) => ({ latest: s.latest.map((n) => (n.read_at ? n : { ...n, read_at: now })), unread: 0 }));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  },
}));

/** Keeps the bell up to date while the hub is open. */
export function startNotificationPolling(): () => void {
  const refresh = () => void useNotifications.getState().refresh();
  refresh();
  const timer = window.setInterval(() => document.visibilityState === 'visible' && refresh(), EVERY_MS);
  const onVisible = () => document.visibilityState === 'visible' && refresh();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** A page of the full list (Notifications page), optionally one module, older than `before`. */
export async function loadPage(module: NotificationModule | null, before: string | null): Promise<NotificationItem[]> {
  if (!supabase) return [];
  let query = supabase.from('notifications').select(NOTIFICATION_COLUMNS).order('created_at', { ascending: false }).limit(PAGE);
  if (module) query = query.eq('module', module);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error('Could not load notifications. Try again.');
  return (data ?? []) as NotificationItem[];
}

/** Opens a notification's link and marks it as read. */
export function useOpenNotification() {
  const navigate = useNavigate();
  const markRead = useNotifications((s) => s.markRead);
  return (item: NotificationItem) => {
    if (!item.read_at) void markRead([item.id]);
    const link = safeLink(item.link);
    if (!link) return;
    if (link.internal) navigate(link.href);
    else window.open(link.href, '_blank', 'noopener');
  };
}

