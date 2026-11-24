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
import { archiveViewerName, type ArchiveContract, type ArchiveItem } from '../shared/contractsArchive.ts';
import { dayOf, dayStart, monthOf, shiftDay, type CalendarItem, type CalendarWeek } from '../shared/dashboard.ts';
import type { TeamMember } from '../shared/profile.ts';

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

/** Old contracts from the intranet (Archive tab), in the shape contracts_api.archive_list returns. */
export const ARCHIVE: ArchiveItem[] = [
  { id: '13-S-TT-2026', type: 'S', status: 'Approved', archived: false, ownerName: TRADER.name, companyName: 'Old Client SARL', submissionDate: '2026-11-19', currency: 'EUR', amount: 4700, products: 'Xylitol' },
  { id: '40-P-AA-2025', type: 'P', status: 'Approved', archived: false, ownerName: 'Other Trader', companyName: 'Supplier Ltd', submissionDate: '2025-07-02', currency: 'USD', amount: 600, products: 'Pea protein isolate' },
];

function archiveContract(c: ArchiveItem): ArchiveContract {
  return {
    ...c,
    buyer: { companyName: c.companyName, vatId: 'FR12345678901', street: 'Agropole 1', postalCode: '47931', city: 'Agen', countryCode: 'FR', contactPersonFirstName: 'Helen', contactPersonLastName: 'Smith', contactPersonPosition: '-' },
    lines: [{ productName: c.products, productGrade: 'Standard', quantity: '1', unit: 'MT', unitPrice: 4.7, priceUnit: 'KG', currency: c.currency }],
    delivery: { deliveryBasis: 'DDP', city: 'Estillac', countryCode: 'FR', dateFrom: { seconds: Date.UTC(2026, 10, 25, 12) / 1000 }, instructions: '-' },
    paymentTerms: { paymentType: 'Prepayment', usesFactoring: false, prepaymentDetails: { prepaymentDueDate: '2026-11-23T23:00:00Z' } },
    requiredDocuments: ['COA', 'Invoice'],
    representative: 'Bo Board – Chief Executive Officer',
    signedByRepresentative: true,
    linkedContractId: null,
    proformaInvoiceNumber: null,
    vatInvoiceNumber: null,
    shipmentDate: null,
    attachments: [{ type: 'Signed Contract', fileName: 'signed contract.pdf', url: 'http://files.test/signed.pdf', uploadedAt: '2026-11-19T14:38:14Z', uploadedBy: c.ownerName }],
  };
}

/** Team (GET /api/people): two people on the Board, a sales director with two traders, an administrator, a newcomer. */
export function teamOf(): TeamMember[] {
  const member = (p: Pick<TestPerson, 'email' | 'name'>, jobTitle: string, department: string, manager: TestPerson | null): TeamMember => ({
    id: userId(p as TestPerson), email: p.email, name: p.name, jobTitle, department, phone: null, mobile: '+48 600 000 000', linkedin: null,
    officeId: null, managerId: manager ? userId(manager) : null, avatarUrl: null,
  });
  return [
    member(BOARD, 'Chief Executive Officer', 'Board', null),
    member(PARTNER, 'Partner', 'Board', null),
    member(SIGNER, 'Sales Director', 'Trade', BOARD),
    member(TRADER, 'Trader', 'Trade', SIGNER),
    member(TRADER_TWO, 'Junior Trader', 'Trade', SIGNER),
    member(ADMINISTRATION, 'Office Manager', 'Administration', PARTNER),
    member(NEWCOMER, 'Intern', 'Trade', null),
  ];
}
export const PARTNER: TestPerson = { email: 'pia.partner@example.com', name: 'Pia Partner', role: 'admin', apps: [] };
export const TRADER_TWO: TestPerson = { email: 'tia.trade@example.com', name: 'Tia Trade', role: 'user', apps: [] };
export const NEWCOMER: TestPerson = { email: 'nina.new@example.com', name: 'Nina New', role: 'user', apps: [] };

export interface Backend {
  /** Everyone in Team; a test may change it before opening the page. */
  people: TeamMember[];
  contracts: Map<string, Contract>;
  drafts: Map<string, Draft>;
  /** Every POST body the app sent to the contracts API, in order. */
  posts: Record<string, unknown>[];
  /** Signed links the contract screen gets (terms, signature, scan); served by http://files.test in the tests. */
  files: { terms: string | null; signature: string | null; scan: string | null };
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
  const backend = { people: teamOf() };
  const files: Backend['files'] = { terms: null, signature: null, scan: null };

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

  // Files from signed links: a tiny PDF or PNG, whatever the name says.
  await page.route('http://files.test/**', (route) => route.request().url().endsWith('.png')
    ? route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') })
    : route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF\n' }));

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.searchParams.get('resource') === 'dashboard') return json(route, dashboard(url, me));
    if (url.pathname === '/api/news') return json(route, { posts: [] });
    if (url.pathname === '/api/people' && !url.searchParams.has('resource') && request.method() === 'GET') {
      return json(route, { people: backend.people, offices: [], me: userId(me) });
    }
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
        case 'archive': {
          // Same rules as contracts_api.archive_list: a trader sees only their own old contracts, by name.
          const viewerName = archiveViewerName({ name: me.name, ...viewer() });
          const mine = ARCHIVE.filter((c) => viewerName === null || c.ownerName === viewerName);
          const type = url.searchParams.get('type');
          const owner = url.searchParams.get('owner');
          const year = Number(url.searchParams.get('year'));
          const items = mine.filter((c) => (!type || c.type === type) && (!owner || c.ownerName === owner)
            && (!year || c.submissionDate?.startsWith(String(year)))
            && (!q || [c.id, c.companyName, c.products].some((v) => v.toLowerCase().includes(q))));
          return json(route, { total: items.length, items, owners: [...new Set(mine.map((c) => c.ownerName))].sort(), years: [...new Set(mine.map((c) => Number(c.submissionDate?.slice(0, 4))))] });
        }
        case 'archiveOne': {
          const viewerName = archiveViewerName({ name: me.name, ...viewer() });
          const c = ARCHIVE.find((a) => a.id === url.searchParams.get('id') && (viewerName === null || a.ownerName === viewerName));
          return c ? json(route, { contract: archiveContract(c) }) : json(route, { error: 'There is no such contract in the intranet archive, or it belongs to another trader.' }, 404);
        }
        case 'list': return json(route, { items: [...contracts.values()], total: contracts.size });
        case 'one': {
          const c = contracts.get(url.searchParams.get('id') ?? '');
          if (!c) return json(route, { error: 'No such contract.' }, 404);
          return json(route, { contract: c, can: allowedActions(c, viewer()), files });
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
    get people() {
      return backend.people;
    },
    set people(list) {
      backend.people = list;
    },
    contracts,
    drafts,
    posts,
    files,
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

/**
 * The home page's widgets. Calendar: an absence today and tomorrow for everyone with Leave (the type only for an
 * administrator), and the company's Google Calendar (a meeting today at 9:00) only for administrators, as the server.
 */
const atHour = (day: string, hour: number) => new Date(new Date(dayStart(day)).getTime() + hour * 3_600_000).toISOString();

function dashboard(url: URL, me: TestPerson): unknown {
  const month = url.searchParams.get('month') ?? monthOf(new Date());
  const none = { count: 0, eur: 0 };
  switch (url.searchParams.get('widget')) {
    case 'contracts': return { month, sales: none, purchases: none, pending: 0, withoutEur: 0, previous: { month, sales: none, purchases: none } };
    case 'leaderboard': return { month, entries: [] };
    case 'contest': return { result: null };
    case 'calendar': {
      const today = dayOf(new Date());
      const from = url.searchParams.get('from') ?? today;
      const admin = me.role === 'admin';
      const items: CalendarItem[] = from !== today ? [] : [
        { id: 'leave-1', kind: 'absence', title: 'Tom Trader', detail: admin ? 'Business trip' : 'Absent', start: today, end: shiftDay(today, 2), allDay: true, location: null },
        ...(admin ? [{ id: 'event-1', kind: 'event' as const, title: 'Meeting Board', detail: null, start: atHour(today, 9), end: atHour(today, 10), allDay: false, location: 'Rzeszów' }] : []),
      ];
      const week: CalendarWeek = { from, google: admin ? 'on' : null, items };
      return week;
    }
    default: return { error: 'Unknown widget' };
  }
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
