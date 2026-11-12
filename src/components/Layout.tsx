import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMyProfile, usePeople } from '../lib/people';
import { AppHeader, type HeaderLink } from './AppHeader';
import { Footer } from './Footer';

/** Links inside the hub go through the router, so the page does not reload. */
const HubLink: HeaderLink = ({ href, ...props }) => <Link to={href} {...props} />;

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const load = usePeople((s) => s.load);
  const profile = useMyProfile();
  // The photo in the header comes from Team (signed link); without it the initials show.
  useEffect(() => void load(), [load]);
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        appName="Apps"
        hubUrl=""
        user={user && { name: user.name, email: user.email, role: user.role, avatarUrl: profile?.avatarUrl ?? null }}
        onSignOut={() => void signOut()}
        Link={HubLink}
      />
      <main className="flex-1 w-full max-w-6xl mx-auto safe-x sm:px-6 py-6 sm:py-12">{children}</main>
      <Footer appName="Apps" hubUrl="" Link={HubLink} />
    </div>
  );
}
