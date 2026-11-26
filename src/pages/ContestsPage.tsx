import { useState, type FormEvent } from 'react';
import { Medal, Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import type { Contest, ContestInput, ContestResult, ContestStatus } from '../../shared/contest';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Textarea } from '../components/Field';
import { Input } from '../components/Input';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { Empty, ErrorNote, Loading } from './leave/ui';
import { useApi } from './leave/useApi';
import { formatEur } from './home/format';
import { askConfirm } from '../lib/confirm';

// Sales contests (administrators): who takes part, for which days, what counts how much and the prize. The running
// contest shows on the home page of its participants (ContestWidget); here administrators see every ranking.

const CONTESTS_API = '/api/admin/users?resource=contests';

interface Candidate {
  id: string;
  name: string;
  department: string | null;
}
interface ListResponse {
  contests: (Contest & { status: ContestStatus })[];
  people: Candidate[];
}

const STATUS: Record<ContestStatus, string> = { upcoming: 'Upcoming', active: 'Running', finished: 'Finished' };
const STATUS_STYLE: Record<ContestStatus, string> = {
  upcoming: 'bg-gray-100 text-gray-600',
  active: 'bg-[#CC1F1F]/10 text-[#CC1F1F]',
  finished: 'bg-gray-100 text-gray-500',
};
const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

const EMPTY: ContestInput = { name: '', startsOn: '', endsOn: '', weightCount: 70, prize: '', participantIds: [] };

function ContestForm({ initial, people, onSaved, onCancel }: { initial: Contest | null; people: Candidate[]; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<ContestInput>(initial ?? { ...EMPTY, participantIds: people.filter((p) => p.department === 'Trade').map((p) => p.id) });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ContestInput>(key: K, value: ContestInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (id: string) =>
    set('participantIds', form.participantIds.includes(id) ? form.participantIds.filter((p) => p !== id) : [...form.participantIds, id]);
  // Trade first: they are the usual participants.
  const ordered = [...people].sort((a, b) => Number(b.department === 'Trade') - Number(a.department === 'Trade') || a.name.localeCompare(b.name, 'pl'));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(CONTESTS_API, { method: 'POST', body: initial ? { ...form, id: initial.id } : form });
      toast.success(initial ? 'Contest saved' : 'Contest created');
      onSaved();
    } catch (error) {
      toast.error('Not saved', (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-gray-900">{initial ? `Edit “${initial.name}”` : 'New contest'}</h2>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First day" type="date" value={form.startsOn} onChange={(e) => set('startsOn', e.target.value)} required />
            <Input label="Last day" type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => set('endsOn', e.target.value)} required />
          </div>
          <div>
            <label htmlFor="weight" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              What counts
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="weight"
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.weightCount}
                onChange={(e) => set('weightCount', Number(e.target.value))}
                className="flex-1 accent-[#CC1F1F]"
              />
            </div>
            <p className="mt-1 text-sm text-gray-700">
              {form.weightCount}% number of contracts · {100 - form.weightCount}% their value in EUR
            </p>
          </div>
          <Textarea label="Prize" value={form.prize} onChange={(e) => set('prize', e.target.value)} maxLength={500} rows={2} />
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider text-gray-500">Participants ({form.participantIds.length})</legend>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {ordered.map((person) => (
                <li key={person.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-gray-50 sm:min-h-9">
                    <input type="checkbox" checked={form.participantIds.includes(person.id)} onChange={() => toggle(person.id)} className="h-4 w-4 accent-[#CC1F1F]" />
                    <span className="text-sm text-gray-900">{person.name}</span>
                    {person.department && <span className="text-xs text-gray-500">{person.department}</span>}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {initial ? 'Save' : 'Create contest'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function Results({ id }: { id: string }) {
  const { data, error } = useApi<ContestResult>(`${CONTESTS_API}&id=${id}`);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  if (!data.entries.length) return <Empty>No participants.</Empty>;
  return (
    <ol className="space-y-1">
      {data.entries.map((entry, index) => (
        <li key={entry.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index < 3 ? 'bg-[#CC1F1F]/10 text-[#CC1F1F]' : 'text-gray-400'}`}>
            {index + 1}
          </span>
          <Avatar name={entry.name} email="" url={entry.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{entry.name}</span>
          <span className="text-right text-xs text-gray-500">
            {entry.contracts} contracts · {formatEur(entry.eur ?? 0)}
          </span>
          <span className="w-14 text-right text-sm font-bold text-gray-900">{entry.score}</span>
        </li>
      ))}
    </ol>
  );
}

export function ContestsPage() {
  const toast = useToast();
  const { data, error, reload } = useApi<ListResponse>(CONTESTS_API);
  const [editing, setEditing] = useState<Contest | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function remove(contest: Contest) {
    if (!(await askConfirm(`Delete the contest “${contest.name}”?\n\nIts ranking disappears from the home page. Contracts stay as they are.`))) return;
    try {
      await api(CONTESTS_API, { method: 'DELETE', body: { id: contest.id } });
      toast.success('Contest deleted');
      reload();
    } catch (e) {
      toast.error('Not deleted', (e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Trophy size={22} className="text-[#CC1F1F]" aria-hidden="true" />
            Sales contests
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            The running contest shows on its participants' home page. Points mix the number of contracts (sales and purchases) and their value in EUR, each
            against the leader.
          </p>
        </div>
        {!editing && data && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} className="mr-1.5" />
            New contest
          </Button>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && editing && (
        <ContestForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          people={data.people}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {data && !data.contests.length && !editing && <Empty>No contests yet.</Empty>}
      {data?.contests.map((contest) => (
        <Card key={contest.id}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <Medal size={18} className="shrink-0 text-[#CC1F1F]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900">{contest.name}</p>
              <p className="text-xs text-gray-500">
                {day(contest.startsOn)} – {day(contest.endsOn)} · {contest.participantIds.length} participants · {contest.weightCount}% count,{' '}
                {100 - contest.weightCount}% value
                {contest.prize && ` · Prize: ${contest.prize}`}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[contest.status]}`}>{STATUS[contest.status]}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setOpen(open === contest.id ? null : contest.id)} aria-expanded={open === contest.id}>
                {open === contest.id ? 'Hide ranking' : 'Ranking'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(contest)} aria-label={`Edit ${contest.name}`}>
                <Pencil size={15} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void remove(contest)} aria-label={`Delete ${contest.name}`}>
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
          {open === contest.id && (
            <CardBody className="border-t border-gray-100">
              <Results id={contest.id} />
            </CardBody>
          )}
        </Card>
      ))}
    </div>
  );
}
