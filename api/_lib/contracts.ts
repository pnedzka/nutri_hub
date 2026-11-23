// Contract generator (/contracts): the trader generates a contract, administration accepts it, Marcin Niećko or a board
// member signs it, the trader sends it with the terms to the client and uploads the scan the client signed. Served by
// api/people.ts with ?resource=contracts (12-function limit). The API is described in shared/contractsApi.ts.
//
// Data and files are in the central database (nutri-central-db, schema contracts_api, private bucket "contracts"), with
// CENTRAL_DB_URL and CENTRAL_DB_SECRET_KEY. Who may take a step is decided here, from profiles.apps of the hub:
//   contracts        traders: create contracts, see their own;
//   contracts-admin  administration (Jadwiga) and the hub's administrators: accept, see all, upload terms and signatures;
//   contracts-sign   Marcin Niećko and the board: sign; above 100 000 EUR net only people of the Board department.

import { randomUUID } from 'node:crypto';
import { canUse, isAvailable, toApps, type AppId } from '../../shared/access.js';
import {
  BOARD_THRESHOLD_EUR,
  LIST_SCOPES,
  STATUS_LABELS,
  TERMS_FILE,
  TERMS_TITLE,
  allowedActions,
  cleanContract,
  contractTotal,
  initialsOf,
  signatureFile,
  todoStatuses,
  type Contract,
  type ContractAction,
  type ContractInput,
  type ContractRequest,
  type ContractSetup,
  type Draft,
  type ListScope,
  type OwnerOption,
  type SettingsFile,
  type Viewer,
} from '../../shared/contractsApi.js';
import { requireUser } from './auth.js';
import { centralDb } from './central.js';
import { appUrl, handle, HttpError, json, readJson } from './http.js';
import { logError } from './monitoring.js';
import { sendMail } from './notify.js';
import { db } from './supabase.js';

export const isContractsRequest = (request: Request) => new URL(request.url).searchParams.get('resource') === 'contracts';

const BUCKET = 'contracts';

interface Member {
  id: string;
  email: string;
  name: string;
  title: string;
  department: string;
  isAdmin: boolean;
  apps: AppId[];
}

/** Everyone with an active account, with what the Contract generator needs to know about them. */
async function members(): Promise<Member[]> {
  const { data, error } = await db().from('profiles').select('id, email, full_name, role, apps, job_title, department').is('deactivated_at', null);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email ?? '').toLowerCase(),
    name: (row.full_name as string | null)?.trim() || String(row.email ?? ''),
    title: (row.job_title as string | null)?.trim() || '',
    department: (row.department as string | null)?.trim() || '',
    isAdmin: row.role === 'admin',
    apps: toApps(row.apps),
  }));
}

const uses = (m: Member, app: AppId) => canUse({ role: m.isAdmin ? 'admin' : 'user', apps: m.apps }, app);
/** People who hold the permission themselves (not only as administrators): they get the e-mails. */
const holds = (m: Member, app: AppId) => m.apps.includes(app);
const isBoard = (m: Member) => m.department.toLowerCase() === 'board';

function viewerOf(m: Member): Viewer {
  return { email: m.email, isContractAdmin: uses(m, 'contracts-admin'), canSign: uses(m, 'contracts-sign'), isBoard: isBoard(m) };
}

/** The signed-in person, if they may use the Contract generator at all. */
async function requireContracts(request: Request): Promise<{ me: Member; people: Member[] }> {
  if (!isAvailable('contracts', process.env.VITE_HUB_MODULES)) throw new HttpError(404, 'Contract generator is not available yet.');
  const profile = await requireUser(request);
  const people = await members();
  const me = people.find((p) => p.id === profile.id);
  if (!me || !(uses(me, 'contracts') || uses(me, 'contracts-admin') || uses(me, 'contracts-sign'))) {
    throw new HttpError(403, "You don't have access to Contract generator. Ask your administrator.");
  }
  return { me, people };
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await centralDb().schema('contracts_api').rpc(fn, args);
  if (!error) return data as T;
  if (error.code === 'P0001') throw new HttpError(409, error.message);
  logError(`contracts.${fn}`, new Error(`contracts_api.${fn} failed (${error.code ?? 'unknown'})`), { code: error.code });
  throw new HttpError(
    error.code?.startsWith('PGRST') ? 503 : 500,
    error.code?.startsWith('PGRST')
      ? 'The central database is not ready for Contract generator yet (contracts_api). Tell your administrator.'
      : 'The central database did not answer. Try again in a moment.',
  );
}

/** Whether this person may see the contract: its owner, administration and the people who sign. */
function maySee(contract: Pick<Contract, 'ownerEmail'>, me: Member): boolean {
  const v = viewerOf(me);
  return contract.ownerEmail === me.email || v.isContractAdmin || v.canSign;
}

async function getContract(id: string): Promise<Contract> {
  const contract = await call<Contract | null>('get', { p_id: id });
  if (!contract) throw new HttpError(404, `Contract ${id} does not exist.`);
  return contract;
}

async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await centralDb().storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return null;
  return data.signedUrl;
}

const safeName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-80) || 'scan.pdf';

/** The owners a contract may get: the person themselves, or (contract administrators) anyone with the app. */
function owners(me: Member, people: Member[]): OwnerOption[] {
  const v = viewerOf(me);
  const list = v.isContractAdmin ? people.filter((p) => uses(p, 'contracts')) : [me];
  return list
    .map((p) => ({ email: p.email, name: p.name, initials: initialsOf(p.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

// ---------------------------------------------------------------------------------------------------------------
// E-mails

function contractMail(request: Request, contract: Contract, to: string[], subject: string, paragraph: string, comment?: string | null) {
  const details: [string, string][] = [
    ['Contract', contract.id],
    [contract.type === 'S' ? 'Buyer' : 'Supplier', contract.companyName],
    ['Value (net)', `${contract.amountNet.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${contract.currency}`],
    ['Trader', contract.ownerName],
    ['Status', STATUS_LABELS[contract.status]],
  ];
  if (contract.enovaOrder) details.push(['enova order', contract.enovaOrder]);
  if (comment) details.push(['Comment', comment]);
  return sendMail(
    {
      to,
      label: 'Contract generator',
      subject,
      paragraphs: [paragraph],
      details,
      button: { label: 'Open the contract', url: `${appUrl(request)}/contracts/${encodeURIComponent(contract.id)}` },
    },
    'contracts',
  );
}

/** Who gets an e-mail after a step, and what it says. */
async function notify(request: Request, contract: Contract, step: ContractAction | 'create' | 'update', actor: Member, people: Member[], comment?: string | null) {
  const admins = people.filter((p) => holds(p, 'contracts-admin'));
  const administration = (admins.length ? admins : people.filter((p) => p.isAdmin)).map((p) => p.email);
  const signers = people.filter((p) => uses(p, 'contracts-sign'));
  const firstSigners = signers.filter((p) => holds(p, 'contracts-sign') && !isBoard(p));
  const board = signers.filter(isBoard).map((p) => p.email);
  const owner = [contract.ownerEmail];
  const kind = contract.type === 'S' ? 'sales' : 'purchase';
  const others = (list: string[]) => list.filter((e) => e !== actor.email);
  switch (step) {
    case 'create':
    case 'update':
      return contractMail(request, contract, others(administration), `New ${kind} contract ${contract.id} to accept`,
        `${actor.name} ${step === 'create' ? 'generated' : 'corrected'} ${kind} contract ${contract.id} for ${contract.companyName}. Enter the order in enova, then accept the contract so it goes for signature.`);
    case 'accept':
      return contractMail(request, contract, others((firstSigners.length ? firstSigners : signers).map((p) => p.email)), `Contract ${contract.id} to sign`,
        contract.boardRequired
          ? `Contract ${contract.id} was accepted by administration. It is above ${BOARD_THRESHOLD_EUR.toLocaleString('en-GB')} EUR net: approve it, then a board member signs it.`
          : `Contract ${contract.id} was accepted by administration and is waiting for your signature.`);
    case 'approve':
      return contractMail(request, contract, others(board), `Contract ${contract.id} to sign (above ${BOARD_THRESHOLD_EUR.toLocaleString('en-GB')} EUR)`,
        `${actor.name} approved contract ${contract.id}. It is above ${BOARD_THRESHOLD_EUR.toLocaleString('en-GB')} EUR net and is waiting for a board member's signature.`);
    case 'sign':
      return contractMail(request, contract, others([...owner, ...administration]), `Contract ${contract.id} is signed`,
        `${actor.name} signed contract ${contract.id}. The trader downloads the contract and the ${TERMS_TITLE[contract.type]}, sends them to the client and uploads the scan the client signed.`);
    case 'return':
      return contractMail(request, contract, others(owner), `Contract ${contract.id} needs corrections`,
        `${actor.name} returned contract ${contract.id} for corrections. Correct it and send it again.`, comment);
    case 'cancel':
      return contractMail(request, contract, others([...owner, ...administration]), `Contract ${contract.id} was cancelled`,
        `${actor.name} cancelled contract ${contract.id}.`, comment);
    case 'client_scan':
      return contractMail(request, contract, others(administration), `Contract ${contract.id} signed by the client`,
        `${actor.name} uploaded the scan of contract ${contract.id} signed by ${contract.companyName}. The invoice can be made in enova.`);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Handlers

export function contractsGet(request: Request): Promise<Response> {
  return handle(async () => {
    const { me, people } = await requireContracts(request);
    const params = new URL(request.url).searchParams;
    const viewer = viewerOf(me);
    switch (params.get('view')) {
      case 'list': {
        const scope = (LIST_SCOPES as readonly string[]).includes(params.get('scope') ?? '') ? (params.get('scope') as ListScope) : 'mine';
        const all = viewer.isContractAdmin || viewer.canSign;
        const statuses = scope === 'todo' ? todoStatuses(viewer) : null;
        if (scope === 'todo' && !statuses?.length) return json({ total: 0, items: [] });
        return json(
          await call('list', {
            p_owner: scope === 'mine' || !all ? me.email : null,
            p_statuses: statuses,
            p_q: params.get('q') || null,
            p_limit: 100,
            p_offset: 0,
          }),
        );
      }
      case 'one': {
        const contract = await getContract(params.get('id') ?? '');
        if (!maySee(contract, me)) throw new HttpError(403, 'This contract belongs to another trader.');
        const can = allowedActions(contract, viewer);
        const signedPerson = contract.signedBy ? contract.signedBy.email : null;
        const [terms, signature, scan] = await Promise.all([
          signedUrl(TERMS_FILE[contract.type]),
          signedPerson ? signedUrl(signatureFile(signedPerson)) : Promise.resolve(null),
          contract.clientScan ? signedUrl(contract.clientScan.path) : Promise.resolve(null),
        ]);
        return json({ contract, can, files: { terms, signature, scan } });
      }
      case 'companies':
        return json({ companies: await call('company_search', { p_q: params.get('q') ?? '', p_limit: 10 }) });
      case 'products':
        return json({ products: await call('product_search', { p_q: params.get('q') ?? '', p_limit: 15 }) });
      case 'cn':
        return json({ codes: await call('cn_search', { p_q: params.get('q') ?? '', p_limit: 20 }) });
      case 'drafts':
        return json({ drafts: await call('draft_list', { p_owner: me.email }) });
      case 'draft': {
        const draft = await getDraft(params.get('id') ?? '', me);
        return json({ draft });
      }
      case 'setup': {
        const list = owners(me, people);
        const type = params.get('type') === 'P' ? 'P' : 'S';
        const owner = list.find((o) => o.email === (params.get('owner') ?? me.email)) ?? list[0];
        const year = Number(params.get('year')) || new Date().getFullYear();
        const numberPreview = owner ? await call<string>('preview_number', { p_type: type, p_initials: owner.initials, p_year: year }) : '';
        const setup: ContractSetup = { numberPreview, owners: list, me: { email: me.email, isContractAdmin: viewer.isContractAdmin, canSign: viewer.canSign } };
        return json(setup);
      }
      case 'files': {
        const signers = people.filter((p) => uses(p, 'contracts-sign') && (viewer.isContractAdmin || p.id === me.id));
        const items: { key: string; label: string }[] = [
          ...(viewer.isContractAdmin
            ? [
                { key: TERMS_FILE.S, label: `${TERMS_TITLE.S} (OWS, PDF)` },
                { key: TERMS_FILE.P, label: `${TERMS_TITLE.P} (OWZ, PDF)` },
              ]
            : []),
          ...signers.map((p) => ({ key: signatureFile(p.email), label: `Signature: ${p.name} (PNG)` })),
        ];
        const files: SettingsFile[] = await Promise.all(items.map(async (f) => ({ ...f, url: await signedUrl(f.key) })));
        return json({ files });
      }
      default:
        throw new HttpError(400, 'Unknown view.');
    }
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A draft of this person (contract administrators may also open the drafts they saved for someone else). */
async function getDraft(id: string, me: Member): Promise<Draft> {
  if (!UUID.test(id)) throw new HttpError(404, 'This draft does not exist.');
  const draft = await call<(Draft & { createdByEmail?: string }) | null>('draft_get', { p_id: id });
  if (!draft) throw new HttpError(404, 'This draft does not exist.');
  if (draft.ownerEmail !== me.email && !viewerOf(me).isContractAdmin) throw new HttpError(403, 'This draft belongs to another trader.');
  return draft;
}

function validInput(raw: unknown): ContractInput {
  const { contract, problems } = cleanContract(raw);
  if (problems.length) throw new HttpError(400, problems[0].message);
  return contract;
}

/** The fields the database keeps in columns, next to the content. */
function meta(input: ContractInput) {
  return {
    type: input.type,
    submissionDate: input.submissionDate,
    companyId: input.companyId,
    companyName: input.party.companyName,
    currency: input.currency,
    amountNet: contractTotal(input.products),
    factoring: input.payment.factoring,
  };
}

/** Remembers the CN codes at the catalogue products (only where a product has none yet); a failure never blocks a contract. */
async function learnCn(data: Contract['data']) {
  if (!data.products.some((line) => line.productId && line.cnCode)) return;
  try {
    await call('learn_cn', { p_data: data });
  } catch {
    // logged by call()
  }
}

const content = ({ party, products, delivery, payment, documents }: ContractInput) => ({ party, products, delivery, payment, documents });

export function contractsPost(request: Request): Promise<Response> {
  return handle(async () => {
    const { me, people } = await requireContracts(request);
    const viewer = viewerOf(me);
    const body = await readJson<ContractRequest>(request);
    const actor = { email: me.email, name: me.name };

    if (body.action === 'create') {
      if (!uses(me, 'contracts')) throw new HttpError(403, 'Only traders with Contract generator can create contracts.');
      const input = validInput(body.contract);
      const owner = owners(me, people).find((o) => o.email === (input.ownerEmail || me.email));
      if (!owner) throw new HttpError(400, 'Choose the trader who owns the contract.');
      const contract = await call<Contract>('create_contract', { p_data: content(input), p_meta: meta(input), p_owner: owner, p_actor: actor });
      await learnCn(contract.data);
      if (body.draftId && UUID.test(body.draftId)) {
        await getDraft(body.draftId, me).then(() => call('draft_delete', { p_id: body.draftId }), () => undefined);
      }
      await notify(request, contract, 'create', me, people);
      return json({ contract });
    }

    if (body.action === 'saveDraft') {
      if (!uses(me, 'contracts')) throw new HttpError(403, 'Only traders with Contract generator can create contracts.');
      // A draft is saved as it is (problems are shown when it is sent), only cleaned of anything unexpected.
      const { contract: input } = cleanContract(body.contract);
      const owner = owners(me, people).find((o) => o.email === (input.ownerEmail || me.email)) ?? owners(me, people).find((o) => o.email === me.email);
      if (!owner) throw new HttpError(400, 'Choose the trader who owns the contract.');
      if (body.id) await getDraft(body.id, me);
      const draft = await call<Draft>('draft_save', { p_id: body.id || null, p_owner: owner.email, p_actor: me.email, p_data: { ...input, ownerEmail: owner.email } });
      return json({ draft });
    }

    if (body.action === 'deleteDraft') {
      await getDraft(body.id, me);
      await call('draft_delete', { p_id: body.id });
      return json({ ok: true });
    }

    if (body.action === 'settingsUploadUrl') {
      const key = String(body.key ?? '');
      const allowed = (viewer.isContractAdmin && (key === TERMS_FILE.S || key === TERMS_FILE.P || /^signatures\/[^/]+\.png$/.test(key))) || key === signatureFile(me.email);
      if (!allowed || (key.startsWith('signatures/') && !people.some((p) => uses(p, 'contracts-sign') && signatureFile(p.email) === key))) {
        throw new HttpError(403, 'You cannot change this file.');
      }
      const { data, error } = await centralDb().storage.from(BUCKET).createSignedUploadUrl(key, { upsert: true });
      if (error) throw error;
      return json({ path: key, token: data.token, signedUrl: data.signedUrl });
    }

    const id = String((body as { id?: unknown }).id ?? '');
    const current = await getContract(id);
    if (!maySee(current, me)) throw new HttpError(403, 'This contract belongs to another trader.');
    const can = allowedActions(current, viewer);
    const need = (action: ContractAction) => {
      if (!can.includes(action)) throw new HttpError(403, 'You cannot take this step on this contract now.');
    };

    switch (body.action) {
      case 'update': {
        need('edit');
        const input = validInput(body.contract);
        const contract = await call<Contract>('update_contract', { p_id: id, p_data: content(input), p_meta: { ...meta(input), type: current.type }, p_actor: actor });
        await learnCn(contract.data);
        await notify(request, contract, 'update', me, people);
        return json({ contract });
      }
      case 'accept':
      case 'approve':
      case 'sign':
      case 'return':
      case 'cancel': {
        need(body.action);
        const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : null;
        const extra: Record<string, unknown> = {};
        if (body.action === 'accept') extra.enovaOrder = String((body as { enovaOrder?: unknown }).enovaOrder ?? '').trim().slice(0, 60);
        if (body.action === 'sign') extra.title = me.title || (isBoard(me) ? 'Board Member' : '');
        const contract = await call<Contract>('act', { p_id: id, p_action: body.action, p_actor: actor, p_comment: comment, p_extra: extra });
        await notify(request, contract, body.action, me, people, comment);
        return json({ contract });
      }
      case 'scanUploadUrl': {
        need('client_scan');
        const name = safeName(String(body.fileName ?? 'scan.pdf'));
        if (!/\.(pdf|jpe?g|png)$/i.test(name)) throw new HttpError(400, 'Upload the scan as PDF, JPG or PNG.');
        const path = `scans/${id}/${randomUUID()}-${name}`;
        const { data, error } = await centralDb().storage.from(BUCKET).createSignedUploadUrl(path);
        if (error) throw error;
        return json({ path, token: data.token, signedUrl: data.signedUrl });
      }
      case 'client_scan': {
        need('client_scan');
        const path = String(body.path ?? '');
        if (!path.startsWith(`scans/${id}/`)) throw new HttpError(400, 'The scan was not uploaded.');
        const contract = await call<Contract>('act', {
          p_id: id,
          p_action: 'client_scan',
          p_actor: actor,
          p_comment: null,
          p_extra: { path, fileName: String(body.fileName ?? '').slice(0, 120) },
        });
        await notify(request, contract, 'client_scan', me, people);
        return json({ contract });
      }
      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}

