import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import type { ComplaintSetup } from '../../../shared/complaintsApi.ts';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';
import { COMPLAINTS_API, SetupContext } from './common';
import { ComplaintDetail } from './ComplaintDetail';
import { ComplaintForm } from './ComplaintForm';
import { ComplaintList } from './ComplaintList';
import { ModuleTabs } from '../../components/ModuleTabs';

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={16} />
            Home
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">Complaints</h1>
        </div>
        {setup && (
          <Button className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" onClick={() => navigate('/complaints/new')}>
            <Plus size={16} />
            New complaint
          </Button>
        )}
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
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
