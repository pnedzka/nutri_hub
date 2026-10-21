import { useEffect, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMyProfile, usePeople } from '../lib/people';
import { Avatar } from './Avatar';
import { RoleBadge } from './RoleBadge';

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const load = usePeople((s) => s.load);
  const profile = useMyProfile();
  // The photo in the header comes from Team (signed link); without it the initials show.
  useEffect(() => void load(), [load]);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1400px] mx-auto safe-x sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]" title="All apps">
              <img src="/logo.png" alt="Nutri Partners apps" width={150} height={29} className="w-[130px] h-auto sm:w-[150px]" />
            </Link>
            <span className="hidden md:block h-5 w-px bg-gray-200" aria-hidden="true" />
            <span className="hidden md:block text-sm font-medium text-gray-500 truncate">Apps</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/profile"
              className="inline-flex items-center gap-2 min-w-0 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 px-1 sm:px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              title={`My profile (${user?.email ?? ''})`}
            >
              {user && <Avatar name={user.name} email={user.email} url={profile?.avatarUrl ?? null} size="sm" />}
              <span className="hidden sm:inline max-w-[200px] truncate">{user?.name || user?.email}</span>
              {user && <RoleBadge role={user.role} />}
            </Link>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center justify-center gap-2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11 px-3 py-1.5 -mr-2 sm:mr-0 rounded-lg text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-100"
              aria-label="Sign out"
              title={user?.email ? `Sign out (${user.email})` : 'Sign out'}
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto safe-x sm:px-6 py-6 sm:py-12 safe-bottom">{children}</main>
    </div>
  );
}
