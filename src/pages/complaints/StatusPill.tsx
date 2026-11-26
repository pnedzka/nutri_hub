import { STATUS_LABELS, type ComplaintStatus } from '../../../shared/complaintsApi.ts';
import { Pill, type PillTone } from '../../components/Pill';

const STATUS_TONES: Record<ComplaintStatus, PillTone> = {
  open: 'amber',
  investigating: 'blue',
  with_supplier: 'purple',
  resolved: 'green',
  closed: 'gray',
  cancelled: 'muted',
};

export function StatusPill({ status }: { status: ComplaintStatus }) {
  return <Pill tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Pill>;
}
