import type { ReactNode } from 'react';
import { STATUS_LABELS, type ContractStatus } from '../../../shared/contractsApi.ts';

const STATUS_TONE: Record<ContractStatus, string> = {
  admin_review: 'bg-amber-50 text-amber-800 border-amber-200',
  signature: 'bg-blue-50 text-blue-800 border-blue-200',
  board: 'bg-purple-50 text-purple-800 border-purple-200',
  signed: 'bg-green-50 text-green-800 border-green-200',
  client_signed: 'bg-green-100 text-green-900 border-green-300',
  returned: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function StatusPill({ status }: { status: ContractStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
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

