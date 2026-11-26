/// <reference lib="dom" />
import { expect, test, type Page, type Route } from '@playwright/test';
import {
  allowedActions,
  cleanComplaint,
  cleanDetails,
  cleanStatusChange,
  complaintNumber,
  maySee,
  nextStatuses,
  type Complaint,
  type ComplaintEvent,
  type Viewer,
} from '../shared/complaintsApi.ts';
import { startBackend, type Backend, type TestPerson } from './backend';

// Complaints: the screens typed and clicked in a real browser. The complaints API is an in-memory stand-in that checks
// every request with the server's own rules (cleanComplaint, allowedActions, nextStatuses), so a screen that sends what
// the server would refuse fails here. All names and numbers are made up.

const TRADER: TestPerson = { email: 'tom.trader@example.com', name: 'Tom Trader', role: 'user', apps: ['complaints'] };
const OTHER: TestPerson = { email: 'tia.trade@example.com', name: 'Tia Trade', role: 'user', apps: ['complaints'] };
const HANDLER: TestPerson = { email: 'ada.admin@example.com', name: 'Ada Admin', role: 'user', apps: ['complaints', 'complaints-admin'] };

const CONTRACTS: Record<string, { companyName: string; products: string; owner: TestPerson }> = {
  '64-S-TT-2026': { companyName: 'Acme Foods GmbH', products: 'Whey protein concentrate 80%', owner: TRADER },
  '100-P-TT-2026': { companyName: 'Supplier Ltd', products: 'Whey protein concentrate 80%', owner: OTHER },
};

interface Stub {
  complaints: Map<string, Complaint>;
  posts: Record<string, unknown>[];
  seed(patch: Partial<Complaint>): Complaint;
}

const now = () => new Date().toISOString();
const person = (p: TestPerson) => ({ email: p.email, name: p.name });

async function complaintsApi(page: Page, who: () => TestPerson): Promise<Stub> {
  const complaints = new Map<string, Complaint>();
  const posts: Record<string, unknown>[] = [];
  let seq = 1;
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const viewer = (): Viewer => ({ email: who().email, isComplaintAdmin: who().apps.includes('complaints-admin') });
  const event = (action: string, patch: Partial<ComplaintEvent> = {}): ComplaintEvent => ({
    at: now(), actorEmail: who().email, actorName: who().name, action, fromStatus: null, toStatus: null, comment: null, ...patch,
  });
  const make = (patch: Partial<Complaint>): Complaint => ({
    id: complaintNumber(2026, seq++), status: 'open', type: 'quality', salesContractId: '64-S-TT-2026', purchaseContractId: '',
    clientName: 'Acme Foods GmbH', supplierName: '', productName: 'Whey protein concentrate 80%', handler: person(TRADER),
    createdAt: now(), updatedAt: now(), description: 'Lumps in two big bags.', trader: person(TRADER), purchaseOwner: null,
    createdBy: person(TRADER), outcome: null, settlement: null, resolutionNotes: '', resolvedAt: null, legacyId: null,
    batchNumber: '', quantityKg: null, clientResponseDue: null, supplierRef: '', supplierReportedOn: null,
    clientClaimed: null, clientAgreed: null, clientCurrency: 'EUR', supplierClaimed: null, supplierAccepted: null, supplierCurrency: 'EUR',
    files: [], events: [], ...patch,
  });
  const contractInfo = (id: string) => {
    const c = CONTRACTS[id];
    return c ? { id, type: id.includes('-S-') ? 'S' : 'P', companyName: c.companyName, products: c.products, ownerName: c.owner.name, ownerEmail: c.owner.email, source: 'hub', owner: person(c.owner) } : null;
  };

  await page.route((url) => url.pathname === '/api/people' && url.searchParams.get('resource') === 'complaints', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      switch (url.searchParams.get('view')) {
        case 'setup': return json(route, { me: { ...viewer(), name: who().name }, handlers: [TRADER, OTHER, HANDLER].map(person) });
        case 'contract': return json(route, { contract: contractInfo(url.searchParams.get('id') ?? '') });
        case 'list': {
          const scope = url.searchParams.get('scope');
          const items = [...complaints.values()].filter((c) => maySee(c, viewer()) && (scope !== 'mine' || [c.createdBy, c.handler, c.trader].some((p) => p?.email === who().email)) && (scope !== 'open' || !['closed', 'cancelled'].includes(c.status)));
          return json(route, { total: items.length, items });
        }
        case 'one': {
          const c = complaints.get(url.searchParams.get('id') ?? '');
          if (!c || !maySee(c, viewer())) return json(route, { error: 'This complaint does not concern you.' }, 403);
          return json(route, { complaint: c, can: allowedActions(c, viewer()), next: nextStatuses(c, viewer()) });
        }
        default: return json(route, { error: 'Unknown view' }, 400);
      }
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    posts.push(body);
    if (body.action === 'create') {
      const { complaint: input, problems } = cleanComplaint(body.complaint);
      if (problems.length) return json(route, { error: problems[0].message }, 400);
      const sales = contractInfo(input.salesContractId);
      if (!sales) return json(route, { error: 'No such sales contract.' }, 400);
      const purchase = contractInfo(input.purchaseContractId);
      const c = make({
        ...input, clientName: sales.companyName, supplierName: purchase?.companyName ?? '', trader: sales.owner, purchaseOwner: purchase?.owner ?? null,
        createdBy: person(who()), handler: person(who()), events: [event('created', { toStatus: 'open' })],
      });
      complaints.set(c.id, c);
      return json(route, { complaint: c });
    }
    const c = complaints.get(String(body.id));
    if (!c) return json(route, { error: 'No such complaint.' }, 404);
    const can = allowedActions(c, viewer());
    const refuse = () => json(route, { error: 'You cannot take this step on this complaint now.' }, 403);
    const touch = (e: ComplaintEvent) => {
      c.events = [...c.events, e];
      c.updatedAt = now();
      return json(route, { complaint: c });
    };
    switch (body.action) {
      case 'status': {
        if (!can.includes('status')) return refuse();
        const { change, problems } = cleanStatusChange(body);
        if (problems.length) return json(route, { error: problems[0].message }, 400);
        if (!nextStatuses(c, viewer()).includes(change.to)) return json(route, { error: 'This status cannot be chosen now.' }, 409);
        const from = c.status;
        Object.assign(c, { status: change.to, outcome: change.outcome ?? c.outcome, settlement: change.settlement ?? c.settlement, resolutionNotes: change.resolutionNotes || c.resolutionNotes });
        return touch(event('status', { fromStatus: from, toStatus: change.to, comment: change.comment || null }));
      }
      case 'cancel': {
        if (!can.includes('cancel')) return refuse();
        if (!String(body.comment ?? '').trim()) return json(route, { error: 'Write why the complaint is cancelled.' }, 400);
        const from = c.status;
        c.status = 'cancelled';
        return touch(event('cancelled', { fromStatus: from, toStatus: 'cancelled', comment: String(body.comment) }));
      }
      case 'details': {
        if (!can.includes('edit')) return refuse();
        const { details, problems } = cleanDetails(body.details);
        if (problems.length) return json(route, { error: problems[0].message }, 400);
        Object.assign(c, details);
        return touch(event('details'));
      }
      case 'assign': {
        if (!can.includes('assign')) return refuse();
        const p = [TRADER, OTHER, HANDLER].find((x) => x.email === body.email);
        if (!p) return json(route, { error: 'Choose a person with access to Complaints.' }, 400);
        c.handler = person(p);
        return touch(event('assigned', { comment: p.name }));
      }
      case 'comment': return touch(event('comment', { comment: String(body.comment) }));
      default: return json(route, { error: `Unknown action ${String(body.action)}` }, 400);
    }
  });

  return { complaints, posts, seed: (patch) => { const c = make(patch); complaints.set(c.id, c); return c; } };
}

let backend: Backend;
let stub: Stub;
let me: TestPerson = TRADER;

test.beforeEach(async ({ page }) => {
  backend = await startBackend(page);
  stub = await complaintsApi(page, () => me);
});

async function signInAs(person: TestPerson) {
  me = person;
  await backend.as(person);
}

test('a trader registers a complaint from the sales contract number', async ({ page }) => {
  await signInAs(TRADER);
  await page.goto('/complaints');
  await expect(page.getByText('No complaints concern you.')).toBeVisible();
  // A trader sees only their own complaints: no Open / All tabs.
  await expect(page.getByRole('link', { name: 'All complaints' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New complaint' }).click();

  await page.getByLabel('Sales contract').fill('64-s-tt-2026');
  await expect(page.getByTestId('sales contract-info')).toContainText('Acme Foods GmbH');
  await page.getByLabel('Purchase contract (optional)').fill('100-P-TT-2026');
  await expect(page.getByTestId('purchase contract-info')).toContainText('Supplier Ltd');

  // The description is required.
  await page.getByRole('button', { name: 'Register complaint' }).click();
  await expect(page.getByText(/Describe/)).toBeVisible();
  expect(stub.posts).toHaveLength(0);

  await page.getByLabel('Type').selectOption('packaging');
  await page.getByLabel('Quantity concerned (kg)').fill('1250,5');
  await page.getByLabel('Description').fill('Two big bags arrived torn.');
  await page.getByRole('button', { name: 'Register complaint' }).click();

  await expect(page.getByRole('heading', { name: 'C-2026-001' })).toBeVisible();
  await expect(page.getByText('Supplier Ltd')).toBeVisible();
  await expect(page.getByText('1,250.5 kg')).toBeVisible();
  await expect(page.getByText('Registered the complaint')).toBeVisible();
  const created = stub.complaints.get('C-2026-001');
  expect(created?.salesContractId).toBe('64-S-TT-2026');
  expect(created?.type).toBe('packaging');
});

test('the handler takes a complaint to the supplier and resolves it with an outcome', async ({ page }) => {
  const c = stub.seed({});
  await signInAs(HANDLER);
  await page.goto('/complaints/open');
  await page.getByRole('link', { name: /Acme Foods GmbH/ }).click();
  await expect(page.getByRole('heading', { name: c.id })).toBeVisible();

  await page.getByRole('group', { name: 'Move to' }).getByRole('button', { name: 'With supplier' }).click();
  await page.getByLabel('Comment (optional)').fill('Sent photos to the supplier.');
  await page.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByText('Sent photos to the supplier.')).toBeVisible();

  // Amounts are optional, typed with a comma.
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Claimed by the client').fill('1200,50');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('1 200.5 EUR')).toBeVisible();

  // "Resolved" needs the outcome and how it was settled.
  await page.getByRole('group', { name: 'Move to' }).getByRole('button', { name: 'Resolved' }).click();
  const save = page.getByRole('button', { name: 'Save status' });
  await expect(save).toBeDisabled();
  await page.getByLabel('Outcome').selectOption('accepted');
  await page.getByLabel('Settlement').selectOption('credit_note');
  await save.click();
  await expect(page.getByText('Accepted · Credit note')).toBeVisible();
  expect(stub.complaints.get(c.id)?.status).toBe('resolved');

  // Administration hands it to someone else.
  await page.getByLabel('Handled by').selectOption(OTHER.email);
  await expect(page.getByText(`Assigned to ${OTHER.name}`)).toBeVisible();
});

test('the person who registered an open complaint cancels it with a reason, others do not see it', async ({ page }) => {
  const c = stub.seed({});
  stub.seed({ createdBy: person(OTHER), handler: person(OTHER), trader: person(OTHER), clientName: 'Somebody Else BV' });
  await signInAs(TRADER);
  await page.goto('/complaints');
  await expect(page.getByText('Somebody Else BV')).toHaveCount(0);
  await page.getByRole('link', { name: /Acme Foods GmbH/ }).click();

  await page.getByRole('button', { name: 'Cancel the complaint' }).click();
  const confirm = page.getByRole('button', { name: 'Cancel the complaint' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Why is it cancelled/).fill('Registered twice.');
  await confirm.click();
  await expect(page.getByText('Registered twice.')).toBeVisible();
  expect(stub.complaints.get(c.id)?.status).toBe('cancelled');
});

test('the handler starts on the open complaints, their own are one tab further', async ({ page }) => {
  await signInAs(HANDLER);
  await page.goto('/complaints');
  await expect(page.getByRole('link', { name: 'Open', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'My complaints' }).click();
  await expect(page).toHaveURL(/\/complaints\/mine$/);
  await expect(page.getByRole('link', { name: 'My complaints' })).toHaveAttribute('aria-current', 'page');
});
