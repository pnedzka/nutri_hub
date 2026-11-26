import { useEffect, useState } from 'react';
import { FilePen, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, type ContractList as List, type DraftSummary, type ListScope } from '../../../shared/contractsApi.ts';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { CONTRACTS_API, dateTime, shortDate } from './common';
import { StatusPill } from './ui';

const EMPTY: Record<ListScope, string> = {
  mine: 'You have no contracts yet. Generate the first one with “New contract”.',
  todo: 'Nothing is waiting for you.',
  all: 'No contracts yet.',
};

/** Saved drafts (My contracts): not numbered and not sent yet. */
function Drafts() {
  const toast = useToast();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ drafts: DraftSummary[] }>(`${CONTRACTS_API}&view=drafts`, { signal: controller.signal })
      .then((r) => setDrafts(r.drafts))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function remove(d: DraftSummary) {
    try {
      await api(CONTRACTS_API, { method: 'POST', body: { action: 'deleteDraft', id: d.id } });
      setDrafts((list) => list.filter((x) => x.id !== d.id));
      toast.success('Draft deleted');
    } catch (error) {
      toast.error('The draft was not deleted', (error as Error).message);
    }
  }

  if (!drafts.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Drafts</h2>
      <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-center gap-2 pr-2">
            <Link to={`/contracts/new?draft=${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 sm:px-6 py-3 hover:bg-gray-50">
              <FilePen size={16} className="shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{d.companyName || 'No company yet'}</p>
                <p className="text-xs text-gray-500">{d.type === 'S' ? 'Sales' : 'Purchase'} · saved {dateTime(d.updatedAt)}</p>
              </div>
            </Link>
            <button type="button" aria-label="Delete draft" onClick={() => remove(d)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
      {scope === 'mine' && <Drafts />}
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
