import type { ComponentType, ReactNode } from 'react';
import { LogOut } from 'lucide-react';

// The top bar of every Nutri Partners app: the same file in each repository (nutri_hub, nutri_documentation,
// nutri_signatures, nutripartners and every new app). The source is nutri_hub src/components/AppHeader.tsx: change it
// there and copy it to the other apps unchanged; app-specific things go in the props.
//
// Logo to the hub, the app's name, the signed-in person (photo or initials, name, Admin/User) to My profile in the
// hub, and Sign out. An app with sections of its own gives them as `nav`, a second row under the bar.

export interface HeaderUser {
  name: string | null;
  email: string;
  role: 'admin' | 'user';
  /** A photo, where the app has one (the hub); otherwise the initials show. */
  avatarUrl?: string | null;
}

/** A link: a plain <a> by default; the hub passes its router's Link, so the page does not reload. */
export type HeaderLink = ComponentType<{ href: string; className?: string; title?: string; children: ReactNode }>;

const PlainLink: HeaderLink = ({ href, ...props }) => <a href={href} {...props} />;

const TEXT = {
  en: { apps: 'All apps', profile: 'My profile', signOut: 'Sign out', admin: 'Admin', user: 'User' },
  pl: { apps: 'Wszystkie aplikacje', profile: 'Mój profil', signOut: 'Wyloguj', admin: 'Admin', user: 'Użytkownik' },
} as const;

/** First and last word of the name, or the first letter of the e-mail (as in the hub). */
function initials(name: string | null, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  return (email[0] ?? '?').toUpperCase();
}

function Person({ user }: { user: HeaderUser }) {
  const className = 'h-8 w-8 text-xs shrink-0 rounded-full';
  if (user.avatarUrl) return <img src={user.avatarUrl} alt="" className={`${className} object-cover bg-gray-100`} />;
  return (
    <span className={`${className} inline-flex items-center justify-center bg-[#CC1F1F]/10 font-semibold text-[#CC1F1F]`} aria-hidden="true">
      {initials(user.name, user.email)}
    </span>
  );
}

export function RoleBadge({ role, lang = 'en' }: { role: HeaderUser['role']; lang?: keyof typeof TEXT }) {
  return role === 'admin' ? (
    <span className="shrink-0 rounded-full bg-[#CC1F1F]/10 px-2 py-0.5 text-xs font-semibold text-[#CC1F1F]">{TEXT[lang].admin}</span>
  ) : (
    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{TEXT[lang].user}</span>
  );
}

export function AppHeader({
  appName,
  hubUrl,
  user,
  onSignOut,
  lang = 'en',
  logoSrc = '/logo.png',
  nav,
  Link = PlainLink,
}: {
  /** Shown next to the logo, e.g. "HubSpot owner lookup" ("Apps" in the hub). */
  appName: string;
  /** The hub's address without a trailing slash; "" in the hub itself. */
  hubUrl: string;
  user: HeaderUser | null;
  onSignOut: () => void;
  lang?: keyof typeof TEXT;
  logoSrc?: string;
  /** The app's own sections (tabs), shown as a second row. */
  nav?: ReactNode;
  Link?: HeaderLink;
}) {
  const t = TEXT[lang];
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`${hubUrl}/`} className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]" title={t.apps}>
            <img src={logoSrc} alt="Nutri Partners" width={150} height={29} className="w-[130px] h-auto sm:w-[150px]" />
          </Link>
          <span className="hidden md:block h-5 w-px bg-gray-200" aria-hidden="true" />
          <span className="hidden md:block text-sm font-medium text-gray-500 truncate">{appName}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`${hubUrl}/profile`}
            className="inline-flex items-center gap-2 min-w-0 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 px-1 sm:px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]"
            title={user ? `${t.profile} (${user.email})` : t.profile}
          >
            {user && <Person user={user} />}
            <span className="hidden sm:inline max-w-[200px] truncate">{user?.name || user?.email}</span>
            {user && <RoleBadge role={user.role} lang={lang} />}
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center justify-center gap-2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11 px-3 py-1.5 -mr-2 sm:mr-0 rounded-lg text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]"
            aria-label={t.signOut}
            title={user ? `${t.signOut} (${user.email})` : t.signOut}
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{t.signOut}</span>
          </button>
        </div>
      </div>
      {nav && <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-3">{nav}</div>}
    </header>
  );
}
