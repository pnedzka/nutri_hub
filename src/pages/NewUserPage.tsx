import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEFAULT_APPS, grantableApps, type AppId, type Role } from '../../shared/access.ts';
import { AppPicker } from '../components/AppPicker';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { ManagerSelect } from '../components/ManagerSelect';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { randomPassword } from '../lib/password';
import { useToast } from '../lib/toast';
import type { UserRow } from './UsersPage';

/** A choice shown as a card with a title and a line of explanation (a radio button). */
function Choice({ name, checked, onSelect, title, children }: { name: string; checked: boolean; onSelect: () => void; title: string; children: ReactNode }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 min-h-11 transition-colors ${
        checked ? 'border-[#CC1F1F] bg-[#CC1F1F]/5' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <input type="radio" name={name} className="mt-0.5 h-4 w-4 shrink-0 accent-[#CC1F1F]" checked={checked} onChange={onSelect} />
      <span>
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{children}</span>
      </span>
    </label>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <span className="text-[#CC1F1F]">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

/**
 * User management → Add user: the person, their role, their apps and how they sign in, in that order, with the
 * actions at the bottom. People with "Create user accounts" (not administrators) get the same page without the role
 * and the start password, and with only their own apps to give (newAccountProblem checks it again on the server).
 */
export function NewUserPage() {
  const me = useAuth((s) => s.user);
  const toast = useToast();
  const isAdmin = me?.role === 'admin';
  const grantable = me ? grantableApps(me) : [];
  const emptyForm = () => ({
    email: '',
    fullName: '',
    password: randomPassword(),
    role: 'user' as Role,
    apps: DEFAULT_APPS.filter((id) => grantable.includes(id)) as AppId[],
    invite: true,
    managerId: '',
  });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null);
  const [people, setPeople] = useState<UserRow[]>([]);

  // The manager is chosen from the existing accounts (administrators only; others cannot list accounts).
  useEffect(() => {
    if (!isAdmin) return;
    void api<{ users: UserRow[] }>('/api/admin/users')
      .then(({ users }) => setPeople(users))
      .catch(() => setPeople([]));
  }, [isAdmin]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, password: form.invite ? undefined : form.password, managerId: isAdmin ? form.managerId || null : undefined };
      await api('/api/admin/users', { method: 'POST', body });
      toast.success(form.invite ? 'Invitation sent' : 'Account created');
      setCreated({ email: form.email.trim().toLowerCase(), password: form.invite ? null : form.password });
      setForm(emptyForm());
    } catch (err) {
      toast.error('Could not create the account', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const back = isAdmin ? { to: '/users', label: 'Users' } : { to: '/', label: 'All apps' };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to={back.to} className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 mb-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> {back.label}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add user</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin
            ? 'The person gets an e-mail with a link to set their password, and then sees only the apps you choose. You can change everything later under Edit.'
            : 'Invite a new colleague: they get an e-mail with a link to set their password, and then see only the apps you choose (from the ones you have). Administrators change existing accounts.'}
        </p>
      </div>

      {created ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-green-600" />
              <div className="min-w-0 text-sm text-gray-700">
                {created.password ? (
                  <>
                    <p className="font-semibold text-gray-900">Account created. Pass on the sign-in details:</p>
                    <p className="mt-2 font-mono break-all">{created.email}</p>
                    <p className="font-mono break-all">{created.password}</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-gray-900">
                      Invitation sent to <span className="break-all">{created.email}</span>
                    </p>
                    <p className="mt-1">
                      The link in the e-mail works only once.{' '}
                      {isAdmin ? 'If it expires, send it again from the account list ("⋯" → Resend invitation).' : 'If it expires, an administrator can send it again.'}
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setCreated(null)}>
                <UserPlus size={16} /> Add another user
              </Button>
              <Link to={back.to} className="inline-flex items-center min-h-11 sm:min-h-0 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">
                Back to {back.label.toLowerCase()}
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <Section icon={<UserRound size={16} />} title="Person">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="E-mail" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Full name" autoComplete="off" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              {isAdmin && <ManagerSelect id="new-manager" value={form.managerId} onChange={(managerId) => setForm({ ...form, managerId })} people={people} />}
            </div>
          </Section>

          {/* Only administrators may create administrators or set a start password (newAccountProblem). */}
          {isAdmin && (
            <Section icon={<ShieldCheck size={16} />} title="Role">
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice name="role" checked={form.role === 'user'} onSelect={() => setForm({ ...form, role: 'user' })} title="User">
                  Uses the apps chosen below.
                </Choice>
                <Choice name="role" checked={form.role === 'admin'} onSelect={() => setForm({ ...form, role: 'admin' })} title="Administrator">
                  Manages users and can use every app.
                </Choice>
              </div>
            </Section>
          )}

          <Section icon={<KeyRound size={16} />} title="Apps and access">
            <AppPicker value={form.apps} onChange={(apps) => setForm({ ...form, apps })} admin={form.role === 'admin'} options={grantable} />
          </Section>

          {isAdmin && (
            <Section icon={<Mail size={16} />} title="Sign-in">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice name="signin" checked={form.invite} onSelect={() => setForm({ ...form, invite: true })} title="Send an e-mail invitation">
                    Recommended. The person sets their own password with the link.
                  </Choice>
                  <Choice name="signin" checked={!form.invite} onSelect={() => setForm({ ...form, invite: false })} title="Set a start password">
                    You pass the password on yourself.
                  </Choice>
                </div>
                {!form.invite && (
                  <Input label="Start password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                )}
              </div>
            </Section>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
            <Link to={back.to} className="inline-flex items-center justify-center min-h-11 sm:min-h-0 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">
              Cancel
            </Link>
            <Button type="submit" isLoading={busy}>
              {form.invite ? 'Send invitation' : 'Create account'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
