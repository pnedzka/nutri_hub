import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Ban, Check, KeyRound, Mail, Pencil, RotateCcw, ShieldCheck, SquarePen, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_IDS, APP_NAMES, type AppId, type Role } from '../../shared/access.ts';
import type { TeamMember } from '../../shared/profile.ts';
import { available } from '../apps';
import { ActionsMenu, type MenuAction } from '../components/ActionsMenu';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { OfficesCard } from '../components/OfficesCard';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  apps: AppId[];
  created_at: string;
  documents: number;
  status: 'active' | 'invited' | 'created' | 'deactivated';
  last_sign_in_at: string | null;
  /** Contact details and photo, as Team shows them. */
  profile: TeamMember;
}

const STATUS: Record<UserRow['status'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700' },
  invited: { label: 'Invited', className: 'bg-amber-50 text-amber-700' },
  created: { label: 'Never signed in', className: 'bg-gray-100 text-gray-600' },
  deactivated: { label: 'Deactivated', className: 'bg-gray-200 text-gray-700' },
};

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** The account's name and e-mail; the pencil turns the name into a field (Enter saves, Escape cancels). */
function UserName({ user, onSave }: { user: UserRow; onSave: (fullName: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (draft === null) return;
    setSaving(true);
    const saved = draft.trim() === (user.full_name ?? '') || (await onSave(draft));
    setSaving(false);
    if (saved) setDraft(null);
  };

  if (draft !== null) {
    return (
      <form onSubmit={save} className="flex items-center gap-1" onKeyDown={(e) => e.key === 'Escape' && setDraft(null)}>
        <input
          autoFocus
          value={draft}
          maxLength={200}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Full name"
          aria-label={`Full name of ${user.email}`}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
        />
        <button type="submit" disabled={saving} className="shrink-0 rounded-lg p-1.5 pointer-coarse:p-3 text-green-700 hover:bg-green-50" aria-label="Save name" title="Save">
          <Check size={16} />
        </button>
        <button type="button" disabled={saving} onClick={() => setDraft(null)} className="shrink-0 rounded-lg p-1.5 pointer-coarse:p-3 text-gray-500 hover:bg-gray-100" aria-label="Cancel" title="Cancel">
          <X size={16} />
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-3 min-w-0">
    <Avatar name={user.full_name} email={user.email} url={user.profile.avatarUrl} size="sm" />
    <div className="min-w-0">
      <p className="flex items-center gap-1 font-medium text-gray-900 break-words">
        <span className="min-w-0">{user.full_name || user.email}</span>
        <button
          type="button"
          onClick={() => setDraft(user.full_name ?? '')}
          className="shrink-0 rounded p-1 pointer-coarse:p-2.5 pointer-coarse:-my-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          aria-label={`Edit the name of ${user.email}`}
          title="Edit name"
        >
          <Pencil size={13} />
        </button>
      </p>
      {user.full_name && <p className="text-xs text-gray-500 break-all">{user.email}</p>}
      {user.profile.jobTitle && <p className="text-xs text-gray-500 break-words">{user.profile.jobTitle}</p>}
    </div>
    </div>
  );
}

/** Checkboxes for the apps a person may use. Administrators may use every app, so the list is then fixed. */
function AppPicker({ value, onChange, admin, disabled }: { value: AppId[]; onChange: (apps: AppId[]) => void; admin: boolean; disabled?: boolean }) {
  const toggle = (id: AppId, on: boolean) => onChange(APP_IDS.filter((a) => (a === id ? on : value.includes(a))));
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Apps</legend>
      {APP_IDS.filter((id) => available(id)).map((id) => (
        <label key={id} className="flex items-center gap-2 min-h-8 pointer-coarse:min-h-11 text-sm text-gray-700">
          <input type="checkbox" checked={admin || value.includes(id)} disabled={admin} onChange={(e) => toggle(id, e.target.checked)} />
          {APP_NAMES[id]}
          {id === 'intranet' && <span className="text-xs text-gray-400">(tile only, separate sign-in)</span>}
        </label>
      ))}
      {admin && <p className="text-xs text-gray-500">Administrators can use every app.</p>}
    </fieldset>
  );
}

/** The person's apps as chips, with a button that turns them into checkboxes (Save / Cancel). */
function UserApps({ user, onSave }: { user: UserRow; onSave: (apps: AppId[]) => Promise<boolean> }) {
  const [draft, setDraft] = useState<AppId[] | null>(null);
  const [saving, setSaving] = useState(false);

  if (user.role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#CC1F1F]/10 px-2 py-0.5 text-[11px] font-medium text-[#CC1F1F]">
        <ShieldCheck size={12} /> All apps
      </span>
    );
  }

  if (draft) {
    const save = async () => {
      setSaving(true);
      const saved = await onSave(draft);
      setSaving(false);
      if (saved) setDraft(null);
    };
    return (
      <div className="space-y-2">
        <AppPicker value={draft} onChange={setDraft} admin={false} disabled={saving} />
        <div className="flex gap-1">
          <Button size="sm" onClick={() => void save()} isLoading={saving}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {user.apps.length === 0 && <span className="text-xs text-amber-700">No apps</span>}
      {user.apps.filter((id) => available(id)).map((id) => (
        <span key={id} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">{APP_NAMES[id]}</span>
      ))}
      <button
        type="button"
        onClick={() => setDraft(user.apps)}
        className="rounded p-1 pointer-coarse:p-2.5 pointer-coarse:-my-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        aria-label={`Edit the apps of ${user.email}`}
        title="Edit apps"
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}

export function UsersPage() {
  const me = useAuth((s) => s.user);
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const emptyForm = () => ({ email: '', fullName: '', password: randomPassword(), role: 'user' as Role, apps: [...APP_IDS] as AppId[], invite: true });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: UserRow[] }>('/api/admin/users')).users);
    } catch (e) {
      toast.error('Could not load users', (e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set when the request resolves
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = form.invite ? { ...form, password: undefined } : form;
      await api('/api/admin/users', { method: 'POST', body });
      toast.success(form.invite ? 'Invitation sent' : 'Account created');
      setCreated({ email: form.email.trim().toLowerCase(), password: form.invite ? null : form.password });
      setForm(emptyForm());
      await load();
    } catch (err) {
      toast.error('Could not create the account', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, body: Record<string, unknown>, done: string) => {
    try {
      await api('/api/admin/users', { method: 'PATCH', body: { id, ...body } });
      toast.success(done);
      await load();
      return true;
    } catch (err) {
      toast.error('Could not save the change', (err as Error).message);
      return false;
    }
  };

  const rename = (u: UserRow) => (fullName: string) => update(u.id, { fullName }, 'Name changed');
  const setApps = (u: UserRow) => (apps: AppId[]) => update(u.id, { apps }, 'Apps changed');

  const setActive = async (u: UserRow, active: boolean) => {
    const question = active
      ? `Reactivate the account ${u.email}?\n\nThe person can sign in again and gets back their apps.`
      : `Deactivate the account ${u.email}?\n\nUse this when someone leaves: they can no longer sign in (within an hour in apps that are already open) and disappear from Team. Their documents, leave and posts stay. You can reactivate the account later.`;
    if (!confirm(question)) return;
    await update(u.id, { active }, active ? `Account ${u.email} reactivated` : `Account ${u.email} deactivated`);
  };

  const sendLink = async (u: UserRow) => {
    const what = u.status === 'invited' ? 'the invitation again' : 'a link to set a new password';
    if (!confirm(`Send ${what} to ${u.email}?`)) return;
    try {
      const { sent } = await api<{ sent: 'invite' | 'recovery' }>('/api/admin/users', { method: 'PATCH', body: { id: u.id, sendLink: true } });
      toast.success(sent === 'invite' ? `Invitation resent to ${u.email}` : `Password reset link sent to ${u.email}`);
      await load();
    } catch (err) {
      toast.error('Could not send the e-mail', (err as Error).message);
    }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`Delete the account ${u.email}?\n\nThis cannot be undone. The person will lose access to the app.`)) return;
    try {
      await api('/api/admin/users', { method: 'DELETE', body: { id: u.id } });
      toast.success(`Account ${u.email} deleted`);
      await load();
    } catch (err) {
      toast.error('Could not delete the account', (err as Error).message);
    }
  };

  const resetPassword = (u: UserRow) => {
    const password = randomPassword();
    if (!confirm(`Set a new password for ${u.email}?\n\nNew password: ${password}\n\nWrite it down and pass it on to the user.`)) return;
    void update(u.id, { password }, `New password for ${u.email}: ${password}`);
  };

  const statusPill = (u: UserRow) => (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[u.status].className}`}
      title={u.last_sign_in_at ? `Last sign-in: ${formatDateTime(u.last_sign_in_at)}` : undefined}
    >
      {STATUS[u.status].label}
    </span>
  );

  const roleSelect = (u: UserRow) => (
    <select
      value={u.role}
      disabled={u.id === me?.id}
      onChange={(e) => void update(u.id, { role: e.target.value }, 'Role changed')}
      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm disabled:bg-gray-50"
      aria-label={`Role of ${u.email}`}
    >
      <option value="user">user</option>
      <option value="admin">administrator</option>
    </select>
  );

  const deactivated = (u: UserRow) => u.status === 'deactivated';

  const actions = (u: UserRow) => {
    const items: MenuAction[] = [{ label: 'Edit profile and history', icon: <SquarePen size={15} />, to: `/users/${u.id}` }];
    if (!deactivated(u)) {
      items.push(
        { label: u.status === 'invited' ? 'Resend invitation' : 'Reset password (e-mail link)', icon: <Mail size={15} />, onSelect: () => void sendLink(u) },
        { label: 'Set a new password', icon: <KeyRound size={15} />, onSelect: () => resetPassword(u) },
      );
    }
    if (u.id !== me?.id) {
      items.push(
        deactivated(u)
          ? { label: 'Reactivate', icon: <RotateCcw size={15} />, onSelect: () => void setActive(u, true) }
          : { label: 'Deactivate', icon: <Ban size={15} />, onSelect: () => void setActive(u, false) },
        {
          label: 'Delete account',
          icon: <Trash2 size={15} />,
          danger: true,
          onSelect: () => void remove(u),
          disabledReason: u.documents > 0 ? 'Has documents, which must be kept. Deactivate instead.' : undefined,
        },
      );
    }
    return <ActionsMenu label={`Actions for ${u.email}`} actions={items} />;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 mb-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> All apps
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          Accounts are created here. A new person gets an e-mail with a link to set a password, and then sees only the apps you choose. Contact details and photos are under Edit; everyone can also change their own in My profile.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 items-start">
        <Card className="max-w-xl">
          <CardHeader className="flex items-center gap-2">
            <UserPlus size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">New account</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={create} className="space-y-4">
              <Input label="E-mail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5" checked={form.invite} onChange={(e) => setForm({ ...form, invite: e.target.checked })} />
                <span>
                  Send an e-mail invitation
                  <span className="block text-xs text-gray-500">The user sets their own password via the link in the e-mail.</span>
                </span>
              </label>
              {!form.invite && (
                <Input label="Initial password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.role === 'admin'} onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'user' })} />
                Administrator (manages users, can use every app)
              </label>
              <AppPicker value={form.apps} onChange={(apps) => setForm({ ...form, apps })} admin={form.role === 'admin'} />
              <Button type="submit" isLoading={busy}>{form.invite ? 'Send invitation' : 'Create account'}</Button>
            </form>
            {created && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                {created.password ? (
                  <>
                    <p className="font-medium">Account created – pass on the sign-in details:</p>
                    <p className="mt-1 font-mono break-all">{created.email}</p>
                    <p className="font-mono break-all">{created.password}</p>
                  </>
                ) : (
                  <p>
                    Invitation sent to <span className="font-medium break-all">{created.email}</span>. The link in the e-mail works only once. If it expires, send it again from the account list.
                  </p>
                )}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Users size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">Accounts {users ? `(${users.length})` : ''}</h2>
          </CardHeader>
          {/* Phones: one card per account. */}
          <ul className="md:hidden divide-y divide-gray-100">
            {(users ?? []).map((u) => (
              <li key={u.id} className="px-4 py-4 space-y-3">
                <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <UserName user={u} onSave={rename(u)} />
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {statusPill(u)}
                    <span>Last sign-in {formatDateTime(u.last_sign_in_at)}</span>
                  </div>
                </div>
                <div className="shrink-0 -mr-2 -mt-1">{actions(u)}</div>
                </div>
                {roleSelect(u)}
                <UserApps user={u} onSave={setApps(u)} />
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Apps</th>
                  <th className="px-4 py-3">Last sign-in</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3">
                      <UserName user={u} onSave={rename(u)} />
                      <div className="mt-1">{statusPill(u)}</div>
                    </td>
                    <td className="px-4 py-3">{roleSelect(u)}</td>
                    <td className="px-4 py-3 max-w-[260px]"><UserApps user={u} onSave={setApps(u)} /></td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap" title={`Created ${formatDateTime(u.created_at)}`}>{formatDateTime(u.last_sign_in_at)}</td>
                    <td className="px-4 py-3 text-right">{actions(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <OfficesCard />
      </div>
    </div>
  );
}
