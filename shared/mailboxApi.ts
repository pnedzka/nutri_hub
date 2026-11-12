// "Mailbox in the knowledge base" (My profile): a person connects their company mailbox to the central database
// themselves. The server (api/_lib/mailbox.ts) checks the password with the mail server, stores it only in n8n (as an
// IMAP credential) and creates an n8n workflow from buildIngestWorkflow() that copies Inbox and Sent to raw.emails.
// The central database (db/central/mailbox_api.sql) keeps only the state of the connection.
//
//   GET    /api/people?resource=mailbox            → MailboxStatus (the signed-in person's mailbox), or
//                                                   { available: false, missing? } until the hub is set up for it
//                                                   (missing: names of the settings, for administrators only)
//   GET    /api/people?resource=mailbox&view=all   → { mailboxes: MailboxOverview[] } (administrators)
//   POST   /api/people?resource=mailbox  body { password, consent: true } → MailboxStatus
//   DELETE /api/people?resource=mailbox            → MailboxStatus (stops collecting; e-mails already saved stay)

/** hub: connected in the hub; manual: added by an administrator in n8n (e.g. j.chrobak@); none: never connected. */
export type MailboxSource = 'hub' | 'manual' | 'none';

export interface MailboxStatus {
  mailbox: string;
  source: MailboxSource;
  status: 'connected' | 'disconnected';
  /** Collecting has stopped although the mailbox is connected (the n8n workflow is off or missing). */
  stopped: boolean;
  historySince: string | null;
  connectedAt: string | null;
  mailsIn: number;
  mailsOut: number;
  lastInAt: string | null;
  lastOutAt: string | null;
  waitingForAi: number;
}

export interface MailboxOverview {
  mailbox: string;
  owner: string | null;
  team: string | null;
  source: Exclude<MailboxSource, 'none'>;
  status: 'connected' | 'disconnected';
  connectedAt: string | null;
  historySince: string | null;
  mailsIn: number;
  mailsOut: number;
  lastInAt: string | null;
  lastOutAt: string | null;
}

export class MailboxInputError extends Error {}

/** The body of POST: the mailbox password (never stored by the hub) and the person's consent. */
export function connectInput(body: unknown): { password: string } {
  const b = (body ?? {}) as { password?: unknown; consent?: unknown };
  if (b.consent !== true) throw new MailboxInputError('Please confirm that you agree to connect your mailbox.');
  if (typeof b.password !== 'string' || !b.password) throw new MailboxInputError('Enter the password of your mailbox.');
  if (b.password.length > 256) throw new MailboxInputError('The password is too long.');
  return { password: b.password };
}

/** Only company mailboxes can be connected: the sign-in address in one of the company domains. */
export function isCompanyMailbox(email: string, domains: readonly string[]): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  return domains.includes(email.slice(at + 1).toLowerCase());
}

/** The Sent folder on the mail server: the one marked \Sent, otherwise a usual name, otherwise "Sent". */
export function pickSentFolder(folders: readonly { path: string; specialUse?: string | null }[]): string {
  const marked = folders.find((f) => f.specialUse === '\\Sent');
  if (marked) return marked.path;
  const named = folders.find((f) => /^(inbox[./])?(sent|sent items|sent messages|sent mail|wysłane|elementy wysłane)$/i.test(f.path));
  return named?.path ?? 'Sent';
}

/** Collecting has probably stopped when nothing came in for this many days (e.g. the password was changed). */
export const QUIET_DAYS = 4;

export function isQuiet(status: Pick<MailboxStatus, 'status' | 'lastInAt' | 'connectedAt'>, now = new Date()): boolean {
  if (status.status !== 'connected') return false;
  const last = status.lastInAt ?? status.connectedAt;
  if (!last) return false;
  return now.getTime() - new Date(last).getTime() > QUIET_DAYS * 86_400_000;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A date as the IMAP SINCE search of n8n expects it ("October 12, 2026"); the time of day is ignored. */
export function imapSince(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/**
 * Where a folder starts being read: `historyDays` back on the first connection; on reconnecting, a day before the
 * last e-mail of that folder already saved, so mail is not read (and paid for in n8n executions) twice.
 */
export function readFrom(lastAt: string | null, historyDays: number, now = new Date()): Date {
  const start = lastAt ? new Date(lastAt).getTime() - 86_400_000 : now.getTime() - historyDays * 86_400_000;
  return new Date(Math.min(start, now.getTime()));
}

// The same query and mapping as in "Central DB - Mail ingest" (j.chrobak@ and purchase@), so every mailbox lands in
// raw.emails the same way. Duplicates are skipped (unique mailbox + message_id).
const INSERT_QUERY = `insert into raw.emails(mailbox, message_id, thread_key, in_reply_to, direction, from_address, to_addresses, cc_addresses, subject, body_text, attachments, sent_at)
select j->>'mailbox', j->>'messageId', j->>'thread', j->>'inReplyTo', j->>'direction', lower(j->>'from'),
  array(select lower(jsonb_array_elements_text(j->'to'))), array(select lower(jsonb_array_elements_text(j->'cc'))),
  j->>'subject', j->>'body', coalesce(j->'attachments', '[]'::jsonb), (j->>'date')::timestamptz
from (select $1::jsonb j) s
on conflict (mailbox, message_id) do nothing;`;

const INSERT_VALUES = String.raw`={{ [JSON.stringify({ mailbox: $json.np_mailbox, direction: $json.np_direction, messageId: $json.messageId || ($json.np_mailbox + ":" + ($json.date || "") + ":" + ($json.subject || "")), inReplyTo: $json.inReplyTo || null, thread: [].concat($json.references || [])[0] || $json.inReplyTo || $json.messageId || null, from: (($json.from && $json.from.value) || []).map(v => v.address)[0] || null, to: [].concat($json.to || []).flatMap(t => (t.value || []).map(v => v.address)), cc: [].concat($json.cc || []).flatMap(t => (t.value || []).map(v => v.address)), subject: $json.subject || null, body: String($json.text || String($json.html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).slice(0, 100000), attachments: JSON.parse($json.np_attachments || "[]"), date: $json.date || null })] }}`;

const ATTACHMENTS = '={{ JSON.stringify(Object.values($binary || {}).map(b => ({ name: b.fileName, type: b.mimeType, size: b.fileSize }))) }}';

export const workflowName = (mailbox: string) => `Central DB - Mail ingest - ${mailbox}`;

export interface IngestWorkflowInput {
  mailbox: string;
  imapCredential: { id: string; name: string };
  dbCredential: { id: string; name: string };
  sentFolder: string;
  /** Where Inbox and Sent start being read (readFrom). */
  since: { in: Date; out: Date };
  errorWorkflowId?: string;
  /**
   * The first read after connecting: n8n's IMAP trigger (2.1) with "Fetch Only New Emails" on adds SINCE <day of
   * activation> until it has read once, which drops the history. So a new workflow starts with it off and
   * finishCatchUp() turns it on once the history is in (afterwards n8n only reads mail above the last UID).
   */
  catchUp?: boolean;
}

/** How long after connecting the history is surely read and "Fetch Only New Emails" can be turned on. */
export const CATCH_UP_MINUTES = 15;

type WorkflowNode = { type?: string; parameters?: { options?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

/** The nodes with "Fetch Only New Emails" turned back on, or null when no IMAP trigger still has it off. */
export function finishCatchUp<T extends WorkflowNode>(nodes: readonly T[]): T[] | null {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.type !== 'n8n-nodes-base.emailReadImap' || node.parameters?.options?.trackLastMessageId !== false) return node;
    changed = true;
    return { ...node, parameters: { ...node.parameters, options: { ...node.parameters.options, trackLastMessageId: true } } };
  });
  return changed ? next : null;
}

/** The n8n workflow of one mailbox: Inbox and Sent (not marked as read) → raw.emails. */
export function buildIngestWorkflow(input: IngestWorkflowInput) {
  const folders = [
    { key: 'in' as const, label: 'Odebrane', folder: 'INBOX', y: 0 },
    { key: 'out' as const, label: 'Wyslane', folder: input.sentFolder, y: 192 },
  ];
  const nodes: Record<string, unknown>[] = [];
  const connections: Record<string, unknown> = {};
  for (const f of folders) {
    const trigger = f.label;
    const mark = `Oznacz: ${f.label.toLowerCase()}`;
    nodes.push(
      {
        name: trigger,
        type: 'n8n-nodes-base.emailReadImap',
        typeVersion: 2.1,
        position: [0, f.y],
        parameters: {
          mailbox: f.folder,
          postProcessAction: 'nothing',
          format: 'resolved',
          dataPropertyAttachmentsPrefixName: 'attachment_',
          options: { customEmailConfig: JSON.stringify(['ALL', ['SINCE', imapSince(input.since[f.key])]]), trackLastMessageId: !input.catchUp },
        },
        credentials: { imap: input.imapCredential },
      },
      {
        name: mark,
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [224, f.y],
        parameters: {
          includeOtherFields: true,
          assignments: {
            assignments: [
              { id: 'mb', name: 'np_mailbox', value: input.mailbox, type: 'string' },
              { id: 'dir', name: 'np_direction', value: f.key, type: 'string' },
              { id: 'att', name: 'np_attachments', value: ATTACHMENTS, type: 'string' },
            ],
          },
          options: {},
        },
      },
    );
    connections[trigger] = { main: [[{ node: mark, type: 'main', index: 0 }]] };
    connections[mark] = { main: [[{ node: 'Zapisz mail w bazie', type: 'main', index: 0 }]] };
  }
  nodes.push(
    {
      name: 'Zapisz mail w bazie',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.7,
      position: [448, 96],
      parameters: { operation: 'executeQuery', query: INSERT_QUERY, options: { queryReplacement: INSERT_VALUES } },
      credentials: { postgres: input.dbCredential },
    },
    {
      name: 'Opis',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [-320, 0],
      parameters: {
        content:
          `## ${input.mailbox} -> raw.emails\nZałożony automatycznie przez centrum aplikacji (My profile), gdy pracownik podłączył skrzynkę. ` +
          'Nie edytuj ręcznie: odłączenie w centrum usuwa ten workflow i dane logowania. Maile nie są oznaczane jako przeczytane.',
        width: 260,
        height: 220,
        color: 7,
      },
    },
  );
  return {
    name: workflowName(input.mailbox),
    nodes: nodes.map((node) => ({ id: globalThis.crypto.randomUUID(), ...node })),
    connections,
    settings: {
      executionOrder: 'v1',
      timezone: 'Europe/Warsaw',
      ...(input.errorWorkflowId ? { errorWorkflow: input.errorWorkflowId } : {}),
    },
  };
}
