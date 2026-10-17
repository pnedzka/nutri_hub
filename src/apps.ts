import { Building2, FileText, PenLine, UserSearch, Users, type LucideIcon } from 'lucide-react';
import { ACCOUNT_APP_URL } from './lib/supabase';
import type { Role } from './lib/user';

export interface AppTile {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: LucideIcon;
  /** Who sees the tile. Hiding a tile is only a convenience: each app checks access itself. */
  audience: 'everyone' | 'admin';
  /**
   * Opens in a new tab: apps outside our user base (the intranet). Our own apps open in the same tab and link back
   * to the hub from their header.
   */
  newTab?: boolean;
  /** A short label on the tile, e.g. "Separate sign-in". */
  note?: string;
}

export const OWNER_LOOKUP_URL = 'https://whoisowner.vercel.app';

/** Every app of the hub. A new app is one entry here (see README: „Dodawanie aplikacji”). */
export const APPS: AppTile[] = [
  {
    id: 'neutralizer',
    name: 'Document neutralizer',
    description: 'Remove client details from documents before you share them.',
    url: ACCOUNT_APP_URL,
    icon: FileText,
    audience: 'everyone',
  },
  {
    id: 'signatures',
    name: 'E-mail signature generator',
    description: 'Create your Nutri Partners e-mail signature.',
    url: 'https://nutri-signatures.vercel.app',
    icon: PenLine,
    audience: 'everyone',
  },
  {
    id: 'owner-lookup',
    name: 'HubSpot owner lookup',
    description: 'Find out who owns a company or contact in HubSpot.',
    url: OWNER_LOOKUP_URL,
    icon: UserSearch,
    audience: 'everyone',
  },
  {
    id: 'intranet',
    name: 'Intranet',
    description: 'The company intranet.',
    url: 'https://intranet.nutripartners.co',
    icon: Building2,
    audience: 'everyone',
    newTab: true,
    note: 'Separate sign-in',
  },
  {
    id: 'users',
    name: 'User management',
    description: 'Invite people, reset passwords and assign roles.',
    url: `${ACCOUNT_APP_URL}/admin/uzytkownicy`,
    icon: Users,
    audience: 'admin',
  },
];

export interface AppSection {
  title: string;
  apps: AppTile[];
}

/** The tiles a person sees, in sections; admins also get "Administration". Empty sections are left out. */
export function sectionsFor(role: Role, apps: AppTile[] = APPS): AppSection[] {
  const sections: AppSection[] = [{ title: 'Your apps', apps: apps.filter((a) => a.audience === 'everyone') }];
  if (role === 'admin') sections.push({ title: 'Administration', apps: apps.filter((a) => a.audience === 'admin') });
  return sections.filter((s) => s.apps.length > 0);
}
