import { ArrowLeft } from 'lucide-react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import type { LeaveOverview } from '../../../shared/leaveApi';
import { Approvals } from './Approvals';
import { CalendarView } from './CalendarView';
import { Employees } from './Employees';
import { MyLeave } from './MyLeave';
import { ErrorNote, Loading } from './ui';
import { useApi } from './useApi';

export function LeavePage() {
  const { data, error, reload } = useApi<LeaveOverview>('/api/leave');
  const tabs = [
    { to: '/leave', label: 'My leave', show: true },
    { to: '/leave/approvals', label: 'Approvals', show: Boolean(data?.isApprover), count: data?.approvals.length },
    { to: '/leave/calendar', label: 'Calendar', show: true },
    { to: '/leave/employees', label: 'Employees', show: Boolean(data?.isAdmin) },
  ].filter((t) => t.show);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} />
          All apps
        </Link>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">Leave</h1>
      </div>
      <nav className="-mx-4 sm:mx-0 overflow-x-auto border-b border-gray-200" aria-label="Leave">
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
      </nav>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Routes>
        <Route index element={data ? <MyLeave overview={data} reload={reload} /> : !error && <Loading />} />
        <Route path="approvals" element={data ? <Approvals overview={data} reload={reload} /> : !error && <Loading />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="employees" element={<Employees onChange={reload} />} />
      </Routes>
    </div>
  );
}
