import type { ComponentType, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

// The top of every page (W1 of the UI audit, 26.11.2026): "← Home" (or another way back), the title in one style,
// an optional icon and the page's buttons on the right.

export function PageHeader({
  title,
  icon: Icon,
  back = { to: '/', label: 'Home' },
  actions,
  children,
}: {
  title: ReactNode;
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** null: no link back (the home page). */
  back?: { to: string; label: string } | null;
  actions?: ReactNode;
  /** A line under the title. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64">
        {back && (
          <Link to={back.to} className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={16} />
            {back.label}
          </Link>
        )}
        <h1 className={`${back ? 'mt-1' : ''} flex items-center gap-2 text-xl sm:text-2xl font-semibold text-gray-900 [overflow-wrap:anywhere]`}>
          {Icon && <Icon size={24} className="shrink-0 text-[#CC1F1F]" />}
          <span className="min-w-0">{title}</span>
        </h1>
        {children && <div className="mt-1 text-sm text-gray-500">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
