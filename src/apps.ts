import { Building2, FileText, PenLine, UserSearch, Users, type LucideIcon } from 'lucide-react';
import { canUse, type AppId } from '../shared/access.ts';
import type { AppUser } from './lib/user';

export interface AppTile {
  id: AppId | 'users';
  name: string;
  description: string;
  /** An address, or a path inside the hub (starts with "/"). */
  url: string;
  icon: LucideIcon;
  /**
   * 'app': shown to people who may use the app (`profiles.apps`; administrators see all).
   * 'admin': administrators only. Hiding a tile is only a convenience: each app checks access itself.
   */
  audience: 'app' | 'admin';
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

/** Every app of the hub. A new app is one entry here and one id in shared/access.ts (see README). */
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
export function sectionsFor(user: Pick<AppUser, 'role' | 'apps'>, apps: AppTile[] = APPS): AppSection[] {
  const sections: AppSection[] = [
    { title: 'Your apps', apps: apps.filter((a) => a.audience === 'app' && a.id !== 'users' && canUse(user, a.id)) },
  ];
  if (user.role === 'admin') sections.push({ title: 'Administration', apps: apps.filter((a) => a.audience === 'admin') });
  return sections.filter((s) => s.apps.length > 0);
}
