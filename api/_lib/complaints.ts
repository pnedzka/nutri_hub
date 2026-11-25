// Complaints (/complaints): a trader or administration registers a client's complaint from the sales contract number,
// the handler (by default the person who registered it; administration may assign someone else) works it through
// Open → Investigating → With supplier → Resolved → Closed. Served by api/people.ts with ?resource=complaints
// (12-function limit). Shapes and rules: shared/complaintsApi.ts.
//
// Data and files are in the central database (nutri-central-db, schema complaints_api, private bucket "complaints"),
// with CENTRAL_DB_URL and CENTRAL_DB_SECRET_KEY. Who may take a step is decided here, from profiles.apps of the hub:
//   complaints        registers complaints; sees the ones they registered, handle or that concern their contract;
//   complaints-admin  administration (Jadwiga Woźny, decision of 25.11.2026): sees and handles all, assigns, cancels.

import { randomUUID } from 'node:crypto';
import { canUse, isAvailable, toApps, type AppId } from '../../shared/access.js';
import {
  FILE_CATEGORIES,
  LIST_SCOPES,
  ACTIVE_STATUSES,
  allowedActions,
  cleanComplaint,
  cleanDetails,
  cleanStatusChange,
  maySee,
  nextStatuses,
  normalizeContractId,
  safeFileName,
  type Complaint,
  type ComplaintAction,
  type ComplaintSetup,
  type ContractInfo,
  type FileCategory,
  type ListScope,
  type Person,
  type Viewer,
} from '../../shared/complaintsApi.js';
import { requireUser } from './auth.js';
import { centralDb } from './central.js';
import { planComplaintNotice, toNotice, type ComplaintStep } from './complaintNotices.js';
import { appUrl, handle, HttpError, json, readJson } from './http.js';
import { logError } from './monitoring.js';
import { notify } from './notifications.js';
import { db } from './supabase.js';

export const isComplaintsRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'complaints';

const BUCKET = 'complaints';

interface Member {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  apps: AppId[];
}

async function members(): Promise<Member[]> {
  const { data, error } = await db().from('profiles').select('id, email, full_name, role, apps').is('deactivated_at', null);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email ?? '').toLowerCase(),
    name: (row.full_name as string | null)?.trim() || String(row.email ?? ''),
    isAdmin: row.role === 'admin',
    apps: toApps(row.apps),
  }));
}

const uses = (m: Member, app: AppId) => canUse({ role: m.isAdmin ? 'admin' : 'user', apps: m.apps }, app);
const viewerOf = (m: Member): Viewer => ({ email: m.email, isComplaintAdmin: uses(m, 'complaints-admin') });

/** The module's administration for notifications: people holding complaints-admin, else the hub's administrators. */
function adminEmails(people: Member[]): string[] {
  const holders = people.filter((p) => p.apps.includes('complaints-admin'));
  return (holders.length ? holders : people.filter((p) => p.isAdmin)).map((p) => p.email);
}

async function requireComplaints(request: Request): Promise<{ me: Member; people: Member[] }> {
  if (!isAvailable('complaints', process.env.VITE_HUB_MODULES)) throw new HttpError(404, 'Complaints are not available yet.');
  const profile = await requireUser(request);
  const people = await members();
  const me = people.find((p) => p.id === profile.id);
  if (!me || !uses(me, 'complaints')) throw new HttpError(403, "You don't have access to Complaints. Ask your administrator.");
  return { me, people };
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await centralDb().schema('complaints_api').rpc(fn, args);
  if (!error) return data as T;
  if (error.code === 'P0001') throw new HttpError(409, error.message);
  logError(`complaints.${fn}`, new Error(`complaints_api.${fn} failed (${error.code ?? 'unknown'})`), { code: error.code });
  throw new HttpError(
    error.code?.startsWith('PGRST') ? 503 : 500,
    error.code?.startsWith('PGRST')
      ? 'The central database is not ready for Complaints yet (complaints_api). Tell your administrator.'
      : 'The central database did not answer. Try again in a moment.',
  );
}

async function getComplaint(id: string): Promise<Complaint> {
  const complaint = id ? await call<Complaint | null>('get', { p_id: id }) : null;
  if (!complaint) throw new HttpError(404, `Complaint ${id} does not exist.`);
  return complaint;
}

/** A person of the hub by the name the intranet knows (intranet contracts have no e-mail). */
function byName(people: Member[], name: string): Member | undefined {
  const wanted = name.trim().toLowerCase();
  return wanted ? people.find((p) => p.name.toLowerCase() === wanted) : undefined;
}

/** The owner of a contract as a person of the hub (by e-mail for the Contract generator, by name for the intranet). */
function ownerOf(info: ContractInfo | null, people: Member[]): Person | null {
  if (!info || !info.ownerName) return null;
  const email = info.ownerEmail?.toLowerCase();
  const m = (email && people.find((p) => p.email === email)) || byName(people, info.ownerName);
  return { email: m?.email ?? '', name: m?.name ?? info.ownerName };
}

const lookup = (id: string) => (id ? call<ContractInfo | null>('contract_lookup', { p_id: id }) : Promise.resolve(null));

async function notifyStep(request: Request, c: Complaint, step: ComplaintStep, me: Member, people: Member[], extra?: { comment?: string | null; fileName?: string }) {
  try {
    const planned = planComplaintNotice(c, step, me, adminEmails(people), extra);
    if (!planned) return;
    const recipients = people.map((p) => ({ id: p.id, email: p.email, name: p.name, canSee: uses(p, 'complaints') && maySee(c, viewerOf(p)) }));
    await notify(appUrl(request), toNotice(planned, recipients, me.id));
  } catch (error) {
    logError('complaints.notify', error, { step });
  }
}

async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await centralDb().storage.from(BUCKET).createSignedUrl(path, 600);
  return error ? null : data.signedUrl;
}

export function complaintsGet(request: Request): Promise<Response> {
  return handle(async () => {
    const { me, people } = await requireComplaints(request);
    const viewer = viewerOf(me);
    const params = new URL(request.url).searchParams;
    switch (params.get('view')) {
      case 'setup': {
        const handlers = people
          .filter((p) => uses(p, 'complaints'))
          .map((p) => ({ email: p.email, name: p.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
        const setup: ComplaintSetup = { me: { ...viewer, name: me.name }, handlers };
        return json(setup);
      }
      case 'list': {
        const requested = params.get('scope') ?? '';
        const scope: ListScope = (LIST_SCOPES as readonly string[]).includes(requested) ? (requested as ListScope) : 'mine';
        const all = viewer.isComplaintAdmin && scope !== 'mine';
        return json(
          await call('list', {
            p_email: all ? null : me.email,
            p_statuses: scope === 'open' ? ACTIVE_STATUSES : null,
            p_q: params.get('q') || null,
            p_limit: 100,
            p_offset: Math.max(0, Number(params.get('offset')) || 0),
          }),
        );
      }
      case 'one': {
        const complaint = await getComplaint(params.get('id') ?? '');
        if (!maySee(complaint, viewer)) throw new HttpError(403, 'This complaint does not concern you.');
        const files = await Promise.all(complaint.files.map(async (f) => ({ ...f, url: await signedUrl(f.path) })));
        return json({ complaint: { ...complaint, files }, can: allowedActions(complaint, viewer), next: nextStatuses(complaint, viewer) });
      }
      case 'contract': {
        const id = normalizeContractId(params.get('id'));
        const info = await lookup(id);
        return json({ contract: info ? { ...info, owner: ownerOf(info, people) } : null });
      }
      default:
        throw new HttpError(400, 'Unknown view.');
    }
  });
}

type Body = { action?: string; id?: unknown; [key: string]: unknown };

export function complaintsPost(request: Request): Promise<Response> {
  return handle(async () => {
    const { me, people } = await requireComplaints(request);
    const viewer = viewerOf(me);
    const body = await readJson<Body>(request);
    const actor = { email: me.email, name: me.name };

    if (body.action === 'create') {
      const { complaint: input, problems } = cleanComplaint(body.complaint);
      if (problems.length) throw new HttpError(400, problems[0].message);
      const [sales, purchase] = await Promise.all([lookup(input.salesContractId), lookup(input.purchaseContractId)]);
      if (!sales) throw new HttpError(400, `There is no sales contract ${input.salesContractId} in Contracts or in the intranet. Check the number.`);
      if (input.purchaseContractId && !purchase) throw new HttpError(400, `There is no purchase contract ${input.purchaseContractId}. Check the number or leave it empty.`);
      const complaint = await call<Complaint>('create_complaint', {
        p_data: {
          ...input,
          clientName: sales.companyName,
          supplierName: purchase?.companyName ?? '',
          productName: sales.products || purchase?.products || '',
          trader: ownerOf(sales, people),
          purchaseOwner: ownerOf(purchase, people),
        },
        p_actor: actor,
      });
      await notifyStep(request, { ...complaint, files: [], events: [] }, 'created', me, people);
      return json({ complaint });
    }

    const id = String(body.id ?? '');
    const current = await getComplaint(id);
    if (!maySee(current, viewer)) throw new HttpError(403, 'This complaint does not concern you.');
    const can = allowedActions(current, viewer);
    const need = (action: ComplaintAction) => {
      if (!can.includes(action)) throw new HttpError(403, 'You cannot take this step on this complaint now.');
    };
    const done = (complaint: Complaint) => json({ complaint });

    switch (body.action) {
      case 'details': {
        need('edit');
        const { details, problems } = cleanDetails(body.details);
        if (problems.length) throw new HttpError(400, problems[0].message);
        return done(await call<Complaint>('update_details', { p_id: id, p_details: details, p_actor: actor }));
      }
      case 'status': {
        need('status');
        const { change, problems } = cleanStatusChange(body);
        if (problems.length) throw new HttpError(400, problems[0].message);
        if (!nextStatuses(current, viewer).includes(change.to)) throw new HttpError(409, 'This status cannot be chosen now. Refresh the page.');
        const complaint = await call<Complaint>('set_status', { p_id: id, p_from: current.status, p_to: change.to, p_change: change, p_actor: actor });
        await notifyStep(request, { ...current, ...complaint }, 'status', me, people, { comment: change.comment });
        return done(complaint);
      }
      case 'cancel': {
        need('cancel');
        const comment = String(body.comment ?? '').trim().slice(0, 2000);
        if (!comment) throw new HttpError(400, 'Write why the complaint is cancelled.');
        const complaint = await call<Complaint>('set_status', { p_id: id, p_from: current.status, p_to: 'cancelled', p_change: { comment }, p_actor: actor });
        await notifyStep(request, { ...current, ...complaint }, 'cancelled', me, people, { comment });
        return done(complaint);
      }
      case 'assign': {
        need('assign');
        const handler = people.find((p) => p.email === String(body.email ?? '').toLowerCase() && uses(p, 'complaints'));
        if (!handler) throw new HttpError(400, 'Choose a person with access to Complaints.');
        const complaint = await call<Complaint>('assign', { p_id: id, p_handler: { email: handler.email, name: handler.name }, p_actor: actor });
        await notifyStep(request, { ...current, ...complaint }, 'assigned', me, people);
        return done(complaint);
      }
      case 'comment': {
        need('comment');
        const comment = String(body.comment ?? '').trim().slice(0, 4000);
        if (!comment) throw new HttpError(400, 'Write a comment.');
        const complaint = await call<Complaint>('add_comment', { p_id: id, p_comment: comment, p_actor: actor });
        await notifyStep(request, { ...current, ...complaint }, 'comment', me, people, { comment });
        return done(complaint);
      }
      case 'uploadUrl': {
        need('attach');
        const name = safeFileName(String(body.fileName ?? 'file'));
        const path = `${id}/${randomUUID()}-${name}`;
        const { data, error } = await centralDb().storage.from(BUCKET).createSignedUploadUrl(path);
        if (error) throw error;
        return json({ path, token: data.token, signedUrl: data.signedUrl });
      }
      case 'attach': {
        need('attach');
        const path = String(body.path ?? '');
        if (!path.startsWith(`${id}/`)) throw new HttpError(400, 'The file was not uploaded.');
        const category: FileCategory = (FILE_CATEGORIES as readonly string[]).includes(String(body.category)) ? (body.category as FileCategory) : 'other';
        const fileName = String(body.fileName ?? '').trim().slice(0, 160) || path.split('/').pop()!;
        const complaint = await call<Complaint>('add_file', { p_id: id, p_file: { category, fileName, path }, p_actor: actor });
        await notifyStep(request, { ...current, ...complaint }, 'file', me, people, { fileName });
        return done(complaint);
      }
      case 'removeFile': {
        need('attach');
        const fileId = Number(body.fileId);
        const file = current.files.find((f) => f.id === fileId);
        if (!file) throw new HttpError(404, 'This file is not in the complaint.');
        // Only the person who uploaded it or the handler removes a file.
        if (file.uploadedBy.email !== me.email && !can.includes('edit')) throw new HttpError(403, 'Only the person who added the file or the handler can remove it.');
        return done(await call<Complaint>('remove_file', { p_id: id, p_file_id: fileId, p_actor: actor }));
      }
      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}
