import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card, CardBody } from '../../components/Card';
import { Textarea } from '../../components/Field';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { DEDUCTED, formatDate, formatDays, formatRange, LEAVE_TYPE_NAMES, YEARLY_LIMITS, type Balance } from '../../../shared/leave';
import type { LeaveOverview, LeaveRequestView } from '../../../shared/leaveApi';
import { Empty } from './ui';

function ApprovalCard({ request, balance, onDone }: { request: LeaveRequestView; balance: Balance; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  // The balance already counts this request (pending), so a negative or over-the-limit figure means it does not fit.
  const limit = YEARLY_LIMITS[request.type];
  const warning =
    DEDUCTED.includes(request.type) && balance.available < 0
      ? `Not enough annual leave: this request goes ${formatDays(-balance.available)} over.`
      : limit !== undefined && (balance.limited[request.type] ?? 0) > limit
        ? `Over the yearly limit of ${formatDays(limit)} for ${LEAVE_TYPE_NAMES[request.type].toLowerCase()}.`
        : null;

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(action);
    try {
      await api('/api/leave', { method: 'PATCH', body: { id: request.id, action, note: note.trim() || undefined } });
      toast.success(action === 'approve' ? 'Approved' : 'Rejected', `${request.person.name} will get an e-mail.`);
      onDone();
    } catch (err) {
      toast.error('Could not save the decision', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900">{request.person.name}</h3>
          <span className="text-xs text-gray-500">Sent {formatDate(request.createdAt.slice(0, 10))}</span>
        </div>
        <p className="text-sm text-gray-700">
          {LEAVE_TYPE_NAMES[request.type]} · <strong>{formatRange(request.start, request.end, request.halfDay)}</strong> · {formatDays(request.days)}
        </p>
        {request.note && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{request.note}</p>}
        {DEDUCTED.includes(request.type) && (
          <p className="text-xs text-gray-500">
            Annual leave available in {balance.year} after this request: {formatDays(balance.available)}
          </p>
        )}
        {warning && <p className="text-sm text-amber-700">{warning}</p>}
        <Textarea id={`note-${request.id}`} label="Comment (optional)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => void decide('approve')} isLoading={busy === 'approve'} disabled={busy !== null}>
            <Check size={16} />
            Approve
          </Button>
          <Button variant="secondary" className="min-h-11" onClick={() => void decide('reject')} isLoading={busy === 'reject'} disabled={busy !== null}>
            <X size={16} />
            Reject
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function Approvals({ overview, reload }: { overview: LeaveOverview; reload: () => void }) {
  if (!overview.isApprover) return <Empty>Requests to approve appear here for managers and administrators.</Empty>;
  if (!overview.approvals.length) return <Empty>No requests waiting for a decision.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {overview.approvals.map(({ request, balance }) => (
        <ApprovalCard key={request.id} request={request} balance={balance} onDone={reload} />
      ))}
    </div>
  );
}
