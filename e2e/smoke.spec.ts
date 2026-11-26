/// <reference lib="dom" />
import { expect, test, type Page, type Route } from '@playwright/test';
import { BOARD, TRADER, startBackend, type TestPerson } from './backend';

// Smoke test (W5 of the UI audit, 26.11.2026): every page of the hub opens on a computer and on a phone without an
// error, without the "Something went wrong" message and without sideways scrolling, and names itself in the browser
// tab. The modules without their own scenarios (Leave, News, Purchase, Notifications, Contests, Calls) get small,
// made-up answers here; the scenarios in the other files test what the pages do.

const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const person = (name: string, i: number) => ({ id: `p${i}`, name, email: `${name.split(' ')[0].toLowerCase()}@example.com` });
const people = [person('Bo Board', 1), person('Tom Trader', 2), person('Ada Admin', 3)];
const balance = { year: 2026, carriedOver: 4, allowance: 26, used: 10, pending: 2, available: 18, limited: {} };
const request = (i: number, status: string, type = 'annual') => ({
  id: `r${i}`, person: people[1], type, start: '2026-12-21', end: '2026-12-23', halfDay: false, days: 3, status, note: 'Christmas',
  createdAt: '2026-11-20T10:00:00Z', enteredBy: null, decidedBy: null, decidedAt: null,
});

async function moduleStubs(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const resource = url.searchParams.get('resource');
    const view = url.searchParams.get('view');
    if (route.request().method() !== 'GET') return route.fallback();
    if (url.pathname === '/api/leave') {
      return json(route, {
        year: 2026, today: '2026-11-26', balance, requests: [request(1, 'pending'), request(2, 'approved', 'on_demand')],
        approvals: [{ request: request(3, 'pending'), balance }], isApprover: true, managesLeave: true, people,
      });
    }
    if (url.pathname === '/api/leave/calendar') {
      const month = url.searchParams.get('month') ?? '2026-11';
      return json(route, {
        month, today: `${month}-26`, people, holidays: [`${month}-11`],
        entries: [
          { personId: 'p2', start: `${month}-26`, end: `${month}-28`, halfDay: false, status: 'approved', type: 'annual' },
          { personId: 'p3', start: `${month}-10`, end: `${month}-10`, halfDay: true, status: 'pending', type: null },
        ],
      });
    }
    if (url.pathname === '/api/leave/employees') {
      return json(route, {
        year: 2026,
        employees: people.map((p, i) => ({
          person: p, isAdmin: i === 0, managesLeave: i === 0, configured: i > 0, settings: { managerId: null, annualDays: 26, startYear: 2026, carriedOver: 4 },
          manager: i ? people[0] : null, balance, approvesTrips: false,
        })),
      });
    }
    if (url.pathname === '/api/news' && (url.searchParams.has('status') || view === 'manage')) return json(route, { posts: [], isAdmin: true, authors: people });
    if (url.pathname === '/api/news/editors') return json(route, { people: people.map((p, i) => ({ ...p, isAdmin: i === 0, isEditor: i === 1 })) });
    if (resource === 'purchase') {
      if (view === 'proposals') return json(route, { total: 0, counts: {}, items: [] });
      if (view === 'summary') return json(route, { open: 0, newProducts: 0, mappings: 0, decidedToday: 0, approvedProducts: 1700, categories: [], openByCategory: {} });
      if (view === 'review') return json(route, { total: 0, items: [] });
      if (view === 'lastDecision') return json(route, { last: null });
    }
    if (resource === 'complaints') {
      if (view === 'setup') return json(route, { me: { email: BOARD.email, name: BOARD.name, isComplaintAdmin: true }, handlers: people });
      if (view === 'list') return json(route, { total: 0, items: [] });
    }
    if (resource === 'contests') return json(route, { contests: [], people: [] });
    if (resource === 'calls') return json(route, { periods: [], period: null, people: [], comparison: [] });
    return route.fallback();
  });
}

const EVERYTHING: TestPerson = {
  ...BOARD,
  apps: ['news', 'leave', 'leave-admin', 'purchase', 'contracts', 'complaints', 'complaints-admin', 'calls', 'create-users'],
};
const TRADER_APPS: TestPerson = { ...TRADER, apps: ['contracts', 'news', 'leave', 'complaints'] };

const PAGES: [string, string][] = [
  ['/', 'Home'], ['/news', 'News'], ['/news/manage', 'News'], ['/news/editors', 'News'], ['/leave', 'Leave'],
  ['/leave/approvals', 'Leave'], ['/leave/calendar', 'Leave'], ['/leave/employees', 'Leave'], ['/team', 'Team'],
  ['/profile', 'My profile'], ['/notifications', 'Notifications'], ['/users', 'User management'],
  ['/users/new', 'User management'], ['/contests', 'Sales contests'], ['/calls', 'Phone calls analyser'],
  ['/purchase', 'Purchase Manager'], ['/purchase/products', 'Purchase Manager'], ['/contracts', 'Contracts'],
  ['/contracts/new', 'Contracts'], ['/contracts/archive', 'Contracts'], ['/contracts/settings', 'Contracts'],
  ['/complaints', 'Complaints'], ['/complaints/new', 'Complaints'],
];

async function opens(page: Page, who: TestPerson, path: string, title: string) {
  const backend = await startBackend(page);
  await moduleStubs(page);
  await backend.as(who);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  await expect(page).toHaveTitle(`${title} – Nutri Partners`);
  await expect(page.locator('main')).not.toBeEmpty();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toHaveCount(0);
  const [width, viewport] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(width, 'no sideways scrolling').toBeLessThanOrEqual(viewport);
  expect(errors).toEqual([]);
}

for (const [path, title] of PAGES) {
  test(`@phone ${path} opens without an error`, async ({ page }) => {
    await opens(page, EVERYTHING, path, title);
  });
}

for (const [path, title] of PAGES.filter(([p]) => ['/', '/news', '/leave', '/contracts', '/contracts/new', '/complaints', '/team', '/profile'].includes(p))) {
  test(`@phone a trader opens ${path} without an error`, async ({ page }) => {
    await opens(page, TRADER_APPS, path, title);
  });
}

test('@phone the leave calendar starts at today, also when the month does not fit the screen', async ({ page }) => {
  const backend = await startBackend(page);
  await moduleStubs(page);
  await backend.as(EVERYTHING);
  await page.goto('/leave/calendar');
  const grid = page.getByTestId('leave-calendar');
  const today = grid.locator('th[data-today]');
  await expect(today).toBeVisible();
  const [box, cell] = [await grid.boundingBox(), await today.boundingBox()];
  expect(cell!.x).toBeGreaterThanOrEqual(box!.x);
  expect(cell!.x + cell!.width).toBeLessThanOrEqual(box!.x + box!.width);
});

test('@phone the menu and the bell keep the keyboard inside and give the focus back when they close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await startBackend(page);
  await moduleStubs(page);
  await backend.as(EVERYTHING);
  await page.goto('/team');

  const menuButton = page.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const drawer = page.getByRole('dialog', { name: 'Apps' });
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(menuButton).toBeFocused();

  const bell = page.getByRole('button', { name: /^Notifications/ });
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();
});
