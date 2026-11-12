import type { ReactNode } from 'react';
import type { HeaderLink } from './AppHeader';

// The bottom bar of every Nutri Partners app: the same file in each repository, like AppHeader.tsx (the source is
// nutri_hub src/components/Footer.tsx). Who makes the app, the way back to the apps and to My profile, and the
// version: the short commit, and outside production a Dev badge, so screenshots and bug reports say which build.

const PlainLink: HeaderLink = ({ href, ...props }) => <a href={href} {...props} />;

const TEXT = {
  en: { apps: 'All apps', profile: 'My profile', version: 'Version', local: 'Local', label: 'Footer' },
  pl: { apps: 'Wszystkie aplikacje', profile: 'Mój profil', version: 'Wersja', local: 'Lokalnie', label: 'Stopka' },
} as const;

const footerLink =
  'inline-flex items-center min-h-11 sm:min-h-0 pointer-coarse:min-h-11 px-2 -mx-2 sm:mx-0 sm:px-0 rounded hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]';

/** Vercel sets these at build time (system environment variables, exposed to Vite with the VITE_ prefix). */
const COMMIT = (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined)?.slice(0, 7) || 'local';
const ENVIRONMENT = (import.meta.env.VITE_VERCEL_ENV as string | undefined) || 'development';

/** Quiet on purpose (small grey text), so it never competes with the content. Signed out, it shows no links. */
export function Footer({
  appName,
  hubUrl,
  lang = 'en',
  links = true,
  Link = PlainLink,
}: {
  appName: string;
  /** The hub's address without a trailing slash; "" in the hub itself. */
  hubUrl: string;
  lang?: keyof typeof TEXT;
  links?: boolean;
  Link?: HeaderLink;
}) {
  const t = TEXT[lang];
  const nav: ReactNode = links && (
    <>
      <Link href={`${hubUrl}/`} className={footerLink}>
        {t.apps}
      </Link>
      <Link href={`${hubUrl}/profile`} className={footerLink}>
        {t.profile}
      </Link>
    </>
  );
  return (
    <footer className="mt-auto bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 text-xs text-gray-500">
        <p className="text-center sm:text-left">
          © {new Date().getFullYear()} Nutri Partners <span className="text-gray-300">·</span> {appName}
        </p>
        <nav aria-label={t.label} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {nav}
          <span className="inline-flex items-center gap-1.5 text-gray-400" title={`${t.version} ${COMMIT} (${ENVIRONMENT})`}>
            {ENVIRONMENT !== 'production' && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-px text-[11px] font-medium text-amber-800">
                {ENVIRONMENT === 'preview' ? 'Dev' : t.local}
              </span>
            )}
            {t.version} {COMMIT}
          </span>
        </nav>
      </div>
    </footer>
  );
}
