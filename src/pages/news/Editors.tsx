import { useState } from 'react';
import { Card, CardBody } from '../../components/Card';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { EditorsResponse } from '../../../shared/newsApi';
import { Empty, ErrorNote, Loading } from '../leave/ui';
import { useApi } from '../leave/useApi';
import { PageHeader } from './ui';

export function Editors() {
  const toast = useToast();
  const { data, error, reload } = useApi<EditorsResponse>('/api/news/editors');
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (userId: string, editor: boolean, name: string) => {
    setBusy(userId);
    try {
      await api('/api/news/editors', { method: 'PUT', body: { userId, editor } });
      toast.success(editor ? 'Editor added' : 'Editor removed', name);
      reload();
    } catch (e) {
      toast.error('Could not save', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: '/news', label: 'News' }} title="News editors" />
      <p className="text-sm text-gray-600">Editors publish news and edit their own posts. Administrators can always publish and edit every post.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && (
        <Card>
          {data.people.length ? (
            <ul className="divide-y divide-gray-100">
              {data.people.map((person) => (
                <li key={person.id}>
                  <label className={`flex items-center gap-3 px-6 py-3 min-h-11 ${person.isAdmin ? '' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-[#CC1F1F]"
                      checked={person.isAdmin || person.isEditor}
                      disabled={person.isAdmin || busy === person.id}
                      onChange={(e) => void toggle(person.id, e.target.checked, person.name)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{person.name}</span>
                      <span className="block truncate text-xs text-gray-500">{person.email}</span>
                    </span>
                    {person.isAdmin && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Administrator</span>}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <Empty>Nobody has access to News yet.</Empty>
            </CardBody>
          )}
        </Card>
      )}
    </div>
  );
}
