// "Mailbox in the knowledge base" (My profile): a person connects their company mailbox to the central database
// themselves. The server (api/_lib/mailbox.ts) checks the password with the mail server, stores it only in n8n (as an
// IMAP credential) and creates an n8n workflow from buildIngestWorkflow() that copies Inbox and Sent to raw.emails.
// The central database (db/central/mailbox_api.sql) keeps only the state of the connection.
//
//   GET    /api/people?resource=mailbox            → MailboxStatus (the signed-in person's mailbox), or
//                                                   { available: false, missing? } until the hub is set up for it
//                                                   (missing: names of the settings, for administrators only)
//   GET    /api/people?resource=mailbox&view=all   → { mailboxes: MailboxOverview[] } (administrators)
//   POST   /api/people?resource=mailbox  body { password, consent: true } → MailboxStatus (+ history: the first part
//                                                   of the older e-mails is read right away)
//   POST   /api/people?resource=mailbox&action=history  body { password, cursor } → MailboxStatus (+ history), until done
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
  /** After connecting or POST …&action=history: how far reading the older e-mails got. */
  history?: HistoryProgress;
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
          options: { customEmailConfig: JSON.stringify(['ALL', ['SINCE', imapSince(input.since[f.key])]]), trackLastMessageId: true },
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

// --- history, read by the hub ---------------------------------------------------------------------------------------
// The IMAP trigger of n8n does not read a folder's history from the SINCE date (it starts with what arrives after it
// is switched on), so the hub reads the history itself when a mailbox is connected: Inbox first, then Sent, in
// batches that fit one request. The page keeps calling `POST …&action=history` with the password (kept only in the
// page's memory) and the cursor until `done`. Duplicates of what n8n already saved are skipped by the database.

export type HistoryFolder = 'in' | 'out';

/** Where reading the history stopped: the folder and the last UID read in it. */
export interface HistoryCursor {
  folder: HistoryFolder;
  uid: number;
}

export interface HistoryProgress {
  done: boolean;
  /** E-mails new to the knowledge base in this request. */
  saved: number;
  /** E-mails read in this request (new and already saved). */
  read: number;
  cursor: HistoryCursor | null;
}

/** The body of POST …&action=history. */
export function historyInput(body: unknown): { password: string; cursor: HistoryCursor | null } {
  const b = (body ?? {}) as { password?: unknown; cursor?: unknown };
  if (typeof b.password !== 'string' || !b.password || b.password.length > 256) throw new MailboxInputError('Enter the password of your mailbox.');
  const c = b.cursor as { folder?: unknown; uid?: unknown } | null | undefined;
  if (c == null) return { password: b.password, cursor: null };
  if ((c.folder !== 'in' && c.folder !== 'out') || typeof c.uid !== 'number' || !Number.isInteger(c.uid) || c.uid < 0) {
    throw new MailboxInputError('The history cursor is not valid.');
  }
  return { password: b.password, cursor: { folder: c.folder, uid: c.uid } };
}

/** The part of a message's structure the hub uses (as imapflow returns it). */
export interface BodyNode {
  part?: string;
  type?: string;
  size?: number;
  disposition?: string;
  dispositionParameters?: Record<string, string>;
  parameters?: Record<string, string>;
  childNodes?: BodyNode[];
}

const fileName = (n: BodyNode) => n.dispositionParameters?.filename ?? n.parameters?.name ?? null;
const isAttachment = (n: BodyNode) => n.disposition?.toLowerCase() === 'attachment' || (!!fileName(n) && !n.type?.startsWith('multipart/'));

function leaves(node: BodyNode): BodyNode[] {
  return node.childNodes?.length ? node.childNodes.flatMap(leaves) : [node];
}

/** The part to read as the body: the first text/plain that is not an attachment, otherwise the first text/html. */
export function pickBodyPart(root: BodyNode | undefined): { part: string; html: boolean } | null {
  if (!root) return null;
  const parts = leaves(root).filter((n) => !isAttachment(n));
  const plain = parts.find((n) => n.type?.toLowerCase() === 'text/plain');
  const html = parts.find((n) => n.type?.toLowerCase() === 'text/html');
  const chosen = plain ?? html;
  if (!chosen) return null;
  // A message that is not multipart has no part number: its body is part 1.
  return { part: chosen.part ?? '1', html: !plain };
}

/** Attachments as the n8n workflow lists them: name, type and size ("114 kB"), without the files. */
export function listAttachments(root: BodyNode | undefined): { name: string; type: string; size: string }[] {
  if (!root) return [];
  return leaves(root)
    .filter(isAttachment)
    .map((n) => ({
      name: fileName(n) ?? 'attachment',
      type: n.type?.toLowerCase() ?? 'application/octet-stream',
      // The size on the server is of the encoded part; base64 is a third larger than the file.
      size: `${Math.max(1, Math.round(((n.size ?? 0) * 0.75) / 1000))} kB`,
    }));
}

/** Plain text of an HTML body, the same way the n8n workflow does it. */
export function htmlToText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/** The first Message-ID of a References header (the thread), or null. */
export function firstReference(header: string | undefined): string | null {
  const match = header?.match(/<[^<>\s]+>/);
  return match ? match[0] : null;
}

export interface HistoryEmail {
  direction: HistoryFolder;
  messageId: string;
  inReplyTo: string | null;
  thread: string | null;
  from: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  body: string;
  attachments: { name: string; type: string; size: string }[];
  date: string | null;
}

interface Address {
  address?: string;
}

/** One e-mail as mailbox_api.save_emails expects it (the same fields the n8n workflow writes). */
export function historyEmail(
  mailbox: string,
  direction: HistoryFolder,
  message: {
    envelope?: { messageId?: string; inReplyTo?: string; subject?: string; date?: Date | string; from?: Address[]; to?: Address[]; cc?: Address[] };
    internalDate?: Date | string;
    references?: string;
    bodyStructure?: BodyNode;
  },
  body: { text: string; html: boolean } | null,
): HistoryEmail {
  const e = message.envelope ?? {};
  const date = e.date && !Number.isNaN(new Date(e.date).getTime()) ? new Date(e.date) : message.internalDate ? new Date(message.internalDate) : null;
  const dateIso = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  const messageId = e.messageId || `${mailbox}:${dateIso ?? ''}:${e.subject ?? ''}`;
  const addresses = (list?: Address[]) => (list ?? []).map((a) => a.address).filter((a): a is string => !!a);
  const text = body ? (body.html ? htmlToText(body.text) : body.text) : '';
  return {
    direction,
    messageId,
    inReplyTo: e.inReplyTo || null,
    thread: firstReference(message.references) ?? (e.inReplyTo || null) ?? messageId,
    from: addresses(e.from)[0] ?? null,
    to: addresses(e.to),
    cc: addresses(e.cc),
    subject: e.subject || null,
    body: text.slice(0, 100_000),
    attachments: listAttachments(message.bodyStructure),
    date: dateIso,
  };
}
