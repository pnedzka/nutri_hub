import { Route, Routes } from 'react-router-dom';
import type { LeaveOverview } from '../../../shared/leaveApi';
import { Approvals } from './Approvals';
import { CalendarView } from './CalendarView';
import { Employees } from './Employees';
import { MyLeave } from './MyLeave';
import { ErrorNote, Loading } from './ui';
import { useApi } from './useApi';
import { ModuleTabs } from '../../components/ModuleTabs';
import { PageHeader } from '../../components/PageHeader';

export function LeavePage() {
  const { data, error, reload } = useApi<LeaveOverview>('/api/leave');
  const tabs = [
    { to: '/leave', label: 'My leave', show: true },
    { to: '/leave/approvals', label: 'Approvals', show: Boolean(data?.isApprover), count: data?.approvals.length },
    { to: '/leave/calendar', label: 'Calendar', show: true },
    { to: '/leave/employees', label: 'Employees', show: Boolean(data?.managesLeave) },
  ].filter((t) => t.show);

  return (
    <div className="space-y-6">
      <PageHeader title="Leave" />
      <ModuleTabs label="Leave" tabs={tabs} />
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
