import { LEAVE_STATUS_NAMES, type LeaveStatus } from '../../../shared/leave';
import { Pill, type PillTone } from '../../components/Pill';

export { EmptyState as Empty, ErrorNote, Loading } from '../../components/States';

const STATUS_TONES: Record<LeaveStatus, PillTone> = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'muted' };

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return <Pill tone={STATUS_TONES[status]}>{LEAVE_STATUS_NAMES[status]}</Pill>;
}
