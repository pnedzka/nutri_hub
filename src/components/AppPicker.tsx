import { APP_IDS, APP_NAMES, type AppId } from '../../shared/access.ts';
import { available } from '../apps';

// The checkboxes of the apps a person may use: in the form for a new account (User management) and on the account's
// Edit page, where administrators change them.

const APP_NOTES: Partial<Record<AppId, string>> = {
  intranet: '(tile only, separate sign-in)',
  'create-users': '(invites new people, with apps they have themselves)',
  'contracts-admin': '(Contract generator: accepts contracts after entering the order in enova, sees all contracts)',
  'contracts-sign': '(Contract generator: signs contracts; board members sign those above 100 000 EUR)',
};

/**
 * Checkboxes for the apps a person may use. Administrators may use every app, so the list is then fixed. `options`
 * limits the list (someone who is not an administrator gives only their own apps).
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
  const toggle = (id: AppId, on: boolean) => onChange(APP_IDS.filter((a) => (a === id ? on : value.includes(a))));
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Apps</legend>
      {options.filter((id) => available(id)).map((id) => (
        <label key={id} className="flex items-start gap-2 py-1 min-h-8 pointer-coarse:min-h-11 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5" checked={admin || value.includes(id)} disabled={admin} onChange={(e) => toggle(id, e.target.checked)} />
          <span>
            {APP_NAMES[id]}
            {APP_NOTES[id] && <span className="ml-1 text-xs text-gray-400">{APP_NOTES[id]}</span>}
          </span>
        </label>
      ))}
      {admin && <p className="text-xs text-gray-500">Administrators can use every app.</p>}
    </fieldset>
  );
}
