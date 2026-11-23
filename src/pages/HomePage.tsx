import { canSeeWidget } from '../../shared/dashboard';
import { available, sectionsFor } from '../apps';
import { AppCard } from '../components/AppCard';
import { LatestNews } from '../components/LatestNews';
import { useAuth } from '../lib/auth';
import { useMyProfile } from '../lib/people';
import { firstName } from '../lib/user';
import { ContestWidget } from './home/ContestWidget';
import { ContractsWidget } from './home/ContractsWidget';
import { LeaderboardWidget } from './home/LeaderboardWidget';

/**
 * The home page: a dashboard of widgets (decision of 23.11.2026; the apps are in the side menu). Each person sees the
 * widgets of their role, department and apps (canSeeWidget, shared/dashboard.ts); the server checks again. Someone
 * with no widget gets the app tiles instead, so the page is never empty.
 */
export function HomePage() {
  const user = useAuth((s) => s.user);
  const profile = useMyProfile();
  if (!user) return null;
  const name = firstName(user);
  const viewer = { role: user.role, apps: user.apps, department: profile?.department ?? null };
  const contracts = canSeeWidget(viewer, 'contracts');
  const leaderboard = canSeeWidget(viewer, 'leaderboard');
  const news = canSeeWidget(viewer, 'news', available('news'));
  const anyWidget = contracts || leaderboard || news;
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{name ? `Hello, ${name}` : 'Hello'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {anyWidget ? 'Here is what is going on. Your apps are in the menu.' : 'Choose an app to get started.'}
        </p>
      </div>
      <ContestWidget />
      {(contracts || leaderboard) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {contracts && <ContractsWidget className={leaderboard ? 'lg:col-span-2' : 'lg:col-span-3'} />}
          {leaderboard && <LeaderboardWidget className={contracts ? '' : 'lg:col-span-2'} />}
        </div>
      )}
      {news && <LatestNews />}
      {!anyWidget && <AppTiles />}
    </div>
  );
}

const sectionId = (title: string) => `section-${title.toLowerCase().replace(/\s+/g, '-')}`;

/** The tiles, for people without widgets (the same apps as in the menu). */
function AppTiles() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  const sections = sectionsFor(user);
  if (sections.length === 0) {
    return (
      <p className="rounded-xl border border-gray-100 bg-white px-5 py-4 text-sm text-gray-600 shadow-sm">
        You don't have access to any apps yet. Ask your administrator to give you access.
      </p>
    );
  }
  return (
    <>
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={sectionId(section.title)}>
          <h2 id={sectionId(section.title)} className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {section.title}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {section.apps.map((app) => (
              <li key={app.id}>
                <AppCard app={app} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
