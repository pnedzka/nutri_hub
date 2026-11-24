/// <reference lib="dom" />
import type { Page, Route } from '@playwright/test';
import {
  BOARD_THRESHOLD_EUR,
  allowedActions,
  cleanContract,
  contractTotal,
  type Contract,
  type ContractEvent,
  type ContractSetup,
  type Draft,
  type ProductOption,
} from '../shared/contractsApi.ts';

// An in-memory stand-in for the hub's API and Supabase, so the functional tests drive the real app without a database.
// The contract generator's requests are checked with the same rules as the server (cleanContract, allowedActions), so a
// form that sends what the server would refuse fails the test, not production.

export interface TestPerson {
  email: string;
  name: string;
  role: 'admin' | 'user';
  apps: string[];
  /** Contract administrator (Jadwiga), signer (Marcin) and board, as the server works them out. */
  isContractAdmin?: boolean;
  canSign?: boolean;
  isBoard?: boolean;
}

export const TRADER: TestPerson = { email: 'tom.trader@example.com', name: 'Tom Trader', role: 'user', apps: ['contracts'] };
export const ADMINISTRATION: TestPerson = {
  email: 'ada.admin@example.com',
  name: 'Ada Admin',
  role: 'user',
  apps: ['contracts', 'contracts-admin'],
  isContractAdmin: true,
};
export const SIGNER: TestPerson = { email: 'sam.signer@example.com', name: 'Sam Signer', role: 'user', apps: ['contracts', 'contracts-sign'], canSign: true };

export const BOARD: TestPerson = {
  email: 'bo.board@example.com', name: 'Bo Board', role: 'admin', apps: [], isContractAdmin: true, canSign: true, isBoard: true,
};

export const PRODUCTS: ProductOption[] = [
  { id: 11, name: 'Whey protein concentrate 80%', enovaCode: null, cnCode: '04041002' },
  { id: 12, name: 'Pea protein isolate', enovaCode: null, cnCode: null },
];

export interface Backend {
  contracts: Map<string, Contract>;
  drafts: Map<string, Draft>;
  /** Every POST body the app sent to the contracts API, in order. */
  posts: Record<string, unknown>[];
  /** Signs in as this person (call before page.goto). */
  as(person: TestPerson): Promise<void>;
  /** Adds a contract as if another person had generated it. */
  seed(contract: Partial<Contract> & Pick<Contract, 'id'>): Contract;
}

const now = () => new Date().toISOString();

export function sampleContract(patch: Partial<Contract> & Pick<Contract, 'id'>): Contract {
  const data: Contract['data'] = {
    party: {
      companyName: 'Acme Foods GmbH', vatId: 'DE123456789', street: 'Hauptstrasse 1', postalCode: '10115', city: 'Berlin', country: 'DE',
      contactFirstName: 'Anna', contactLastName: 'Schmidt', contactPosition: '', email: 'anna@example.com', phone: '+49 30 123456',
    },
    products: [{ name: 'Whey protein concentrate 80%', productId: 11, cnCode: '04041002', notes: 'Big bags', quantity: 1000, unit: 'KG', unitPrice: 4.25, priceUnit: 'KG' }],
    delivery: {
      incoterm: 'DAP', byAir: false, street: 'Hauptstrasse 1', postalCode: '10115', city: 'Berlin', country: 'DE',
      dateFrom: '2026-12-01', dateTo: '2026-12-15', instructions: '', contactName: '', contactEmail: '', contactPhone: '',
    },
    payment: { prepaymentPercent: 30, days: 30, from: 'delivery', factoring: false, notes: '' },
    documents: ['Invoice', 'COA'],
  };
  const amount = contractTotal(data.products);
  return {
    type: 'S', status: 'admin_review', ownerEmail: TRADER.email, ownerName: TRADER.name, createdByEmail: TRADER.email,
    submissionDate: '2026-11-24', companyId: 1, companyName: data.party.companyName, currency: 'EUR', amountNet: amount,
    fxEurPerUnit: 1, amountEur: amount, boardRequired: amount > BOARD_THRESHOLD_EUR, factoring: false, data, version: 1,
    enovaOrder: null, acceptedBy: null, approvedBy: null, signedBy: null, clientScan: null, returnComment: null,
    createdAt: now(), updatedAt: now(), events: [],
    ...patch,
  };
}

const NEXT_STATUS: Record<string, (c: Contract) => Contract['status']> = {
  accept: () => 'signature',
  approve: () => 'board',
  sign: () => 'signed',
  return: () => 'returned',
  cancel: () => 'cancelled',
};

export async function startBackend(page: Page): Promise<Backend> {
  let me: TestPerson = TRADER;
  const contracts = new Map<string, Contract>();
  const drafts = new Map<string, Draft>();
  const posts: Record<string, unknown>[] = [];
  let seq = 14;

  const viewer = () => ({ email: me.email, isContractAdmin: Boolean(me.isContractAdmin), canSign: Boolean(me.canSign), isBoard: Boolean(me.isBoard) });
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const event = (c: Contract, action: string, comment: string | null = null): ContractEvent => ({
    at: now(), actorEmail: me.email, actorName: me.name, action, fromStatus: c.status, toStatus: c.status, comment,
  });
  const setup = (): ContractSetup => ({
    numberPreview: `${seq}-S-TT-2026`,
    owners: me.isContractAdmin ? [TRADER, ADMINISTRATION].map((p) => ({ email: p.email, name: p.name, initials: 'TT' })) : [{ email: me.email, name: me.name, initials: 'TT' }],
    me: viewer(),
  } as ContractSetup);

  // Supabase: the signed-in person's auth user and own profiles row; nothing else is used by these screens.
  await page.route('http://supabase.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/user') return json(route, authUser(me));
    if (url.pathname.startsWith('/rest/v1/profiles')) {
      const row = { id: userId(me), full_name: me.name, role: me.role, apps: me.apps, avatar_path: null, department: '' };
      const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
      return json(route, single ? row : [row]);
    }
    if (url.pathname.startsWith('/rest/v1/')) return json(route, []);
    if (url.pathname.startsWith('/realtime/')) return route.abort();
    return json(route, {});
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.searchParams.get('resource') !== 'contracts') return json(route, request.method() === 'GET' ? {} : { ok: true });

    if (request.method() === 'GET') {
      const view = url.searchParams.get('view');
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      switch (view) {
        case 'setup': return json(route, setup());
        case 'companies': return json(route, { companies: [] });
        case 'products': return json(route, { products: PRODUCTS.filter((p) => q && p.name.toLowerCase().includes(q)) });
        case 'cn': return json(route, { codes: q ? [{ kind: 'hs', code: '040410', label: 'Whey and modified whey' }] : [] });
        case 'drafts': return json(route, { drafts: [...drafts.values()].map((d) => ({ id: d.id, type: d.type, companyName: d.companyName, updatedAt: d.updatedAt })) });
        case 'draft': {
          const d = drafts.get(url.searchParams.get('id') ?? '');
          return d ? json(route, { draft: d }) : json(route, { error: 'No such draft.' }, 404);
        }
        case 'files': return json(route, { files: [] });
        case 'list': return json(route, { items: [...contracts.values()], total: contracts.size });
        case 'one': {
          const c = contracts.get(url.searchParams.get('id') ?? '');
          if (!c) return json(route, { error: 'No such contract.' }, 404);
          return json(route, { contract: c, can: allowedActions(c, viewer()), files: { terms: null, signature: null, scan: null } });
        }
        default: return json(route, { error: `Unknown view ${view}` }, 400);
      }
    }

    const body = request.postDataJSON() as Record<string, unknown>;
    posts.push(body);
    const action = String(body.action);
    if (action === 'create') {
      // The server validates the contract again: the same function, the same date.
      const { contract: input, problems } = cleanContract(body.contract);
      if (problems.length) return json(route, { error: problems[0].message, problems }, 400);
      const id = `${seq++}-${input.type}-TT-2026`;
      const amount = contractTotal(input.products);
      const c = sampleContract({
        id, type: input.type, currency: input.currency, companyName: input.party.companyName, amountNet: amount, amountEur: amount,
        boardRequired: amount > BOARD_THRESHOLD_EUR, factoring: input.payment.factoring, submissionDate: input.submissionDate,
        data: { party: input.party, products: input.products, delivery: input.delivery, payment: input.payment, documents: input.documents },
      });
      c.events = [event(c, 'create')];
      contracts.set(id, c);
      if (typeof body.draftId === 'string') drafts.delete(body.draftId);
      return json(route, { contract: c });
    }
    if (action === 'saveDraft') {
      const id = typeof body.id === 'string' ? body.id : `0000000${drafts.size + 1}-0000-4000-8000-000000000000`.slice(-36);
      const data = body.contract as Draft['data'];
      const draft = { id, type: data.type, companyName: data.party?.companyName ?? '', data, updatedAt: now(), createdAt: now() } as unknown as Draft;
      drafts.set(id, draft);
      return json(route, { draft });
    }
    if (action === 'deleteDraft') {
      drafts.delete(String(body.id));
      return json(route, { ok: true });
    }

    const c = contracts.get(String(body.id));
    if (!c) return json(route, { error: 'No such contract.' }, 404);
    if (!allowedActions(c, viewer()).includes(action as never)) return json(route, { error: 'You cannot take this step on this contract now.' }, 403);
    if (action === 'accept') {
      const order = String(body.enovaOrder ?? '').trim();
      if (!order) return json(route, { error: 'Enter the internal order number from enova.' }, 400);
      c.enovaOrder = order;
      c.acceptedBy = { email: me.email, name: me.name, at: now() };
    }
    if (action === 'order_number') {
      c.enovaOrder = String(body.enovaOrder ?? '').trim();
      c.events = [...(c.events ?? []), event(c, 'order_number', c.enovaOrder)];
      return json(route, { contract: c });
    }
    if (action === 'return' && !String(body.comment ?? '').trim()) return json(route, { error: 'Write what needs to be corrected.' }, 400);
    const next = NEXT_STATUS[action];
    if (!next) return json(route, { error: `Unknown action ${action}` }, 400);
    c.events = [...(c.events ?? []), { ...event(c, action, (body.comment as string) || null), toStatus: next(c) }];
    c.status = next(c);
    if (action === 'return') c.returnComment = String(body.comment);
    return json(route, { contract: c });
  });

  return {
    contracts,
    drafts,
    posts,
    async as(person) {
      me = person;
      await signIn(page, person);
    },
    seed(patch) {
      const c = sampleContract(patch);
      contracts.set(c.id, c);
      return c;
    },
  };
}

const userId = (p: TestPerson) => `00000000-0000-4000-8000-${Buffer.from(p.email).toString('hex').slice(0, 12).padEnd(12, '0')}`;

function authUser(p: TestPerson) {
  return { id: userId(p), aud: 'authenticated', role: 'authenticated', email: p.email, app_metadata: {}, user_metadata: { full_name: p.name }, created_at: '2026-01-01T00:00:00Z' };
}

/** A stored Supabase session that is valid for an hour, so the client does not refresh it (no network needed). */
async function signIn(page: Page, p: TestPerson) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const session = { access_token: 'e2e-token', token_type: 'bearer', expires_in: 3600, expires_at: expires, refresh_token: 'e2e-refresh', user: authUser(p) };
  await page.addInitScript((value) => window.localStorage.setItem('sb-supabase-auth-token', value), JSON.stringify(session));
}
