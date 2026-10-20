import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Select, Textarea } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import {
  ADMIN_ONLY,
  datesProblem,
  DEDUCTED,
  formatDays,
  formatRange,
  LEAVE_TYPE_NAMES,
  LEAVE_TYPES,
  limitProblem,
  workingDays,
  YEARLY_LIMITS,
  type Balance,
  type LeaveType,
} from '../../../shared/leave';
import type { LeaveOverview, LeaveRequestView, NewLeaveRequest } from '../../../shared/leaveApi';
import { Empty, StatusBadge } from './ui';

export function BalanceSummary({ balance }: { balance: Balance }) {
  const rows: [string, number][] = [
    [`Carried over into ${balance.year}`, balance.carriedOver],
    [`Granted for ${balance.year}`, balance.allowance],
    ['Taken or approved', -balance.used],
    ['Waiting for approval', -balance.pending],
  ];
  return (
    <div className="space-y-3">
      <div>
        <p className="text-3xl font-semibold text-gray-900">{formatDays(balance.available)}</p>
        <p className="text-sm text-gray-500">of annual leave available in {balance.year}</p>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-right tabular-nums text-gray-900">{value > 0 ? `+${value}` : value === 0 ? '0' : `−${-value}`}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500">
        Leave on demand: {balance.limited.on_demand ?? 0} of {YEARLY_LIMITS.on_demand} days (part of annual leave). Childcare: {balance.limited.childcare ?? 0} of{' '}
        {YEARLY_LIMITS.childcare} days.
      </p>
    </div>
  );
}

function RequestForm({ overview, onSaved }: { overview: LeaveOverview; onSaved: () => void }) {
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [type, setType] = useState<LeaveType>('vacation');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forOther = Boolean(userId);
  const types = LEAVE_TYPES.filter((t) => overview.isAdmin || !ADMIN_ONLY.includes(t));
  const singleDay = Boolean(start) && start === (end || start);
  const lastDay = end || start;
  const dateIssue = start ? datesProblem({ start, end: lastDay, halfDay: halfDay && singleDay }) : null;
  const days = start && !dateIssue ? workingDays(start, lastDay, halfDay && singleDay) : 0;
  // The limits are checked against the signed-in person's balance only; the server checks everyone's.
  const sameYear = start.slice(0, 4) === String(overview.balance.year);
  const limitIssue = days && !forOther && sameYear ? limitProblem(type, days, overview.balance) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: NewLeaveRequest = { type, start, end: lastDay, halfDay: halfDay && singleDay, note: note.trim() || undefined, userId: userId || undefined };
      await api('/api/leave', { method: 'POST', body });
      toast.success(forOther ? 'Leave entered' : 'Request sent', forOther ? undefined : 'Your manager will get an e-mail.');
      setStart('');
      setEnd('');
      setHalfDay(false);
      setNote('');
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {overview.isAdmin && (
        <Select id="leave-person" label="For" value={userId} onChange={(e) => setUserId(e.target.value)} hint={forOther ? 'Entered by an administrator: saved as approved.' : undefined}>
          <option value="">Me</option>
          {overview.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
      <Select id="leave-type" label="Type" value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
        {types.map((t) => (
          <option key={t} value={t}>
            {LEAVE_TYPE_NAMES[t]}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input
          id="leave-start"
          label="First day"
          type="date"
          required
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            if (!end || end < e.target.value) setEnd(e.target.value);
          }}
        />
        <Input id="leave-end" label="Last day" type="date" required min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      {singleDay && (
        <label className="flex items-center gap-2 min-h-11 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 accent-[#CC1F1F]" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
          Half a day
        </label>
      )}
      <Textarea id="leave-note" label="Note (optional)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      {start && (
        <p className={`text-sm ${dateIssue || limitIssue ? 'text-red-600' : 'text-gray-600'}`}>
          {dateIssue ?? limitIssue ?? `${formatDays(days)} of ${DEDUCTED.includes(type) ? 'annual leave' : LEAVE_TYPE_NAMES[type].toLowerCase()} (working days, without weekends and public holidays).`}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full sm:w-auto min-h-11" isLoading={busy} disabled={!start || Boolean(dateIssue) || Boolean(limitIssue)}>
        {forOther ? 'Enter leave' : 'Send request'}
      </Button>
    </form>
  );
}

function RequestItem({ request, onChange }: { request: LeaveRequestView; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    if (!window.confirm('Cancel this request?')) return;
    setBusy(true);
    try {
      await api('/api/leave', { method: 'PATCH', body: { id: request.id, action: 'cancel' } });
      toast.info('Request cancelled');
      onChange();
    } catch (err) {
      toast.error('Could not cancel', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {LEAVE_TYPE_NAMES[request.type]} · {formatDays(request.days)}
        </p>
        <p className="text-sm text-gray-600">{formatRange(request.start, request.end, request.halfDay)}</p>
        {request.note && <p className="mt-1 text-xs text-gray-500">{request.note}</p>}
        {request.enteredBy && <p className="mt-1 text-xs text-gray-500">Entered by {request.enteredBy.name}</p>}
        {request.decidedBy && !request.enteredBy && request.status !== 'pending' && (
          <p className="mt-1 text-xs text-gray-500">
            {request.status === 'cancelled' ? 'Cancelled' : request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.decidedBy.name}
            {request.decisionNote ? `: ${request.decisionNote}` : ''}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={request.status} />
        {request.status === 'pending' && (
          <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-0" onClick={() => void cancel()} isLoading={busy}>
            Cancel
          </Button>
        )}
      </div>
    </li>
  );
}

export function MyLeave({ overview, reload }: { overview: LeaveOverview; reload: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Your balance</h2>
          </CardHeader>
          <CardBody>
            <BalanceSummary balance={overview.balance} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">New request</h2>
          </CardHeader>
          <CardBody>
            <RequestForm overview={overview} onSaved={reload} />
          </CardBody>
        </Card>
      </div>
      <Card className="self-start">
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">Your requests in {overview.year}</h2>
        </CardHeader>
        <CardBody className="py-0">
          {overview.requests.length ? (
            <ul className="divide-y divide-gray-100">
              {overview.requests.map((r) => (
                <RequestItem key={r.id} request={r} onChange={reload} />
              ))}
            </ul>
          ) : (
            <Empty>No requests yet.</Empty>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
