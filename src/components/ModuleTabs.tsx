import { NavLink } from 'react-router-dom';
import { ScrollRow } from './ScrollRow';

export interface ModuleTab {
  to: string;
  label: string;
  count?: number;
}

/** The tabs under a module's heading (Leave, Contracts, Complaints, Purchase Manager). */
export function ModuleTabs({ label, tabs }: { label: string; tabs: ModuleTab[] }) {
  return (
    <nav className="-mx-4 sm:mx-0 border-b border-gray-200" aria-label={label}>
      <ScrollRow>
        <div className="flex gap-1 px-4 sm:px-0">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                `inline-flex items-center gap-2 whitespace-nowrap min-h-11 px-3 border-b-2 -mb-px text-sm font-medium ${
                  isActive ? 'border-[#CC1F1F] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`
              }
            >
              {tab.label}
              {Boolean(tab.count) && <span className="rounded-full bg-[#CC1F1F] px-1.5 py-0.5 text-xs leading-none text-white">{tab.count}</span>}
            </NavLink>
          ))}
        </div>
      </ScrollRow>
    </nav>
  );
}
