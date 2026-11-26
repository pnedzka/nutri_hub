import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ContractSetup } from '../../../shared/contractsApi.ts';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';
import { CONTRACTS_API, SetupContext } from './common';
import { ArchiveDetail, ArchiveList } from './Archive';
import { ContractDetail } from './ContractDetail';
import { ContractForm } from './ContractForm';
import { ContractList } from './ContractList';
import { ContractSettings } from './ContractSettings';
import { ModuleTabs } from '../../components/ModuleTabs';
import { PageHeader } from '../../components/PageHeader';
import { ErrorNote } from '../../components/States';

/**
 * Contract generator: traders generate sales and purchase contracts, administration accepts them after entering the
 * order in enova, Marcin Niećko (up to 100 000 EUR net) or a board member signs them, and the trader sends the
 * contract with the terms to the client and uploads the scan the client signed.
 */
export function ContractsPage() {
  const location = useLocation();
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
  // People who accept or sign contracts start on what waits for them (S10 of the UI audit, 26.11.2026); their own
  // contracts are one tab further. Everyone else starts on their own contracts.
  const tabs = [
    ...(reviewer ? [{ to: '/contracts', label: 'To do' }] : []),
    { to: reviewer ? '/contracts/mine' : '/contracts', label: 'My contracts' },
    ...(reviewer ? [{ to: '/contracts/all', label: 'All contracts' }] : []),
    { to: '/contracts/archive', label: 'Archive (intranet)' },
    ...(reviewer ? [{ to: '/contracts/settings', label: 'Settings' }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts"
        actions={
          trader && (
            <Button className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" onClick={() => navigate('/contracts/new')}>
              <Plus size={16} />
              New contract
            </Button>
          )
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {setup && (
        <SetupContext.Provider value={setup}>
          <ModuleTabs label="Contracts" tabs={tabs} />
          <Routes>
            <Route index element={<ContractList key="index" scope={reviewer ? 'todo' : 'mine'} />} />
            <Route path="mine" element={<ContractList key="mine" scope="mine" />} />
            {reviewer && <Route path="todo" element={<ContractList key="todo" scope="todo" />} />}
            {reviewer && <Route path="all" element={<ContractList scope="all" />} />}
            {reviewer && <Route path="settings" element={<ContractSettings />} />}
            <Route path="archive" element={<ArchiveList />} />
            <Route path="archive/:id" element={<ArchiveDetail />} />
            <Route path="new" element={<ContractForm key={location.search} />} />
            <Route path=":id/edit" element={<ContractForm />} />
            <Route path=":id" element={<ContractDetail />} />
          </Routes>
        </SetupContext.Provider>
      )}
    </div>
  );
}
