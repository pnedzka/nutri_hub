// "Mailbox in the knowledge base" (My profile): a person connects their company mailbox to the central database
// without handing the password to anyone. Served by api/people.ts with ?resource=mailbox (the Hobby plan's 12
// functions are used); the API is described in shared/mailboxApi.ts.
//
// Connecting: the server logs in to the mail server (IMAP) with the password to check it and to find the Sent folder,
// saves it in n8n as an IMAP credential and creates (or, on reconnecting, updates) the n8n workflow of that mailbox
// (buildIngestWorkflow), which copies Inbox and Sent to raw.emails. The password is kept only in n8n, encrypted; the
// hub never stores or logs it. The central database (db/central/mailbox_api.sql) keeps the state and the n8n ids.
//
// Settings (Vercel): MAIL_IMAP_HOST (the mail server, as in the n8n credentials of j.chrobak@), MAIL_IMAP_PORT (993),
// N8N_API_URL (https://nutripartners.app.n8n.cloud), N8N_API_KEY, and optionally MAILBOX_DOMAINS (nutripartners.co),
// MAILBOX_HISTORY_DAYS (30), N8N_CENTRAL_DB_CREDENTIAL_ID / _NAME and N8N_ERROR_WORKFLOW_ID.

import { ImapFlow } from 'imapflow';
import {
  MailboxInputError,
  buildIngestWorkflow,
  connectInput,
  historyEmail,
  historyInput,
  isCompanyMailbox,
  pickSentFolder,
  pickBodyPart,
  readFrom,
  type BodyNode,
  type HistoryCursor,
  type HistoryEmail,
  type HistoryFolder,
  type HistoryProgress,
  type MailboxOverview,
  type MailboxSource,
  type MailboxStatus,
} from '../../shared/mailboxApi.js';
import { requireAdmin, requireUser, type Profile } from './auth.js';
import { centralDb } from './central.js';
import { HttpError, handle, json, readJson } from './http.js';
import { logError } from './monitoring.js';

export const isMailboxRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'mailbox';

const env = (name: string) => process.env[name]?.trim() || undefined;
const domains = () => (env('MAILBOX_DOMAINS') ?? 'nutripartners.co').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const historyDays = () => Math.min(365, Math.max(1, Number.parseInt(env('MAILBOX_HISTORY_DAYS') ?? '30', 10) || 30));

/** What mailbox_api.status returns: MailboxStatus plus the n8n ids, which stay on the server. */
interface StoredStatus extends Omit<MailboxStatus, 'stopped'> {
  credentialId: string | null;
  workflowId: string | null;
  sentFolder: string | null;
}

// --- central database -------------------------------------------------------------------------------------------

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await centralDb().schema('mailbox_api').rpc(fn, args);
  if (!error) return data as T;
  if (error.code === 'P0001') throw new HttpError(429, error.message);
  logError(`mailbox.${fn}`, new Error(`mailbox_api.${fn} failed (${error.code ?? 'unknown'})`), { code: error.code });
  throw new HttpError(
    error.code?.startsWith('PGRST') ? 503 : 500,
    error.code?.startsWith('PGRST')
      ? 'The central database is not ready for mailboxes yet (mailbox_api). Tell your administrator.'
      : 'The central database did not answer. Try again in a moment.',
  );
}

const failed = (mailbox: string, reason: string) =>
  call('connect_failed', { p_mailbox: mailbox, p_reason: reason }).catch((error) => logError('mailbox.connect_failed', error));

// --- n8n API ------------------------------------------------------------------------------------------------------

class N8nError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function n8nConfig() {
  const url = env('N8N_API_URL');
  const key = env('N8N_API_KEY');
  if (!url || !key) throw new HttpError(503, 'Connecting mailboxes is not configured yet (N8N_API_URL or N8N_API_KEY is missing). Tell your administrator.');
  const base = url.replace(/\/+$/, '');
  return { base: base.endsWith('/api/v1') ? base : `${base}/api/v1`, key };
}

async function n8n<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { base, key } = n8nConfig();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-n8n-api-key': key, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  // Only the status goes to logs: an n8n error message could repeat what was sent (the credential).
  if (!response.ok) throw new N8nError(response.status, `n8n ${method} ${path.replace(/\/[A-Za-z0-9]{8,}/g, '/:id')} answered ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Deletes in n8n, treating "already gone" as done. */
async function remove(path: string): Promise<void> {
  try {
    await n8n('DELETE', path);
  } catch (error) {
    if (!(error instanceof N8nError && error.status === 404)) throw error;
  }
}

const dbCredential = () => ({ id: env('N8N_CENTRAL_DB_CREDENTIAL_ID') ?? 'hLCnOzIXzywUVVC7', name: env('N8N_CENTRAL_DB_CREDENTIAL_NAME') ?? 'Supabase nutri-central-db' });

// --- mail server --------------------------------------------------------------------------------------------------

function imapConfig() {
  const host = env('MAIL_IMAP_HOST');
  if (!host) throw new HttpError(503, 'Connecting mailboxes is not configured yet (MAIL_IMAP_HOST is missing). Tell your administrator.');
  const port = Number.parseInt(env('MAIL_IMAP_PORT') ?? '993', 10) || 993;
  return { host, port, secure: port === 993 };
}

/** Logs in to the mailbox (checks the password) and finds the Sent folder. The caller logs out. */
async function openMailbox(mailbox: string, password: string): Promise<{ client: ImapFlow; sentFolder: string }> {
  const { host, port, secure } = imapConfig();
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user: mailbox, pass: password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    const folders = await client.list();
    return { client, sentFolder: pickSentFolder(folders.map((f) => ({ path: f.path, specialUse: f.specialUse }))) };
  } catch (error) {
    await client.logout().catch(() => client.close());
    if ((error as { authenticationFailed?: boolean }).authenticationFailed) {
      await failed(mailbox, 'wrong_password');
      throw new HttpError(400, 'The mail server did not accept this password. Use the password you sign in to your company e-mail with.');
    }
    await failed(mailbox, 'unreachable');
    logError('mailbox.imap', new Error('The mail server did not answer'), { code: (error as { code?: string }).code });
    throw new HttpError(502, 'The mail server did not answer. Try again in a moment.');
  }
}

const closeMailbox = (client: ImapFlow) => client.logout().catch(() => client.close());

// --- history ------------------------------------------------------------------------------------------------------

/** One request reads the history for at most this long (the function may run 30 s; connecting takes a few). */
const HISTORY_BUDGET_MS = 18_000;
const HISTORY_BATCH = 20;
/** The body of one e-mail is read up to this size (enough for the text; bigger parts are mostly embedded images). */
const BODY_MAX_BYTES = 256 * 1024;

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return Buffer.concat(chunks).toString('utf8');
}

async function saveEmails(mailbox: string, emails: HistoryEmail[]): Promise<number> {
  if (!emails.length) return 0;
  return Number(await call<number>('save_emails', { p_mailbox: mailbox, p_emails: emails }));
}

/**
 * Reads the history of Inbox and then Sent from `since`, read-only (nothing is marked as read), and saves it in
 * raw.emails, until done or until the time budget runs out; then returns the cursor to continue from.
 */
async function readHistory(
  client: ImapFlow,
  mailbox: string,
  sentFolder: string,
  since: Date,
  cursor: HistoryCursor | null,
  deadline: number,
): Promise<HistoryProgress> {
  const folders: { key: HistoryFolder; path: string }[] = [
    { key: 'in', path: 'INBOX' },
    { key: 'out', path: sentFolder },
  ];
  let saved = 0;
  let read = 0;
  const from = cursor?.folder;
  const start = from ? folders.findIndex((f) => f.key === from) : 0;
  for (let i = Math.max(0, start); i < folders.length; i++) {
    const folder = folders[i];
    let lastUid = cursor?.folder === folder.key ? cursor.uid : 0;
    const lock = await client.getMailboxLock(folder.path, { readOnly: true }).catch(() => null);
    if (!lock) continue; // no such folder: nothing to read there
    try {
      const found = await client.search({ since }, { uid: true });
      const uids = (found || []).filter((uid) => uid > lastUid).sort((a, b) => a - b);
      for (let b = 0; b < uids.length; b += HISTORY_BATCH) {
        if (Date.now() > deadline) return { done: false, saved, read, cursor: { folder: folder.key, uid: lastUid } };
        const batch = uids.slice(b, b + HISTORY_BATCH);
        const messages = [];
        for await (const m of client.fetch(batch, { uid: true, envelope: true, bodyStructure: true, internalDate: true, headers: ['references'] }, { uid: true })) {
          messages.push(m);
        }
        const emails: HistoryEmail[] = [];
        for (const m of messages.sort((x, y) => x.uid - y.uid)) {
          const chosen = pickBodyPart(m.bodyStructure as BodyNode | undefined);
          let body: { text: string; html: boolean } | null = null;
          if (chosen) {
            try {
              const { content } = await client.download(String(m.uid), chosen.part, { uid: true, maxBytes: BODY_MAX_BYTES });
              if (content) body = { text: await readStream(content), html: chosen.html };
            } catch {
              body = null; // the e-mail is still saved, without its text
            }
          }
          const references = m.headers ? m.headers.toString('utf8').replace(/^references:\s*/i, '').replace(/\r?\n\s+/g, ' ').trim() : undefined;
          emails.push(historyEmail(mailbox, folder.key, { envelope: m.envelope, internalDate: m.internalDate, references, bodyStructure: m.bodyStructure as BodyNode | undefined }, body));
        }
        saved += await saveEmails(mailbox, emails);
        read += emails.length;
        lastUid = batch[batch.length - 1];
      }
    } finally {
      lock.release();
    }
    cursor = null;
  }
  return { done: true, saved, read, cursor: null };
}

// --- state --------------------------------------------------------------------------------------------------------

function companyMailbox(person: Profile): string {
  const mailbox = person.email.trim().toLowerCase();
  if (!isCompanyMailbox(mailbox, domains())) throw new HttpError(400, 'Only company mailboxes can be connected.');
  return mailbox;
}

/** Whether the n8n workflow of a mailbox connected in the hub is missing or switched off. */
async function isStopped(stored: StoredStatus): Promise<boolean> {
  if (stored.source !== 'hub' || stored.status !== 'connected') return false;
  if (!stored.workflowId) return true;
  try {
    const workflow = await n8n<{ active?: boolean }>('GET', `/workflows/${encodeURIComponent(stored.workflowId)}`);
    return workflow.active !== true;
  } catch (error) {
    if (error instanceof N8nError && error.status === 404) return true;
    // n8n not answering does not mean collecting stopped; the page still shows the mail already saved.
    logError('mailbox.isStopped', error);
    return false;
  }
}

function toStatus(stored: StoredStatus, stopped: boolean): MailboxStatus {
  return {
    mailbox: stored.mailbox,
    source: stored.source as MailboxSource,
    status: stored.status,
    stopped,
    historySince: stored.historySince ?? null,
    connectedAt: stored.connectedAt ?? null,
    mailsIn: Number(stored.mailsIn ?? 0),
    mailsOut: Number(stored.mailsOut ?? 0),
    lastInAt: stored.lastInAt ?? null,
    lastOutAt: stored.lastOutAt ?? null,
    waitingForAi: Number(stored.waitingForAi ?? 0),
  };
}

// --- connect, disconnect ------------------------------------------------------------------------------------------

async function connect(person: Profile, password: string): Promise<MailboxStatus> {
  const mailbox = companyMailbox(person);
  imapConfig();
  n8nConfig();
  const state = await call<StoredStatus>('connect_begin', { p_mailbox: mailbox });
  if (state.source === 'manual') throw new HttpError(409, 'Your mailbox is already connected by your administrator.');

  const started = Date.now();
  const { client, sentFolder } = await openMailbox(mailbox, password);
  try {
    return await connectWith(client, sentFolder, person, mailbox, password, state, started);
  } finally {
    await closeMailbox(client);
  }
}

async function connectWith(
  client: ImapFlow,
  sentFolder: string,
  person: Profile,
  mailbox: string,
  password: string,
  state: StoredStatus,
  started: number,
): Promise<MailboxStatus> {
  const { host, port, secure } = imapConfig();

  let credentialId: string | null = null;
  let createdWorkflow: string | null = null;
  let workflowId = state.workflowId;
  try {
    const credential = await n8n<{ id: string; name: string }>('POST', '/credentials', {
      name: `${mailbox} (centrum)`,
      type: 'imap',
      data: { user: mailbox, password, host, port, secure, allowUnauthorizedCerts: false },
    });
    credentialId = credential.id;
    const workflow = buildIngestWorkflow({
      mailbox,
      imapCredential: { id: credential.id, name: credential.name },
      dbCredential: dbCredential(),
      sentFolder,
      // The hub reads the history itself (readHistory); n8n only has to pick up what arrives from now on.
      since: { in: readFrom(null, 1), out: readFrom(null, 1) },
      errorWorkflowId: env('N8N_ERROR_WORKFLOW_ID') ?? '3TIzvOWuUfuIYzFk',
    });
    if (workflowId) {
      try {
        await n8n('POST', `/workflows/${encodeURIComponent(workflowId)}/deactivate`);
        await n8n('PUT', `/workflows/${encodeURIComponent(workflowId)}`, workflow);
      } catch (error) {
        if (!(error instanceof N8nError && error.status === 404)) throw error;
        workflowId = null;
      }
    }
    if (!workflowId) {
      workflowId = createdWorkflow = (await n8n<{ id: string }>('POST', '/workflows', workflow)).id;
    }
    await n8n('POST', `/workflows/${encodeURIComponent(workflowId)}/activate`);
  } catch (error) {
    await failed(mailbox, 'n8n');
    logError('mailbox.connect', error);
    if (createdWorkflow) await remove(`/workflows/${encodeURIComponent(createdWorkflow)}`).catch(() => undefined);
    if (credentialId) await remove(`/credentials/${encodeURIComponent(credentialId)}`).catch(() => undefined);
    throw new HttpError(502, 'Your password is correct, but the mailbox could not be connected right now. Try again in a moment.');
  }

  let finished: StoredStatus;
  try {
    finished = await call<StoredStatus>('connect_finish', {
      p_mailbox: mailbox,
      p_hub_user_id: person.id,
      p_full_name: person.full_name,
      p_credential_id: credentialId,
      p_workflow_id: workflowId,
      p_sent_folder: sentFolder,
      p_history_since: readFrom(null, historyDays()).toISOString().slice(0, 10),
      p_by: person.email,
    });
  } catch (error) {
    // Without a record in the database the workflow would collect mail nobody can disconnect: undo it.
    await remove(`/workflows/${encodeURIComponent(workflowId)}`).catch((e) => logError('mailbox.undo', e));
    await remove(`/credentials/${encodeURIComponent(credentialId)}`).catch((e) => logError('mailbox.undo', e));
    throw error;
  }
  if (state.credentialId && state.credentialId !== credentialId) {
    await remove(`/credentials/${encodeURIComponent(state.credentialId)}`).catch((e) => logError('mailbox.oldCredential', e));
  }
  const history = await historyFrom(client, mailbox, sentFolder, finished.historySince, null, started).catch((error) => {
    // The mailbox is connected; the page continues reading the history with the next request.
    logError('mailbox.history', error);
    return { done: false, saved: 0, read: 0, cursor: null } satisfies HistoryProgress;
  });
  return { ...toStatus(await call<StoredStatus>('status', { p_mailbox: mailbox }), false), history };
}

/** The first day of the history: as stored for the mailbox, otherwise MAILBOX_HISTORY_DAYS back. */
const historyStart = (historySince: string | null) => (historySince ? new Date(`${historySince}T00:00:00Z`) : readFrom(null, historyDays()));

const historyFrom = (client: ImapFlow, mailbox: string, sentFolder: string, historySince: string | null, cursor: HistoryCursor | null, started: number) =>
  readHistory(client, mailbox, sentFolder, historyStart(historySince), cursor, started + HISTORY_BUDGET_MS);

/** Continues reading the history of a connected mailbox (POST …&action=history). */
async function continueHistory(person: Profile, password: string, cursor: HistoryCursor | null): Promise<MailboxStatus> {
  const mailbox = companyMailbox(person);
  imapConfig();
  const state = await call<StoredStatus>('connect_begin', { p_mailbox: mailbox });
  if (state.source !== 'hub' || state.status !== 'connected') throw new HttpError(409, 'Connect your mailbox first.');
  const started = Date.now();
  const { client, sentFolder } = await openMailbox(mailbox, password);
  try {
    const history = await historyFrom(client, mailbox, state.sentFolder ?? sentFolder, state.historySince ?? null, cursor, started);
    return { ...toStatus(await call<StoredStatus>('status', { p_mailbox: mailbox }), false), history };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logError('mailbox.history', error);
    throw new HttpError(502, 'Reading older e-mails stopped. Try again in a moment; nothing is read twice.');
  } finally {
    await closeMailbox(client);
  }
}

async function disconnect(person: Profile): Promise<MailboxStatus> {
  const mailbox = companyMailbox(person);
  const state = await call<StoredStatus>('status', { p_mailbox: mailbox });
  if (state.source === 'manual') throw new HttpError(409, 'Your mailbox was connected by your administrator. Ask them to disconnect it.');
  if (state.source === 'none' || state.status !== 'connected') return toStatus(state, false);
  try {
    if (state.workflowId) await remove(`/workflows/${encodeURIComponent(state.workflowId)}`);
    if (state.credentialId) await remove(`/credentials/${encodeURIComponent(state.credentialId)}`);
  } catch (error) {
    logError('mailbox.disconnect', error);
    throw new HttpError(502, 'The mailbox could not be disconnected right now. Try again in a moment.');
  }
  return toStatus(await call<StoredStatus>('disconnect', { p_mailbox: mailbox, p_by: person.email }), false);
}

// --- handlers -----------------------------------------------------------------------------------------------------

export function mailboxGet(request: Request): Promise<Response> {
  return handle(async () => {
    if (new URL(request.url).searchParams.get('view') === 'all') {
      await requireAdmin(request);
      return json({ mailboxes: await call<MailboxOverview[]>('status_all', {}) });
    }
    const person = await requireUser(request);
    // Until the hub is set up for it (or for people outside the company domains) the card is not shown at all.
    const missing = ['MAIL_IMAP_HOST', 'N8N_API_URL', 'N8N_API_KEY'].filter((name) => !env(name));
    if (missing.length || !isCompanyMailbox(person.email.trim().toLowerCase(), domains())) {
      // Administrators are told what is missing (names only, never values), so they can finish the set-up.
      return json({ available: false, ...(person.role === 'admin' && missing.length ? { missing } : {}) });
    }
    const mailbox = companyMailbox(person);
    const stored = await call<StoredStatus>('status', { p_mailbox: mailbox });
    return json(toStatus(stored, await isStopped(stored)));
  });
}

export function mailboxPost(request: Request): Promise<Response> {
  return handle(async () => {
    const person = await requireUser(request);
    const history = new URL(request.url).searchParams.get('action') === 'history';
    try {
      const body = await readJson(request);
      if (history) {
        const { password, cursor } = historyInput(body);
        return json(await continueHistory(person, password, cursor));
      }
      const { password } = connectInput(body);
      return json(await connect(person, password));
    } catch (error) {
      if (error instanceof MailboxInputError) throw new HttpError(400, error.message);
      throw error;
    }
  });
}

export function mailboxDelete(request: Request): Promise<Response> {
  return handle(async () => json(await disconnect(await requireUser(request))));
}

