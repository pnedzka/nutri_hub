import { sectionsFor } from '../apps';
import { AppCard } from '../components/AppCard';
import { useAuth } from '../lib/auth';
import { firstName } from '../lib/user';

const sectionId = (title: string) => `section-${title.toLowerCase().replace(/\s+/g, '-')}`;

export function HomePage() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  const name = firstName(user);
  const sections = sectionsFor(user);
  return (
    <div className="space-y-8 sm:space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{name ? `Hello, ${name}` : 'Hello'}</h1>
        <p className="text-sm text-gray-500 mt-1">Choose an app to get started.</p>
      </div>
      {sections.length === 0 && (
        <p className="rounded-xl border border-gray-100 bg-white px-5 py-4 text-sm text-gray-600 shadow-sm">
          You don't have access to any apps yet. Ask your administrator to give you access.
        </p>
      )}
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={sectionId(section.title)}>
          <h2 id={sectionId(section.title)} className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {section.title}
          </h2>
          <ul className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.apps.map((app) => (
              <li key={app.id}>
                <AppCard app={app} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
