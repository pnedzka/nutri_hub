import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, History, KeyRound, UserRound, Users } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EVENT_LABELS, type ProfileEvent, type TeamMember } from '../../shared/profile.ts';
import { APP_NAMES, isAppId, type AppId } from '../../shared/access.ts';
import { AppPicker } from '../components/AppPicker';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader } from '../components/Card';
import { MailboxCard } from '../components/MailboxCard';
import { ManagerSelect } from '../components/ManagerSelect';
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
  if (event.action === 'manager') return typeof d.to === 'string' ? d.to : 'none';
  return null;
}

/** The apps the person may use (profiles.apps); administrators may use every app, so the list is then fixed. */
function AccessCard({ user, onSaved }: { user: UserRow; onSaved: (apps: AppId[]) => void }) {
  const toast = useToast();
  const [apps, setApps] = useState<AppId[]>(user.apps);
  const [saving, setSaving] = useState(false);
  const admin = user.role === 'admin';
  const changed = apps.join() !== user.apps.join();
  const save = async () => {
    setSaving(true);
    try {
      await api('/api/admin/users', { method: 'PATCH', body: { id: user.id, apps } });
      toast.success('Apps changed');
      onSaved(apps);
    } catch (e) {
      toast.error('Could not save the apps', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <KeyRound size={16} className="text-[#CC1F1F]" />
        <h2 className="text-sm font-semibold text-gray-900">Apps and access</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <AppPicker value={apps} onChange={setApps} admin={admin} disabled={saving} />
        {!admin && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} isLoading={saving} disabled={!changed}>
              Save apps
            </Button>
            {changed && (
              <Button variant="ghost" onClick={() => setApps(user.apps)} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** The person's manager (approves their leave), saved on its own like the apps. */
function ManagerCard({ user, people, onSaved }: { user: UserRow; people: UserRow[]; onSaved: (managerId: string | null) => void }) {
  const toast = useToast();
  const [managerId, setManagerId] = useState(user.manager_id ?? '');
  const [saving, setSaving] = useState(false);
  const changed = managerId !== (user.manager_id ?? '');
  const save = async () => {
    setSaving(true);
    try {
      await api('/api/admin/users', { method: 'PATCH', body: { id: user.id, managerId: managerId || null } });
      toast.success('Manager changed');
      onSaved(managerId || null);
    } catch (e) {
      toast.error('Could not save the manager', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Users size={16} className="text-[#CC1F1F]" />
        <h2 className="text-sm font-semibold text-gray-900">Manager</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <ManagerSelect id="manager" value={managerId} onChange={setManagerId} people={people} personId={user.id} disabled={saving} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} isLoading={saving} disabled={!changed}>
            Save manager
          </Button>
          {changed && (
            <Button variant="ghost" onClick={() => setManagerId(user.manager_id ?? '')} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** User management → Edit: an administrator changes a person's contact details and photo, and sees the history. */
export function UserEditPage() {
  const { id } = useParams();
  const toast = useToast();
  const { offices, load: loadPeople } = usePeople();
  const [user, setUser] = useState<UserRow | null | undefined>(undefined);
  const [people, setPeople] = useState<UserRow[]>([]);
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
      .then(({ users }) => {
        setPeople(users);
        setUser(users.find((u) => u.id === id) ?? null);
      })
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
        <AccessCard
          key={`access-${user.id}-${user.role}`}
          user={user}
          onSaved={(apps) => {
            setUser((u) => (u ? { ...u, apps } : u));
            void loadHistory();
          }}
        />
      )}
      {user && (
        <ManagerCard
          key={`manager-${user.id}`}
          user={user}
          people={people}
          onSaved={(managerId) => {
            setUser((u) => (u ? { ...u, manager_id: managerId } : u));
            void loadHistory();
          }}
        />
      )}
      {user && user.status !== 'deactivated' && <MailboxCard key={`mailbox-${user.id}`} userId={user.id} owner={user.full_name || user.email} />}
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
