import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import type { ComplaintSetup } from '../../../shared/complaintsApi.ts';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';
import { COMPLAINTS_API, SetupContext } from './common';
import { ComplaintDetail } from './ComplaintDetail';
import { ComplaintForm } from './ComplaintForm';
import { ComplaintList } from './ComplaintList';
import { ModuleTabs } from '../../components/ModuleTabs';
import { PageHeader } from '../../components/PageHeader';
import { ErrorNote } from '../../components/States';

/**
 * Complaints: anyone with the permission registers a client's complaint from the sales contract number; the handler
 * works it through with the supplier and settles it. Administration (complaints-admin) sees and handles all.
 */
export function ComplaintsPage() {
  const [setup, setSetup] = useState<ComplaintSetup | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api<ComplaintSetup>(`${COMPLAINTS_API}&view=setup`)
      .then(setSetup)
      .catch((e: Error) => setError(e.message));
  }, []);

  const admin = Boolean(setup?.me.isComplaintAdmin);
  // Complaint handlers start on the open complaints (S10 of the UI audit, 26.11.2026), everyone else on their own.
  const tabs = [
    ...(admin ? [{ to: '/complaints', label: 'Open' }] : []),
    { to: admin ? '/complaints/mine' : '/complaints', label: 'My complaints' },
    ...(admin ? [{ to: '/complaints/all', label: 'All complaints' }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints"
        actions={
          setup && (
            <Button className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" onClick={() => navigate('/complaints/new')}>
              <Plus size={16} />
              New complaint
            </Button>
          )
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {setup && (
        <SetupContext.Provider value={setup}>
          <ModuleTabs label="Complaints" tabs={tabs} />
          <Routes>
            <Route index element={<ComplaintList key="index" scope={admin ? 'open' : 'mine'} />} />
            <Route path="mine" element={<ComplaintList key="mine" scope="mine" />} />
            {admin && <Route path="open" element={<ComplaintList key="open" scope="open" />} />}
            {admin && <Route path="all" element={<ComplaintList scope="all" />} />}
            <Route path="new" element={<ComplaintForm />} />
            <Route path=":id" element={<ComplaintDetail />} />
          </Routes>
        </SetupContext.Provider>
      )}
    </div>
  );
}
