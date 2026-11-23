import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { monthLabel, shiftMonth } from '../../../shared/dashboard';

/** One widget of the home page: a white card with a title row; the content decides the rest. */
export function Widget({ id, title, icon: Icon, action, className = '', children }: {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Right side of the title row, e.g. the month switch. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`widget-${id}`} className={`flex flex-col rounded-xl border border-gray-100 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-5">
        <h2 id={`widget-${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Icon size={16} className="text-[#CC1F1F]" aria-hidden="true" />
          {title}
        </h2>
        {action}
      </div>
      <div className="flex-1 px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

const ARROW =
  'inline-flex h-11 w-11 sm:h-8 sm:w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]';

/** ‹ November 2026 › — no months in the future. */
export function MonthSwitch({ month, current, onChange }: { month: string; current: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={ARROW} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-gray-700" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button type="button" className={ARROW} onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= current} aria-label="Next month">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** Loading, error and empty states shared by the widgets. */
export function WidgetState({ kind, children }: { kind: 'loading' | 'error' | 'empty'; children?: ReactNode }) {
  if (kind === 'loading') {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-500">
        <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" aria-hidden="true" />
        Loading…
      </div>
    );
  }
  return <p className={`py-6 text-center text-sm ${kind === 'error' ? 'text-red-700' : 'text-gray-500'}`}>{children}</p>;
}
