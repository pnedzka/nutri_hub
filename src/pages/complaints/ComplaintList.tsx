import { useEffect, useState } from 'react';
import { Clock, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TYPE_LABELS, daysOpen, isStale, type ComplaintList as List, type ListScope } from '../../../shared/complaintsApi.ts';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { shortDate } from '../contracts/common';
import { COMPLAINTS_API } from './common';
import { StatusPill } from './StatusPill';

const EMPTY: Record<ListScope, string> = {
  mine: 'No complaints concern you. Register one with “New complaint”.',
  open: 'No open complaints.',
  all: 'No complaints yet.',
};

export function ComplaintList({ scope }: { scope: ListScope }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<List>(`${COMPLAINTS_API}&view=list&scope=${scope}&q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
        .then((l) => {
          setList(l);
          setError('');
        })
        .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    }, q ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [scope, q]);

  return (
    <div className="space-y-4">
      <Input
        aria-label="Search complaints"
        placeholder="Search by number, contract, client, supplier, product or batch"
        leftIcon={<Search size={16} />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="text-base sm:text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {list && !list.items.length && <p className="py-8 text-center text-sm text-gray-500">{q ? 'No complaints match your search.' : EMPTY[scope]}</p>}
      {list && list.items.length > 0 && (
        <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {list.items.map((c) => {
            const stale = isStale(c);
            return (
              <li key={c.id}>
                <Link to={`/complaints/${encodeURIComponent(c.id)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-6 py-3 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{c.clientName || c.salesContractId}</p>
                    <p className="text-xs text-gray-500">
                      {c.id} · {c.salesContractId}
                      {c.supplierName ? ` · ${c.supplierName}` : ''} · {TYPE_LABELS[c.type]} · {c.handler.name} · {shortDate(c.createdAt)}
                    </p>
                    {c.productName && <p className="text-xs text-gray-500 truncate">{c.productName}</p>}
                  </div>
                  {stale && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="No change for a week or more">
                      <Clock size={14} />
                      {daysOpen(c.updatedAt)} days without a change
                    </span>
                  )}
                  <StatusPill status={c.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list && list.total > list.items.length && <p className="text-center text-xs text-gray-500">Showing the latest {list.items.length} of {list.total}. Search to find older ones.</p>}
    </div>
  );
}
