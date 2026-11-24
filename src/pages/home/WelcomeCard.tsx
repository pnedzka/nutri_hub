import { useState } from 'react';
import { pickQuote } from '../../../shared/quotes';
import { Avatar } from '../../components/Avatar';

/**
 * The top of the home page: the person's photo, "Welcome, Paweł!" and a business quote, a new one at every visit
 * (as in the old intranet, in the hub's look).
 */
export function WelcomeCard({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const [quote] = useState(() => pickQuote());
  return (
    <section
      aria-label="Welcome"
      className="overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-[#CC1F1F]/[0.06] via-white to-white shadow-sm"
    >
      <div className="flex flex-col items-center gap-4 px-5 py-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:text-left">
        <div className="shrink-0 rounded-full bg-white p-1 shadow-sm">
          <Avatar name={name} email={email} url={avatarUrl} size="lg" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            {name ? `Welcome, ${name}!` : 'Welcome!'} <span aria-hidden="true">👋</span>
          </h1>
          <blockquote className="mt-2 border-gray-200 text-sm italic text-gray-600 sm:border-l-2 sm:pl-3 sm:text-base">“{quote}”</blockquote>
        </div>
      </div>
    </section>
  );
}
