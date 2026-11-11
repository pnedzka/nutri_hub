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
  isCompanyMailbox,
  pickSentFolder,
  readFrom,
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

/** Logs in to the mailbox to check the password, and finds the Sent folder. Reads nothing else. */
async function checkLogin(mailbox: string, password: string): Promise<{ sentFolder: string }> {
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
    socketTimeout: 15_000,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    const folders = await client.list();
    return { sentFolder: pickSentFolder(folders.map((f) => ({ path: f.path, specialUse: f.specialUse }))) };
  } catch (error) {
    if ((error as { authenticationFailed?: boolean }).authenticationFailed) {
      await failed(mailbox, 'wrong_password');
      throw new HttpError(400, 'The mail server did not accept this password. Use the password you sign in to your company e-mail with.');
    }
    await failed(mailbox, 'unreachable');
    logError('mailbox.imap', new Error('The mail server did not answer'), { code: (error as { code?: string }).code });
    throw new HttpError(502, 'The mail server did not answer. Try again in a moment.');
  } finally {
    await client.logout().catch(() => client.close());
  }
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

  const { sentFolder } = await checkLogin(mailbox, password);
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
      since: { in: readFrom(state.lastInAt, historyDays()), out: readFrom(state.lastOutAt, historyDays()) },
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
  return toStatus(finished, false);
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
    const ready = env('MAIL_IMAP_HOST') && env('N8N_API_URL') && env('N8N_API_KEY');
    if (!ready || !isCompanyMailbox(person.email.trim().toLowerCase(), domains())) return json({ available: false });
    const mailbox = companyMailbox(person);
    const stored = await call<StoredStatus>('status', { p_mailbox: mailbox });
    return json(toStatus(stored, await isStopped(stored)));
  });
}

export function mailboxPost(request: Request): Promise<Response> {
  return handle(async () => {
    const person = await requireUser(request);
    let password: string;
    try {
      ({ password } = connectInput(await readJson(request)));
    } catch (error) {
      if (error instanceof MailboxInputError) throw new HttpError(400, error.message);
      throw error;
    }
    return json(await connect(person, password));
  });
}

export function mailboxDelete(request: Request): Promise<Response> {
  return handle(async () => json(await disconnect(await requireUser(request))));
}

