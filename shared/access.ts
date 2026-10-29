// Which apps a person may use. The list lives in `profiles.apps` (shared Supabase of the Document neutralizer);
// administrators may use every app. Each app checks access itself; the hub only shows the tiles a person may use.
// News, Leave and Purchase Manager are modules of the hub itself (/news, /leave, /purchase); their API checks access
// with requireApp.

export const APP_IDS = ['neutralizer', 'signatures', 'owner-lookup', 'commission', 'news', 'leave', 'purchase', 'intranet'] as const;
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
};

/**
 * The apps a new account gets ticked by default: all except Purchase Manager, which only the purchase team uses
 * (supplier offers and purchase prices).
 */
export const DEFAULT_APPS: readonly AppId[] = APP_IDS.filter((id) => id !== 'purchase');

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
