import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { MODULE_NAMES, NOTIFICATION_MODULES, type NotificationItem, type NotificationModule } from '../../shared/notifications.ts';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { NotificationRow } from '../components/NotificationBell';
import { loadPage, PAGE, useNotifications, useOpenNotification } from '../lib/notifications';
import { ScrollRow } from '../components/ScrollRow';

/** All notifications, newest first, by module; unread ones stay unread until opened or "Mark all as read". */
export function NotificationsPage() {
  const [module, setModule] = useState<NotificationModule | null>(null);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { unread, markAllRead, latest } = useNotifications();
  const open = useOpenNotification();

  const load = useCallback(async (append: NotificationItem[] | null) => {
    setBusy(true);
    setError(null);
    try {
      const page = await loadPage(module, append?.length ? append[append.length - 1].created_at : null);
      setItems([...(append ?? []), ...page]);
      setMore(page.length === PAGE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [module]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and on a new filter; state is set when the request resolves
  useEffect(() => void load(null), [load]);
  // New ones arrive through the bell's check; show them here too.
  const newest = latest[0]?.created_at;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the bell saw something newer
    if (newest && items?.length && newest > items[0].created_at) void load(null);
  }, [newest]); // eslint-disable-line react-hooks/exhaustive-deps

  const readAll = async () => {
    await markAllRead();
    const now = new Date().toISOString();
    setItems((list) => list?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? list);
  };

  const filters: (NotificationModule | null)[] = [null, ...NOTIFICATION_MODULES];
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={22} className="text-[#CC1F1F]" /> Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">{unread ? `${unread} unread` : 'You are up to date.'} Notifications are kept for 180 days.</p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" onClick={() => void readAll()}>
            <CheckCheck size={16} /> Mark all as read
          </Button>
        )}
      </div>

      <div className="-mx-4 sm:mx-0">
      <ScrollRow watch={module}>
      <div className="flex gap-2 px-4 sm:px-0 sm:flex-wrap">
        {filters.map((m) => (
          <button
            key={m ?? 'all'}
            type="button"
            onClick={() => setModule(m)}
            aria-pressed={module === m}
            className={`shrink-0 rounded-full px-3 py-1.5 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 text-sm border ${
              module === m ? 'bg-[#CC1F1F] border-[#CC1F1F] text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {m ? MODULE_NAMES[m] : 'All'}
          </button>
        ))}
      </div>
      </ScrollRow>
      </div>

      <Card className="overflow-hidden">
        {error && <p className="px-4 py-3 text-sm text-red-700 bg-red-50">{error}</p>}
        {items === null ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">No notifications{module ? ` in ${MODULE_NAMES[module]}` : ''}.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onOpen={(n) => {
                  setItems((list) => list?.map((x) => (x.id === n.id && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)) ?? list);
                  open(n);
                }}
              />
            ))}
          </div>
        )}
        {more && (
          <div className="p-4 border-t border-gray-100">
            <Button variant="secondary" className="w-full" isLoading={busy} onClick={() => void load(items)}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
