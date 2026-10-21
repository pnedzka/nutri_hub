import { Building2, CalendarDays, FileText, Newspaper, PenLine, UserSearch, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { canUse, isAvailable, type AppId } from '../shared/access.ts';
import type { AppUser } from './lib/user';

export interface AppTile {
  id: AppId | 'users' | 'team';
  name: string;
  description: string;
  /** An address, or a path inside the hub (starts with "/"). */
  url: string;
  icon: LucideIcon;
  /**
   * 'app': shown to people who may use the app (`profiles.apps`; administrators see all).
   * 'everyone': every signed-in person (Team).
   * 'admin': administrators only. Hiding a tile is only a convenience: each app checks access itself.
   */
  audience: 'app' | 'everyone' | 'admin';
  /**
   * Opens in a new tab: apps outside our user base (the intranet). Our own apps open in the same tab and link back
   * to the hub from their header.
   */
  newTab?: boolean;
  /** A short label on the tile, e.g. "Separate sign-in". */
  note?: string;
}

// Production addresses by default. Preview deployments (the develop branch and pull requests) point the tiles at the
// apps' develop deployments with VITE_NEUTRALIZER_URL, VITE_SIGNATURES_URL and VITE_OWNER_LOOKUP_URL.
const env = import.meta.env;
const address = (value: string | undefined, fallback: string) => (value || fallback).replace(/\/+$/, '');

export const OWNER_LOOKUP_URL = address(env.VITE_OWNER_LOOKUP_URL, 'https://whoisowner.vercel.app');
export const NEUTRALIZER_URL = address(env.VITE_NEUTRALIZER_URL, 'https://nutridocumentation-nxdi.vercel.app');
export const SIGNATURES_URL = address(env.VITE_SIGNATURES_URL, 'https://nutri-signatures.vercel.app');

/** Whether an app is switched on here: News and Leave only where VITE_HUB_MODULES lists them (shared/access.ts). */
export const available = (id: AppId, enabledModules: string | undefined = env.VITE_HUB_MODULES) => isAvailable(id, enabledModules);

/**
 * Every app of the hub. A new app is one entry here and one id in shared/access.ts (see README). News and Leave are
 * modules of the hub itself (paths), the others separate apps reached through one sign-in.
 */
export const APPS: AppTile[] = [
  {
    id: 'neutralizer',
    name: 'Document neutralizer',
    description: 'Remove client details from documents before you share them.',
    url: NEUTRALIZER_URL,
    icon: FileText,
    audience: 'app',
  },
  {
    id: 'signatures',
    name: 'E-mail signature generator',
    description: 'Create your Nutri Partners e-mail signature.',
    url: SIGNATURES_URL,
    icon: PenLine,
    audience: 'app',
  },
  {
    id: 'owner-lookup',
    name: 'HubSpot owner lookup',
    description: 'Find out who owns a company or contact in HubSpot.',
    url: OWNER_LOOKUP_URL,
    icon: UserSearch,
    audience: 'app',
  },
  {
    id: 'news',
    name: 'News',
    description: 'Company events and welcomes, with photos, comments and likes.',
    url: '/news',
    icon: Newspaper,
    audience: 'app',
  },
  {
    id: 'leave',
    name: 'Leave',
    description: "Leave requests, your balance and the team's absence calendar.",
    url: '/leave',
    icon: CalendarDays,
    audience: 'app',
  },
  {
    id: 'team',
    name: 'Team',
    description: 'Contact details of your colleagues: phones, e-mails and offices.',
    url: '/team',
    icon: UsersRound,
    audience: 'everyone',
  },
  {
    id: 'intranet',
    name: 'Intranet',
    description: 'The company intranet.',
    url: 'https://intranet.nutripartners.co',
    icon: Building2,
    audience: 'app',
    newTab: true,
    note: 'Separate sign-in',
  },
  {
    id: 'users',
    name: 'User management',
    description: 'Invite people, choose their apps, reset passwords and assign roles.',
    url: '/users',
    icon: Users,
    audience: 'admin',
  },
];

export interface AppSection {
  title: string;
  apps: AppTile[];
}

/** The tiles a person sees, in sections; admins also get "Administration". Empty sections are left out. */
export function sectionsFor(
  user: Pick<AppUser, 'role' | 'apps'>,
  apps: AppTile[] = APPS,
  enabledModules: string | undefined = env.VITE_HUB_MODULES,
): AppSection[] {
  const sections: AppSection[] = [
    {
      title: 'Your apps',
      apps: apps.filter(
        (a) => a.audience === 'everyone' || (a.audience === 'app' && a.id !== 'users' && a.id !== 'team' && available(a.id, enabledModules) && canUse(user, a.id)),
      ),
    },
  ];
  if (user.role === 'admin') sections.push({ title: 'Administration', apps: apps.filter((a) => a.audience === 'admin') });
  return sections.filter((s) => s.apps.length > 0);
}
