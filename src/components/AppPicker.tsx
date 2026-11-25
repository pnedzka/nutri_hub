import { APP_IDS, APP_NAMES, type AppId } from '../../shared/access.ts';
import { APPS, available } from '../apps';

// The checkboxes of the apps a person may use: in the form for a new account (User management → Add user) and on
// the account's Edit page. Apps come first, each with the description of its tile; the permissions that are not
// apps follow. The own permissions of the contract generator and of Leave sit under the module and need it.

/** Permissions of an app, shown indented under it; unticking the app unticks them. */
const SUB: Partial<Record<AppId, AppId[]>> = { leave: ['leave-admin'], contracts: ['contracts-admin', 'contracts-sign'] };
const PARENT: Partial<Record<AppId, AppId>> = Object.fromEntries(
  Object.entries(SUB).flatMap(([parent, subs]) => (subs ?? []).map((sub) => [sub, parent])),
);

const DESCRIPTIONS: Partial<Record<AppId, string>> = {
  ...Object.fromEntries(APPS.map((a) => [a.id, a.description])),
  intranet: 'The old intranet: only its tile, it has its own sign-in.',
  'leave-admin': "Manages everyone's leave like an administrator: approves all requests, enters leave and sick leave for others, sets days of leave.",
  'contracts-admin': 'Accepts contracts after entering the order in enova; sees all contracts.',
  'contracts-sign': 'Signs contracts; board members sign those above 100 000 EUR.',
  'create-users': 'Invites new people, with apps they have themselves.',
};

/** Not apps: what a person may do in the hub. */
const PERMISSIONS: AppId[] = ['create-users'];

function Row({ id, checked, disabled, onToggle, nested }: { id: AppId; checked: boolean; disabled: boolean; onToggle: (on: boolean) => void; nested?: boolean }) {
  return (
    <label
      className={`flex items-start gap-3 px-4 py-3 min-h-11 ${nested ? 'pl-11 bg-gray-50/60' : ''} ${
        disabled ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50'
      }`}
    >
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#CC1F1F]" checked={checked} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${disabled && !checked ? 'text-gray-400' : 'text-gray-900'}`}>{APP_NAMES[id]}</span>
        {DESCRIPTIONS[id] && <span className="block text-xs text-gray-500">{DESCRIPTIONS[id]}</span>}
      </span>
    </label>
  );
}

/**
 * Checkboxes for the apps a person may use. Administrators may use every app, so the list is then a note instead.
 * `options` limits the list (someone who is not an administrator gives only their own apps).
 */
export function AppPicker({
  value,
  onChange,
  admin,
  disabled,
  options = APP_IDS,
}: {
  value: AppId[];
  onChange: (apps: AppId[]) => void;
  admin: boolean;
  disabled?: boolean;
  options?: readonly AppId[];
}) {
  if (admin) {
    return <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">Administrators can use every app and manage users.</p>;
  }
  const shown = options.filter((id) => available(id));
  const toggle = (id: AppId, on: boolean) => {
    const off = new Set(on ? [] : [id, ...(SUB[id] ?? [])]);
    onChange(APP_IDS.filter((a) => (a === id ? on : value.includes(a) && !off.has(a))));
  };
  const row = (id: AppId, nested = false) => {
    const parent = PARENT[id];
    const needsParent = parent !== undefined && !value.includes(parent);
    return (
      <li key={id}>
        <Row id={id} nested={nested} checked={value.includes(id)} disabled={Boolean(disabled) || needsParent} onToggle={(on) => toggle(id, on)} />
      </li>
    );
  };
  const apps = shown.filter((id) => !PARENT[id] && !PERMISSIONS.includes(id));
  const permissions = shown.filter((id) => PERMISSIONS.includes(id));
  const chosen = shown.filter((id) => value.includes(id)).length;
  const group = (title: string, ids: AppId[]) =>
    ids.length > 0 && (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
          {ids.flatMap((id) => [row(id), ...(SUB[id] ?? []).filter((sub) => shown.includes(sub)).map((sub) => row(sub, true))])}
        </ul>
      </div>
    );
  return (
    <fieldset className="space-y-5" disabled={disabled}>
      <legend className="sr-only">Apps and permissions</legend>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          {chosen} of {shown.length} selected
        </span>
        <span className="flex gap-3">
          <button type="button" className="font-medium text-[#CC1F1F] hover:underline" onClick={() => onChange(APP_IDS.filter((id) => shown.includes(id) || value.includes(id)))}>
            Select all
          </button>
          <button type="button" className="font-medium text-gray-600 hover:underline" onClick={() => onChange(value.filter((id) => !shown.includes(id)))}>
            Clear
          </button>
        </span>
      </div>
      {group('Apps', apps)}
      {group('Permissions', permissions)}
    </fieldset>
  );
}
