import { ChevronRight, ExternalLink } from 'lucide-react';
import type { AppTile } from '../apps';

/** One tile: the whole card is the link. Our apps open in the same tab, the intranet in a new one. */
export function AppCard({ app }: { app: AppTile }) {
  const Icon = app.icon;
  return (
    <a
      href={app.url}
      {...(app.newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="group flex items-start gap-4 h-full min-h-11 bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 transition-colors hover:border-[#CC1F1F]/40 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] focus-visible:ring-offset-2"
    >
      <span className="shrink-0 h-11 w-11 rounded-lg bg-[#CC1F1F]/10 text-[#CC1F1F] flex items-center justify-center" aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-semibold text-gray-900 group-hover:text-[#CC1F1F]">{app.name}</span>
          {app.note && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">{app.note}</span>
          )}
        </span>
        <span className="mt-1 block text-sm text-gray-500">{app.description}</span>
      </span>
      <span className="shrink-0 self-center text-gray-300 group-hover:text-[#CC1F1F]" aria-hidden="true">
        {app.newTab ? <ExternalLink size={16} /> : <ChevronRight size={18} />}
      </span>
      {app.newTab && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  );
}
