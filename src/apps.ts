import { Building2, Calculator, CalendarDays, FileText, Newspaper, PenLine, PhoneCall, UserSearch, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { canUse, isAppId, isAvailable, type AppId, type ModuleId } from '../shared/access.ts';
import type { AppUser } from './lib/user';

export interface AppTile {
  /** 'users' and 'calls' are administrators' tools (not in profiles.apps), 'team' is for everyone. */
  id: AppId | 'users' | 'team' | 'calls';
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
// apps' develop deployments with VITE_NEUTRALIZER_URL, VITE_SIGNATURES_URL, VITE_OWNER_LOOKUP_URL and VITE_COMMISSION_URL.
const env = import.meta.env;
const address = (value: string | undefined, fallback: string) => (value || fallback).replace(/\/+$/, '');

export const OWNER_LOOKUP_URL = address(env.VITE_OWNER_LOOKUP_URL, 'https://whoisowner.vercel.app');
export const NEUTRALIZER_URL = address(env.VITE_NEUTRALIZER_URL, 'https://nutridocumentation-nxdi.vercel.app');
export const SIGNATURES_URL = address(env.VITE_SIGNATURES_URL, 'https://nutri-signatures.vercel.app');
// pnedzka/commission_analyzer: signs in through /sso like the other apps; its server checks the permission.
export const COMMISSION_URL = address(env.VITE_COMMISSION_URL, 'https://commissionanalyzer.vercel.app');

/** Whether an app is switched on here: News, Leave and Phone calls analyser only where VITE_HUB_MODULES lists them (shared/access.ts). */
export const available = (id: ModuleId, enabledModules: string | undefined = env.VITE_HUB_MODULES) => isAvailable(id, enabledModules);

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
    id: 'commission',
    name: 'Commission calculator',
    description: 'Compare your quarterly pay on the three International Commodity Trader levels.',
    url: COMMISSION_URL,
    icon: Calculator,
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
  {
    id: 'calls',
    name: 'Phone calls analyser',
    description: 'Import T-Mobile invoices and see who called how much, month by month.',
    url: '/calls',
    icon: PhoneCall,
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
        (a) => a.audience === 'everyone' || (a.audience === 'app' && isAppId(a.id) && available(a.id, enabledModules) && canUse(user, a.id)),
      ),
    },
  ];
  if (user.role === 'admin') {
    sections.push({ title: 'Administration', apps: apps.filter((a) => a.audience === 'admin' && (a.id !== 'calls' || available(a.id, enabledModules))) });
  }
  return sections.filter((s) => s.apps.length > 0);
}
