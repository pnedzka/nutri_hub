import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import type { ContractSetup } from '../../../shared/contractsApi.ts';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';
import { CONTRACTS_API, SetupContext } from './common';
import { ContractDetail } from './ContractDetail';
import { ContractForm } from './ContractForm';
import { ContractList } from './ContractList';
import { ContractSettings } from './ContractSettings';

/**
 * Contract generator: traders generate sales and purchase contracts, administration accepts them after entering the
 * order in enova, Marcin Niećko (up to 100 000 EUR net) or a board member signs them, and the trader sends the
 * contract with the terms to the client and uploads the scan the client signed.
 */
export function ContractsPage() {
  const [setup, setSetup] = useState<ContractSetup | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api<ContractSetup>(`${CONTRACTS_API}&view=setup`)
      .then(setSetup)
      .catch((e: Error) => setError(e.message));
  }, []);

  const reviewer = Boolean(setup && (setup.me.isContractAdmin || setup.me.canSign));
  const trader = Boolean(setup && setup.owners.length > 0);
  const tabs = [
    ...(reviewer ? [{ to: '/contracts/todo', label: 'To do' }] : []),
    { to: '/contracts', label: 'My contracts' },
    ...(reviewer ? [{ to: '/contracts/all', label: 'All contracts' }] : []),
    ...(reviewer ? [{ to: '/contracts/settings', label: 'Settings' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={16} />
            All apps
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">Contract generator</h1>
        </div>
        {trader && (
          <Button className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" onClick={() => navigate('/contracts/new')}>
            <Plus size={16} />
            New contract
          </Button>
        )}
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {setup && (
        <SetupContext.Provider value={setup}>
          <nav className="-mx-4 sm:mx-0 overflow-x-auto border-b border-gray-200" aria-label="Contract generator">
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
                </NavLink>
              ))}
            </div>
          </nav>
          <Routes>
            <Route index element={<ContractList scope="mine" />} />
            {reviewer && <Route path="todo" element={<ContractList scope="todo" />} />}
            {reviewer && <Route path="all" element={<ContractList scope="all" />} />}
            {reviewer && <Route path="settings" element={<ContractSettings />} />}
            <Route path="new" element={<ContractForm />} />
            <Route path=":id/edit" element={<ContractForm />} />
            <Route path=":id" element={<ContractDetail />} />
          </Routes>
        </SetupContext.Provider>
      )}
    </div>
  );
}
