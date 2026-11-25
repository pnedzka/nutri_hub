import { STATUS_LABELS, type ComplaintStatus } from '../../../shared/complaintsApi.ts';

const STATUS_TONE: Record<ComplaintStatus, string> = {
  open: 'bg-amber-50 text-amber-800 border-amber-200',
  investigating: 'bg-blue-50 text-blue-800 border-blue-200',
  with_supplier: 'bg-purple-50 text-purple-800 border-purple-200',
  resolved: 'bg-green-50 text-green-800 border-green-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function StatusPill({ status }: { status: ComplaintStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
