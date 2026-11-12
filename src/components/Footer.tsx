import { Link } from 'react-router-dom';

// The same bottom bar as in the other Nutri Partners apps (whoisowner src/components/Layout.tsx): who makes the app,
// the way back to the apps and to My profile, and the version.

const footerLink =
  'inline-flex items-center min-h-11 sm:min-h-0 pointer-coarse:min-h-11 px-2 -mx-2 sm:mx-0 sm:px-0 rounded hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]';

/** The build on screen: commit (to quote when reporting a problem) and, outside production, which environment. */
const COMMIT = (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined)?.slice(0, 7) || 'local';
const ENVIRONMENT = (import.meta.env.VITE_VERCEL_ENV as string | undefined) || 'development';

/**
 * The bottom bar of every page. Quiet on purpose (small grey text), so it never competes with the content. Signed out
 * (sign-in, setting a password) it shows no links, only who makes the app and the version.
 */
export function Footer({ links = true }: { links?: boolean }) {
  return (
    <footer className="mt-auto bg-white border-t border-gray-100 safe-bottom">
      <div className="max-w-[1400px] mx-auto safe-x sm:px-6 py-4 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 text-xs text-gray-500">
        <p className="text-center sm:text-left">
          © {new Date().getFullYear()} Nutri Partners <span className="text-gray-300">·</span> Apps
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {links && (
            <>
              <Link to="/" className={footerLink}>
                All apps
              </Link>
              <Link to="/profile" className={footerLink}>
                My profile
              </Link>
            </>
          )}
          <span className="inline-flex items-center gap-1.5 text-gray-400" title={`Version ${COMMIT} (${ENVIRONMENT})`}>
            {ENVIRONMENT !== 'production' && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-px text-[11px] font-medium text-amber-800">
                {ENVIRONMENT === 'preview' ? 'Dev' : 'Local'}
              </span>
            )}
            Version {COMMIT}
          </span>
        </nav>
      </div>
    </footer>
  );
}
