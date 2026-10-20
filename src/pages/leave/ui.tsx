import type { ReactNode } from 'react';
import { LEAVE_STATUS_NAMES, type LeaveStatus } from '../../../shared/leave';

const STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{LEAVE_STATUS_NAMES[status]}</span>;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-gray-500">
      <span className="animate-spin h-5 w-5 mr-3 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" />
      Loading…
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
}
