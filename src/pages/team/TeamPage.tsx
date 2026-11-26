import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, MapPin, Network, Search, UsersRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Office, TeamMember } from '../../../shared/profile.ts';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { Select } from '../../components/Field';
import { Input } from '../../components/Input';
import { useAuth } from '../../lib/auth';
import { usePeople } from '../../lib/people';
import { EmptyState as Empty, ErrorNote, Loading } from '../../components/States';
import { ContactLinks } from './contacts';
import { OrgChart } from './OrgChart';
import { PageHeader } from '../../components/PageHeader';

type View = 'chart' | 'list';

/** Lower case without Polish diacritics, so "lodz" finds "Łódź". */
const fold = (text: string) => text.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');

const tabClass = (on: boolean) =>
  `inline-flex min-h-11 sm:min-h-9 pointer-coarse:min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
    on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
  }`;

function PersonCard({ person, office }: { person: TeamMember; office: Office | undefined }) {
  return (
    <Card className="p-4 sm:p-5 h-full">
      <div className="flex items-start gap-3">
        <Avatar name={person.name} email={person.email} url={person.avatarUrl} />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 [overflow-wrap:anywhere]">{person.name || person.email}</p>
          {(person.jobTitle || person.department) && (
            <p className="text-sm text-gray-500">{[person.jobTitle, person.department].filter(Boolean).join(' · ')}</p>
          )}
          {office && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
              <MapPin size={12} /> {office.name}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <ContactLinks person={person} />
      </div>
    </Card>
  );
}

/** Team: everyone with an active account, with their photo, job and contact details, and who reports to whom. */
export function TeamPage() {
  const { people, offices, me, error, load } = usePeople();
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [officeId, setOfficeId] = useState('');
  // Always fresh on opening: a colleague may have changed their details.
  useEffect(() => void load(true), [load]);

  const officeById = useMemo(() => new Map(offices.map((o) => [o.id, o])), [offices]);
  const filtered = Boolean(officeId || query.trim());
  const shown = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return (people ?? []).filter((p) => {
      if (officeId && p.officeId !== officeId) return false;
      const text = fold([p.name, p.email, p.jobTitle, p.department, officeById.get(p.officeId ?? '')?.name].filter(Boolean).join(' '));
      return words.every((w) => text.includes(w));
    });
  }, [people, query, officeId, officeById]);
  const matches = useMemo(() => (filtered ? new Set(shown.map((p) => p.id)) : null), [filtered, shown]);
  // The org chart first once anyone has a manager; the choice stays in the address (?view=).
  const hasManagers = (people ?? []).some((p) => p.managerId);
  const asked = params.get('view');
  const view: View = asked === 'chart' || asked === 'list' ? asked : hasManagers ? 'chart' : 'list';
  const setView = (next: View) => setParams((p) => {
    p.set('view', next);
    return p;
  }, { replace: true });

  return (
    <div className="space-y-6">
      <PageHeader title="Team" icon={UsersRound}>
        Who is who at Nutri Partners and who reports to whom. Your own details are in <Link to="/profile" className="text-[#CC1F1F] hover:underline">My profile</Link>.
      </PageHeader>
      <div className="inline-flex rounded-lg bg-gray-100 p-1" role="tablist" aria-label="Team view">
        <button type="button" role="tab" aria-selected={view === 'chart'} className={tabClass(view === 'chart')} onClick={() => setView('chart')}>
          <Network size={16} /> Org chart
        </button>
        <button type="button" role="tab" aria-selected={view === 'list'} className={tabClass(view === 'list')} onClick={() => setView('list')}>
          <LayoutGrid size={16} /> Directory
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input
          id="team-search"
          type="search"
          placeholder="Search by name, job title, department…"
          aria-label="Search"
          leftIcon={<Search size={16} />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {offices.length > 0 && (
          <Select id="team-office" aria-label="Office" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            <option value="">All offices</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {error && !people && <ErrorNote>{error}</ErrorNote>}
      {!people && !error && <Loading />}
      {people && shown.length === 0 && <Empty>Nobody matches your search.</Empty>}
      {people && view === 'chart' && (shown.length > 0 || !filtered) && (
        <OrgChart people={people} offices={offices} me={me} isAdmin={isAdmin} matches={matches} />
      )}
      {view === 'list' && shown.length > 0 && (
        <ul className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id} className="min-w-0">
              <PersonCard person={p} office={officeById.get(p.officeId ?? '')} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
