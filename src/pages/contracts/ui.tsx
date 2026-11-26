import type { ReactNode } from 'react';
import { STATUS_LABELS, type ContractStatus } from '../../../shared/contractsApi.ts';
import { Pill, type PillTone } from '../../components/Pill';

const STATUS_TONES: Record<ContractStatus, PillTone> = {
  admin_review: 'amber',
  signature: 'blue',
  board: 'purple',
  signed: 'green',
  client_signed: 'greenStrong',
  returned: 'red',
  cancelled: 'muted',
};

export function StatusPill({ status }: { status: ContractStatus }) {
  return <Pill tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Pill>;
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {aside}
      </div>
      <div className="px-4 sm:px-6 py-4">{children}</div>
    </section>
  );
}

