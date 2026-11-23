import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, type ContractList as List, type ListScope } from '../../../shared/contractsApi.ts';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { CONTRACTS_API, shortDate } from './common';
import { StatusPill } from './ui';

const EMPTY: Record<ListScope, string> = {
  mine: 'You have no contracts yet. Generate the first one with "New contract".',
  todo: 'Nothing is waiting for you.',
  all: 'No contracts yet.',
};

export function ContractList({ scope }: { scope: ListScope }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<List>(`${CONTRACTS_API}&view=list&scope=${scope}&q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
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
        aria-label="Search contracts"
        placeholder="Search by number, company or trader"
        leftIcon={<Search size={16} />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="text-base sm:text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {list && !list.items.length && <p className="py-8 text-center text-sm text-gray-500">{q ? 'No contracts match your search.' : EMPTY[scope]}</p>}
      {list && list.items.length > 0 && (
        <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {list.items.map((c) => (
            <li key={c.id}>
              <Link to={`/contracts/${encodeURIComponent(c.id)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-6 py-3 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{c.companyName}</p>
                  <p className="text-xs text-gray-500">
                    {c.id} · {c.type === 'S' ? 'Sales' : 'Purchase'} · {c.ownerName} · {shortDate(c.submissionDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{money(c.amountNet, c.currency)}</p>
                  {c.boardRequired && <p className="text-xs text-gray-500">Board signs</p>}
                </div>
                <StatusPill status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list && list.total > list.items.length && <p className="text-center text-xs text-gray-500">Showing the latest {list.items.length} of {list.total}. Search to find older ones.</p>}
    </div>
  );
}
