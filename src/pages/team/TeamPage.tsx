import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Mail, MapPin, Phone, Search, Smartphone, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Office, TeamMember } from '../../../shared/profile.ts';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { Select } from '../../components/Field';
import { Input } from '../../components/Input';
import { usePeople } from '../../lib/people';
import { Empty, ErrorNote, Loading } from '../leave/ui';

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Lower case without Polish diacritics, so "lodz" finds "Łódź". */
const fold = (text: string) => text.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');

const contactClass = 'inline-flex items-center gap-2 min-w-0 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 text-sm text-gray-600 hover:text-[#CC1F1F] [overflow-wrap:anywhere]';

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
      <div className="mt-3 flex flex-col">
        <a href={`mailto:${person.email}`} className={contactClass}>
          <Mail size={14} className="shrink-0" /> {person.email}
        </a>
        {person.phone && (
          <a href={tel(person.phone)} className={contactClass}>
            <Phone size={14} className="shrink-0" /> {person.phone}
          </a>
        )}
        {person.mobile && (
          <a href={tel(person.mobile)} className={contactClass}>
            <Smartphone size={14} className="shrink-0" /> {person.mobile}
          </a>
        )}
        {person.linkedin && (
          <a href={person.linkedin} target="_blank" rel="noreferrer" className={contactClass}>
            <ExternalLink size={14} className="shrink-0" /> LinkedIn
          </a>
        )}
      </div>
    </Card>
  );
}

/** Team: everyone with an active account, with their photo, job and contact details. */
export function TeamPage() {
  const { people, offices, error, load } = usePeople();
  const [query, setQuery] = useState('');
  const [officeId, setOfficeId] = useState('');
  // Always fresh on opening: a colleague may have changed their details.
  useEffect(() => void load(true), [load]);

  const officeById = useMemo(() => new Map(offices.map((o) => [o.id, o])), [offices]);
  const shown = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return (people ?? []).filter((p) => {
      if (officeId && p.officeId !== officeId) return false;
      const text = fold([p.name, p.email, p.jobTitle, p.department, officeById.get(p.officeId ?? '')?.name].filter(Boolean).join(' '));
      return words.every((w) => text.includes(w));
    });
  }, [people, query, officeId, officeById]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 mb-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> All apps
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UsersRound size={22} className="text-[#CC1F1F]" /> Team
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Contact details of everyone at Nutri Partners. Your own are in <Link to="/profile" className="text-[#CC1F1F] hover:underline">My profile</Link>.
        </p>
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
      {shown.length > 0 && (
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
