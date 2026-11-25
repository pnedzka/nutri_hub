import { useEffect, useRef, useState } from 'react';
import { Bell, BriefcaseBusiness, CalendarClock, CalendarDays, CheckCheck, FileSignature, Inbox, Newspaper, ShoppingCart, Trophy, UserRound, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { timeAgo, type NotificationItem, type NotificationModule } from '../../shared/notifications.ts';
import { startNotificationPolling, useNotifications, useOpenNotification } from '../lib/notifications';
import { useToastStore } from '../lib/toast';

const MODULE_ICONS: Record<NotificationModule, LucideIcon> = {
  leave: CalendarDays,
  news: Newspaper,
  contracts: FileSignature,
  purchase: ShoppingCart,
  sales: BriefcaseBusiness,
  contests: Trophy,
  mailbox: Inbox,
  account: UserRound,
  calendar: CalendarClock,
};

/** One notification: icon, title, short text, time; unread ones have a red dot. */
export function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: (item: NotificationItem) => void }) {
  const Icon = MODULE_ICONS[item.module] ?? Bell;
  const unread = !item.read_at;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 min-h-11 hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50 ${unread ? 'bg-[#CC1F1F]/[0.03]' : ''}`}
    >
      <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${unread ? 'bg-[#CC1F1F]/10 text-[#CC1F1F]' : 'bg-gray-100 text-gray-500'}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm [overflow-wrap:anywhere] ${unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{item.title}</span>
        {item.body && <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2 [overflow-wrap:anywhere]">{item.body}</span>}
        <span className="block text-xs text-gray-400 mt-1">{timeAgo(item.created_at)}</span>
      </span>
      {unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#CC1F1F]" aria-label="Unread" />}
    </button>
  );
}

/** The bell in the header: unread count, the latest notifications, "See all". */
export function NotificationBell() {
  const { latest, unread, fresh, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const openItem = useOpenNotification();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => startNotificationPolling(), []);
  useEffect(() => {
    if (fresh) addToast({ type: 'info', title: fresh.title, message: fresh.body ?? undefined });
  }, [fresh, addToast]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const label = unread ? `Notifications (${unread} unread)` : 'Notifications';
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 pointer-coarse:min-h-11 pointer-coarse:min-w-11 rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-[#CC1F1F] text-white text-[10px] font-semibold leading-4 text-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto sm:right-0 top-[calc(4rem+env(safe-area-inset-top))] sm:top-full sm:mt-2 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-900">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-[#CC1F1F] min-h-11 sm:min-h-0">
                <CheckCheck size={14} /> Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
            {latest.length ? (
              latest.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={(n) => {
                    setOpen(false);
                    openItem(n);
                  }}
                />
              ))
            ) : (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</p>
            )}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block px-4 py-3 border-t border-gray-100 text-center text-sm font-medium text-[#CC1F1F] hover:bg-gray-50">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
