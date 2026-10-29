// Which apps a person may use. The list lives in `profiles.apps` (shared Supabase of the Document neutralizer);
// administrators may use every app. Each app checks access itself; the hub only shows the tiles a person may use.
// News, Leave and Purchase Manager are modules of the hub itself (/news, /leave, /purchase); their API checks access
// with requireApp. "Create user accounts" is not an app but a permission kept in the same list: its holder opens
// User management to invite new people (see canCreateAccount).

export const APP_IDS = ['neutralizer', 'signatures', 'owner-lookup', 'commission', 'news', 'leave', 'purchase', 'intranet', 'create-users'] as const;
export type AppId = (typeof APP_IDS)[number];

export const APP_NAMES: Record<AppId, string> = {
  neutralizer: 'Document neutralizer',
  signatures: 'E-mail signature generator',
  'owner-lookup': 'HubSpot owner lookup',
  commission: 'Commission calculator',
  news: 'News',
  leave: 'Leave',
  purchase: 'Purchase Manager',
  intranet: 'Intranet',
  'create-users': 'Create user accounts',
};

/**
 * The apps a new account gets ticked by default: all except Purchase Manager, which only the purchase team uses
 * (supplier offers and purchase prices), and the permission to create accounts.
 */
export const DEFAULT_APPS: readonly AppId[] = APP_IDS.filter((id) => id !== 'purchase' && id !== 'create-users');

export type Role = 'admin' | 'user';

export const isAppId = (value: unknown): value is AppId => typeof value === 'string' && (APP_IDS as readonly string[]).includes(value);

/** Known app ids only, without duplicates, in the order of APP_IDS. */
export function toApps(value: unknown): AppId[] {
  const given = new Set(Array.isArray(value) ? value.filter(isAppId) : []);
  return APP_IDS.filter((id) => given.has(id));
}

/**
 * Hub modules still in development (decision of 20.10.2026; Phone calls analyser from 22.10.2026, Purchase Manager
 * from 28.10.2026): they work only
 * where VITE_HUB_MODULES lists them (Preview: "news,leave,calls"). On production the variable is not set, so their tiles, pages and choices in User
 * management are hidden and their API answers 404. Releasing a module: add it to VITE_HUB_MODULES in Production,
 * or remove it from this list.
 */
export const DEV_MODULES: readonly ModuleId[] = ['news', 'leave', 'calls'];

/** An app, or a tool of the hub that is not an app in profiles.apps (Phone calls analyser, administrators only). */
export type ModuleId = AppId | 'calls';

/** Whether an app is switched on; `enabledModules` is the value of VITE_HUB_MODULES (module ids, comma-separated). */
export function isAvailable(app: ModuleId, enabledModules: string | undefined): boolean {
  if (!DEV_MODULES.includes(app)) return true;
  return (enabledModules ?? '').split(',').map((id) => id.trim()).includes(app);
}

export function canUse(person: { role: Role; apps: readonly string[] }, app: AppId): boolean {
  return person.role === 'admin' || person.apps.includes(app);
}

/** The apps a person may give a new account: administrators any, others only the ones they have themselves. */
export function grantableApps(person: { role: Role; apps: readonly string[] }): AppId[] {
  return APP_IDS.filter((id) => canUse(person, id));
}

/**
 * Why a person may not create this account, or null when they may. Administrators create any account; a person
 * with "Create user accounts" only sends invitations (no start password they would know) to users (not
 * administrators) with apps they have themselves, so nobody gets more access through an account they set up.
 */
export function newAccountProblem(
  creator: { role: Role; apps: readonly string[] },
  account: { role: Role; apps: readonly AppId[]; invite: boolean },
): string | null {
  if (creator.role === 'admin') return null;
  if (!creator.apps.includes('create-users')) return 'Only administrators and people allowed to create user accounts can do this.';
  if (account.role === 'admin') return 'Only administrators can create administrator accounts.';
  if (!account.invite) return 'New accounts get an e-mail invitation; only administrators can set a start password.';
  const extra = account.apps.filter((id) => !creator.apps.includes(id));
  if (extra.length) return `You can only give apps you have yourself (not: ${extra.map((id) => APP_NAMES[id]).join(', ')}).`;
  return null;
}
