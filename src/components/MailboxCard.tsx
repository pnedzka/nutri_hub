import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, Mail } from 'lucide-react';
import { isQuiet, QUIET_DAYS, type MailboxOverview, type MailboxStatus } from '../../shared/mailboxApi';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';
import { ErrorNote, Loading } from '../pages/leave/ui';
import { Button } from './Button';
import { Card, CardBody, CardHeader } from './Card';
import { Input } from './Input';

const PATH = '/api/people?resource=mailbox';
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

function StateBadge({ status }: { status: MailboxStatus }) {
  const [label, style] =
    status.status !== 'connected'
      ? ['Not connected', 'bg-gray-50 text-gray-600 border-gray-200']
      : status.stopped
        ? ['Collecting stopped', 'bg-red-50 text-red-700 border-red-200']
        : status.source === 'manual'
          ? ['Connected by administrator', 'bg-green-50 text-green-800 border-green-200']
          : ['Connected', 'bg-green-50 text-green-800 border-green-200'];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}

function Facts({ status }: { status: MailboxStatus }) {
  const rows: [string, string][] = [
    ['Connected', status.source === 'manual' ? 'by administrator' : formatDateTime(status.connectedAt)],
    ['E-mails collected from', formatDate(status.historySince)],
    ['Last e-mail received', formatDateTime(status.lastInAt)],
    ['Last e-mail sent', formatDateTime(status.lastOutAt)],
    ['E-mails in the knowledge base', `${status.mailsIn} received, ${status.mailsOut} sent`],
  ];
  if (status.waitingForAi) rows.push(['Waiting to be read by AI', String(status.waitingForAi)]);
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between sm:block gap-4">
          <dt className="text-gray-500">{label}</dt>
          <dd className="text-gray-900 sm:mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ConnectForm({ mailbox, reconnect, onDone }: { mailbox: string; reconnect: boolean; onDone: (s: MailboxStatus) => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState<{ read: number; saved: number } | null>(null);
  // Connected, but reading the older e-mails stopped part-way: the next press continues from here.
  const [pending, setPending] = useState<MailboxStatus | null>(null);

  /** Reads the older e-mails in parts (each request has a time limit) until done; the password stays in memory only. */
  const readHistory = async (first: MailboxStatus) => {
    let status = first;
    let read = (progress?.read ?? 0) + (pending ? 0 : (status.history?.read ?? 0));
    let saved = (progress?.saved ?? 0) + (pending ? 0 : (status.history?.saved ?? 0));
    setProgress({ read, saved });
    while (status.history && !status.history.done) {
      setPending(status);
      status = await api<MailboxStatus>(`${PATH}&action=history`, { method: 'POST', body: { password, cursor: status.history.cursor } });
      read += status.history?.read ?? 0;
      saved += status.history?.saved ?? 0;
      setProgress({ read, saved });
    }
    setPending(null);
    return { status, saved };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // Local, not state: the state values of this render do not change while the request runs.
    let connected: MailboxStatus | null = pending;
    try {
      connected ??= await api<MailboxStatus>(PATH, { method: 'POST', body: { password, consent } });
      const { status, saved } = await readHistory(connected);
      setPassword('');
      setProgress(null);
      toast.success(
        reconnect ? 'Mailbox reconnected' : 'Mailbox connected',
        `${saved} older e-mails added to the knowledge base. New e-mails will appear within minutes.`,
      );
      onDone(status);
    } catch (e) {
      setError(
        connected
          ? `${(e as Error).message} Your mailbox is connected; press the button again to continue reading older e-mails.`
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        label={`Password of ${mailbox}`}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leftIcon={<Lock size={16} />}
        required
      />
      <label className="flex items-start gap-3 text-sm text-gray-700 min-h-11 sm:min-h-0">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#CC1F1F]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I agree that Nutri Partners copies e-mails from my company mailbox (Inbox and Sent) to the company knowledge base, where they are
          read by AI to find inquiries, offers and orders. I can disconnect the mailbox here at any time.
        </span>
      </label>
      {progress && busy && (
        <p className="text-sm text-gray-600">
          Reading older e-mails… {progress.read} read, {progress.saved} added. Keep this page open.
        </p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" isLoading={busy} disabled={!password || !consent} className="w-full sm:w-auto min-h-11 sm:min-h-0">
        {reconnect ? 'Reconnect mailbox' : 'Connect mailbox'}
      </Button>
    </form>
  );
}

/** My profile: the person connects their own company mailbox to the central knowledge base (shared/mailboxApi.ts). */
export function MailboxCard({ admin = false }: { admin?: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const [available, setAvailable] = useState(true);
  const [missing, setMissing] = useState<string[]>([]);

  const load = useCallback(() => {
    api<MailboxStatus | { available: false; missing?: string[] }>(PATH)
      .then((s) => {
        if ('available' in s) {
          setMissing(s.missing ?? []);
          return setAvailable(false);
        }
        setStatus(s);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const disconnect = async () => {
    if (!confirm('Disconnect your mailbox?\n\nNew e-mails will no longer be copied to the knowledge base. E-mails already copied stay there.')) return;
    setBusy(true);
    try {
      setStatus(await api<MailboxStatus>(PATH, { method: 'DELETE' }));
      toast.success('Mailbox disconnected');
    } catch (e) {
      toast.error('Could not disconnect', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const connected = status?.status === 'connected';
  const quiet = status ? isQuiet(status) : false;
  const showForm = status && status.source !== 'manual' && (!connected || status.stopped || reconnecting);

  if (!available) {
    if (!admin || !missing.length) return null;
    return (
      <Card>
        <CardHeader className="flex items-center gap-2">
          <Mail size={16} className="text-[#CC1F1F]" />
          <h2 className="text-sm font-semibold text-gray-900">Mailbox in the knowledge base</h2>
          <span className="text-xs text-gray-500">administrators</span>
        </CardHeader>
        <CardBody>
          <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              Not set up yet, so people do not see this card. Missing in Vercel (this environment): {missing.join(', ')}. Add them and
              redeploy.
            </span>
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <>
      <Card>
        <CardHeader className="flex items-center gap-2 flex-wrap">
          <Mail size={16} className="text-[#CC1F1F]" />
          <h2 className="text-sm font-semibold text-gray-900">Mailbox in the knowledge base</h2>
          {status && <StateBadge status={status} />}
        </CardHeader>
        <CardBody className="space-y-4">
          {error ? (
            <ErrorNote>{error}</ErrorNote>
          ) : !status ? (
            <Loading />
          ) : (
            <>
              {!connected && (
                <div className="text-sm text-gray-600 space-y-2">
                  <p>
                    Connect your company mailbox so that inquiries, offers and orders from your e-mails reach the company knowledge base. This
                    is how the team sees response times and gets better proposals.
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Only Inbox and Sent are copied. Nothing is sent, deleted or marked as read in your mailbox.</li>
                    <li>
                      Your password goes straight to the mail collector, where it is stored encrypted. Nobody at Nutri Partners sees it and this
                      page does not keep it.
                    </li>
                    <li>When you change your e-mail password, connect the mailbox again here.</li>
                  </ul>
                </div>
              )}
              {connected && <Facts status={status} />}
              {connected && status.stopped && (
                <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /> Collecting has stopped. Enter your password again to reconnect.
                </p>
              )}
              {connected && !status.stopped && quiet && (
                <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  No new e-mails in the last {QUIET_DAYS} days. If you changed your e-mail password, reconnect the mailbox.
                </p>
              )}
              {connected && !status.stopped && !quiet && !reconnecting && (
                <p className="flex gap-2 text-sm text-green-800">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> New e-mails are copied every few minutes.
                </p>
              )}
              {showForm && <ConnectForm mailbox={status.mailbox} reconnect={connected} onDone={(s) => {
                setStatus(s);
                setReconnecting(false);
              }} />}
              {connected && status.source === 'hub' && (
                <div className="flex flex-wrap gap-2">
                  {!showForm && (
                    <Button variant="secondary" onClick={() => setReconnecting(true)} className="min-h-11 sm:min-h-0">
                      I changed my password
                    </Button>
                  )}
                  {reconnecting && (
                    <Button variant="ghost" onClick={() => setReconnecting(false)} className="min-h-11 sm:min-h-0">
                      Cancel
                    </Button>
                  )}
                  <Button variant="danger" onClick={disconnect} isLoading={busy} className="min-h-11 sm:min-h-0">
                    Disconnect
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
      {admin && <MailboxesOverviewCard />}
    </>
  );
}

/** Administrators: which mailboxes feed the knowledge base and when the last e-mail came. */
function MailboxesOverviewCard() {
  const [boxes, setBoxes] = useState<MailboxOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ mailboxes: MailboxOverview[] }>(`${PATH}&view=all`)
      .then((r) => setBoxes(r.mailboxes))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Mail size={16} className="text-[#CC1F1F]" />
        <h2 className="text-sm font-semibold text-gray-900">Team mailboxes</h2>
        <span className="text-xs text-gray-500">administrators</span>
      </CardHeader>
      <CardBody>
        {error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : !boxes ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-1 py-2 font-semibold">Mailbox</th>
                  <th className="px-1 py-2 font-semibold">State</th>
                  <th className="px-1 py-2 font-semibold">Last received</th>
                  <th className="px-1 py-2 font-semibold">Last sent</th>
                  <th className="px-1 py-2 font-semibold text-right">E-mails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {boxes.map((b) => (
                  <tr key={b.mailbox}>
                    <td className="px-1 py-2">
                      <div className="text-gray-900">{b.owner ?? b.mailbox}</div>
                      {b.owner && <div className="text-xs text-gray-500">{b.mailbox}</div>}
                    </td>
                    <td className="px-1 py-2 text-gray-700">
                      {b.status !== 'connected' ? 'Disconnected' : b.source === 'manual' ? 'Connected (n8n)' : 'Connected (self)'}
                    </td>
                    <td className="px-1 py-2 text-gray-700 whitespace-nowrap">{formatDateTime(b.lastInAt)}</td>
                    <td className="px-1 py-2 text-gray-700 whitespace-nowrap">{formatDateTime(b.lastOutAt)}</td>
                    <td className="px-1 py-2 text-gray-700 text-right">{b.mailsIn + b.mailsOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
