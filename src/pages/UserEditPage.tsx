import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, History, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EVENT_LABELS, type ProfileEvent, type TeamMember } from '../../shared/profile.ts';
import { APP_NAMES, isAppId } from '../../shared/access.ts';
import { Card, CardBody, CardHeader } from '../components/Card';
import { ProfileForm } from '../components/ProfileForm';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { usePeople } from '../lib/people';
import { useToast } from '../lib/toast';
import { Empty, ErrorNote, Loading } from './leave/ui';
import type { UserRow } from './UsersPage';

const appList = (value: unknown) =>
  Array.isArray(value) && value.length ? value.map((id) => (isAppId(id) ? APP_NAMES[id] : String(id))).join(', ') : 'none';

/** What changed, in a few words: the fields, the new role or the apps. */
function eventDetails(event: ProfileEvent): string | null {
  const d = event.details;
  if (event.action === 'profile' && Array.isArray(d.fields)) return d.fields.join(', ');
  if (event.action === 'role') return `${d.from} → ${d.to}`;
  if (event.action === 'apps') return appList(d.to);
  if (event.action === 'created') return d.role === 'admin' ? 'administrator' : `apps: ${appList(d.apps)}`;
  if (event.action === 'link') return d.kind === 'invite' ? 'invitation' : 'password reset';
  return null;
}

/** User management → Edit: an administrator changes a person's contact details and photo, and sees the history. */
export function UserEditPage() {
  const { id } = useParams();
  const toast = useToast();
  const { offices, load: loadPeople } = usePeople();
  const [user, setUser] = useState<UserRow | null | undefined>(undefined);
  const [events, setEvents] = useState<ProfileEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!id) return;
    try {
      setEvents((await api<{ events: ProfileEvent[] }>(`/api/admin/users?${new URLSearchParams({ history: id })}`)).events);
    } catch (e) {
      toast.error('Could not load the history', (e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void loadPeople();
    void api<{ users: UserRow[] }>('/api/admin/users')
      .then(({ users }) => setUser(users.find((u) => u.id === id) ?? null))
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set when the request resolves
    void loadHistory();
  }, [id, loadPeople, loadHistory]);

  const saved = (person: TeamMember) => {
    setUser((u) => (u ? { ...u, full_name: person.name, profile: person } : u));
    usePeople.getState().setPerson(person);
    void loadHistory();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link to="/users" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 mb-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> Users
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 [overflow-wrap:anywhere]">{user ? user.full_name || user.email : 'Edit account'}</h1>
        {user && (
          <p className="text-sm text-gray-500 mt-1">
            {user.email} · last sign-in {formatDateTime(user.last_sign_in_at)}
            {user.status === 'deactivated' && <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">Deactivated</span>}
          </p>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {user === undefined && !error && <Loading />}
      {user === null && <ErrorNote>This account no longer exists.</ErrorNote>}
      {user && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <UserRound size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">Contact details</h2>
          </CardHeader>
          <CardBody>
            <ProfileForm key={user.id} person={user.profile} offices={offices} onSaved={saved} asAdmin />
          </CardBody>
        </Card>
      )}
      {user && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <History size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">History</h2>
          </CardHeader>
          {events === null ? (
            <Loading />
          ) : events.length === 0 ? (
            <Empty>No changes recorded yet.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {events.map((e) => {
                const details = eventDetails(e);
                return (
                  <li key={e.id} className="px-6 py-3 text-sm">
                    <p className="text-gray-900">
                      <span className="font-medium">{EVENT_LABELS[e.action] ?? e.action}</span>
                      {details && <span className="text-gray-600">: {details}</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(e.createdAt)}
                      {e.actor ? ` · ${e.actor}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
