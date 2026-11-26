import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, Check, Copy, KeyRound, Mail, RotateCcw, Search, ShieldCheck, SquarePen, Trash2, UserPlus, Users } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { APP_NAMES, canEditProfiles, canUse, type AppId, type Role } from '../../shared/access.ts';
import type { TeamMember } from '../../shared/profile.ts';
import { available } from '../apps';
import { ActionsMenu, type MenuAction } from '../components/ActionsMenu';
import { Avatar } from '../components/Avatar';
import { OfficesCard } from '../components/OfficesCard';
import { Button } from '../components/Button';
import { Card, CardHeader } from '../components/Card';
import { Dialog } from '../components/Dialog';
import { Input } from '../components/Input';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { randomPassword } from '../lib/password';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm';

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
  /** The person's manager (approves their leave), set by administrators. */
  manager_id: string | null;
}

const STATUS: Record<UserRow['status'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700' },
  invited: { label: 'Invited', className: 'bg-amber-50 text-amber-700' },
  created: { label: 'Never signed in', className: 'bg-gray-100 text-gray-600' },
  deactivated: { label: 'Deactivated', className: 'bg-gray-200 text-gray-700' },
};

/** The account's photo, name, e-mail and job title; the name is changed under Edit (the "⋯" menu). */
function UserName({ user }: { user: UserRow }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <Avatar name={user.full_name} email={user.email} url={user.profile.avatarUrl} size="sm" />
      <div className="min-w-0">
        <p className="font-medium text-gray-900 break-words">{user.full_name || user.email}</p>
        {user.full_name && <p className="text-xs text-gray-500 break-all">{user.email}</p>}
        {user.profile.jobTitle && <p className="text-xs text-gray-500 break-words">{user.profile.jobTitle}</p>}
      </div>
    </div>
  );
}

/** The person's apps as chips; they are changed on the account's Edit page ("⋯" → Edit). */
function UserApps({ user }: { user: UserRow }) {
  if (user.role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#CC1F1F]/10 px-2 py-0.5 text-[11px] font-medium text-[#CC1F1F]">
        <ShieldCheck size={12} /> All apps
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {user.apps.length === 0 && <span className="text-xs text-amber-700">No apps</span>}
      {user.apps.filter((id) => available(id)).map((id) => (
        <span key={id} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">{APP_NAMES[id]}</span>
      ))}
    </div>
  );
}

export function UsersPage() {
  const me = useAuth((s) => s.user);
  const isAdmin = me?.role === 'admin';
  // "Edit user profiles": the list and Edit (contact details, name, manager), without roles, apps and passwords.
  const canList = Boolean(me && canEditProfiles(me));
  const canAdd = Boolean(me && canUse(me, 'create-users'));
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [query, setQuery] = useState('');
  const load = useCallback(async () => {
    if (!canList) return;
    try {
      setUsers((await api<{ users: UserRow[] }>('/api/admin/users')).users);
    } catch (e) {
      toast.error('Could not load users', (e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canList]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set when the request resolves
    void load();
  }, [load]);

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


  const setActive = async (u: UserRow, active: boolean) => {
    const question = active
      ? `Reactivate the account ${u.email}?\n\nThe person can sign in again and gets back their apps.`
      : `Deactivate the account ${u.email}?\n\nUse this when someone leaves: they can no longer sign in (within an hour in apps that are already open) and disappear from Team. Their documents, leave and posts stay. You can reactivate the account later.`;
    if (!(await askConfirm(question))) return;
    await update(u.id, { active }, active ? `Account ${u.email} reactivated` : `Account ${u.email} deactivated`);
  };

  const sendLink = async (u: UserRow) => {
    const what = u.status === 'invited' ? 'the invitation again' : 'a link to set a new password';
    if (!(await askConfirm(`Send ${what} to ${u.email}?`))) return;
    try {
      const { sent } = await api<{ sent: 'invite' | 'recovery' }>('/api/admin/users', { method: 'PATCH', body: { id: u.id, sendLink: true } });
      toast.success(sent === 'invite' ? `Invitation resent to ${u.email}` : `Password reset link sent to ${u.email}`);
      await load();
    } catch (err) {
      toast.error('Could not send the e-mail', (err as Error).message);
    }
  };

  const remove = async (u: UserRow) => {
    if (!(await askConfirm(`Delete the account ${u.email}?\n\nThis cannot be undone. The person will lose access to the app.`))) return;
    try {
      await api('/api/admin/users', { method: 'DELETE', body: { id: u.id } });
      toast.success(`Account ${u.email} deleted`);
      await load();
    } catch (err) {
      toast.error('Could not delete the account', (err as Error).message);
    }
  };

  // "Set a new password": a window with the password to copy, open until the administrator closes it (not a confirm()
  // and a toast that disappears after 4 s).
  const [passwordFor, setPasswordFor] = useState<UserRow | null>(null);
  const resetPassword = (u: UserRow) => setPasswordFor(u);

  const statusPill = (u: UserRow) => (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[u.status].className}`}
      title={u.last_sign_in_at ? `Last sign-in: ${formatDateTime(u.last_sign_in_at)}` : undefined}
    >
      {STATUS[u.status].label}
    </span>
  );

  const roleSelect = (u: UserRow) => !isAdmin ? (
    <span className="text-sm text-gray-700">{u.role === 'admin' ? 'Admin' : 'User'}</span>
  ) : (
    <select
      value={u.role}
      disabled={u.id === me?.id}
      onChange={(e) => void update(u.id, { role: e.target.value }, 'Role changed')}
      className="min-h-11 sm:min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
      aria-label={`Role of ${u.email}`}
    >
      <option value="user">User</option>
      <option value="admin">Admin</option>
    </select>
  );

  const deactivated = (u: UserRow) => u.status === 'deactivated';

  const actions = (u: UserRow) => {
    const items: MenuAction[] = [{ label: isAdmin ? 'Edit profile, apps and history' : 'Edit profile and history', icon: <SquarePen size={15} />, to: `/users/${u.id}` }];
    if (!isAdmin) return <ActionsMenu label={`Actions for ${u.email}`} actions={items} />;
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

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (users ?? []).filter((u) => {
    const text = [u.full_name, u.email, u.profile.jobTitle, u.profile.department].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });

  // "Create user accounts" only: the page is the form for a new account.
  if (!canList) return <Navigate to="/users/new" replace />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 mb-2 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={14} /> Home
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? 'Accounts of the Nutri Partners apps. Contact details, photo and apps are under Edit ("⋯"); everyone can also change their own details in My profile.'
              : 'Accounts of the Nutri Partners apps. Contact details, photo and manager are under Edit ("⋯"); roles, apps and passwords are changed by administrators.'}
          </p>
        </div>
        {canAdd && (
        <Link
          to="/users/new"
          className="inline-flex shrink-0 items-center justify-center gap-2 min-h-11 sm:min-h-10 rounded-lg bg-[#CC1F1F] px-4 py-2 text-sm font-medium text-white hover:bg-[#A01818] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] focus-visible:ring-offset-2"
        >
          <UserPlus size={16} /> Add user
        </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 items-start">
        {canList && (
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Users size={16} className="text-[#CC1F1F]" />
                Accounts {users ? `(${words.length ? `${shown.length} of ${users.length}` : users.length})` : ''}
              </h2>
              <div className="sm:w-72">
                <Input
                  id="users-search"
                  type="search"
                  placeholder="Search by name, e-mail, job…"
                  aria-label="Search accounts"
                  leftIcon={<Search size={16} />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            {/* Phones: one card per account. */}
            <ul className="md:hidden divide-y divide-gray-100">
              {shown.map((u) => (
                <li key={u.id} className="px-4 py-4 space-y-3">
                  <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <UserName user={u} />
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      {statusPill(u)}
                      <span>Last sign-in {formatDateTime(u.last_sign_in_at)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 -mr-2 -mt-1">{actions(u)}</div>
                  </div>
                  {roleSelect(u)}
                  <UserApps user={u} />
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
                  {shown.map((u) => (
                    <tr key={u.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3">
                        <UserName user={u} />
                        <div className="mt-1">{statusPill(u)}</div>
                      </td>
                      <td className="px-4 py-3">{roleSelect(u)}</td>
                      <td className="px-4 py-3 max-w-[260px]"><UserApps user={u} /></td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap" title={`Created ${formatDateTime(u.created_at)}`}>{formatDateTime(u.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-right">{actions(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {isAdmin && <OfficesCard />}
      </div>
      {passwordFor && <NewPasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} />}
    </div>
  );
}

/** Set a new password: the password is shown before and after it is set, with Copy, until the window is closed. */
function NewPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const toast = useToast();
  const [password] = useState(randomPassword);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      toast.error('Could not copy', 'Select the password and copy it yourself.');
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await api('/api/admin/users', { method: 'PATCH', body: { id: user.id, password } });
      setSaved(true);
    } catch (err) {
      toast.error('Could not set the password', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      title={saved ? `New password set for ${user.email}` : `Set a new password for ${user.email}?`}
      onClose={() => !saving && onClose()}
      footer={
        saved ? (
          <Button data-autofocus onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button data-autofocus onClick={() => void save()} isLoading={saving}>
              <KeyRound size={16} /> Set password
            </Button>
          </>
        )
      }
    >
      <p>
        {saved
          ? 'Pass it on to the user. It is not shown again after you close this window; the user can change it later.'
          : 'The current password stops working. Copy the new one and pass it on to the user.'}
      </p>
      <div className="mt-4 flex items-stretch gap-2">
        <input
          readOnly
          value={password}
          aria-label="New password"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 min-h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono text-base sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#CC1F1F]"
        />
        <Button variant="secondary" className="min-h-11" onClick={() => void copy()} aria-label="Copy password">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </Dialog>
  );
}
