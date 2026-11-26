/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { BOARD, TRADER, startBackend, type Backend } from './backend';

// Team → Org chart: who reports to whom (profiles.manager_id). The team is in e2e/backend.ts (teamOf): Bo Board and
// Pia Partner on the Board; Sam Signer, the sales director, reports to Bo and has Tom Trader and Tia Trade; Ada Admin
// reports to Pia; Nina New has no manager yet.

let backend: Backend;

test.beforeEach(async ({ page }) => {
  backend = await startBackend(page);
});

const chart = (page: Page) => page.getByRole('application', { name: 'Org chart' });
const card = (page: Page, name: string) => chart(page).getByRole('button', { name: new RegExp(`^${name}`) });
const panel = (page: Page, name: string) => page.getByRole('complementary', { name: `About ${name}` });

test('the org chart opens first and shows who reports to whom', async ({ page }) => {
  await backend.as(TRADER);
  await page.goto('/team');
  await expect(page.getByRole('tab', { name: 'Org chart' })).toHaveAttribute('aria-selected', 'true');
  for (const name of ['Bo Board', 'Pia Partner', 'Sam Signer', 'Tom Trader', 'Tia Trade', 'Ada Admin']) await expect(card(page, name)).toBeVisible();
  await expect(card(page, 'Tom Trader')).toContainText('You');
  // Nina has no manager: she is listed apart, not on the chart.
  await expect(card(page, 'Nina New')).toHaveCount(0);
  await expect(page.getByText('Without a manager (1)')).toBeVisible();

  await card(page, 'Tom Trader').click();
  const about = panel(page, 'Tom Trader');
  await expect(about).toBeVisible();
  await expect(about.getByRole('heading', { name: 'Reports to' })).toBeVisible();
  await expect(about.getByRole('button', { name: /Bo Board/ })).toBeVisible();
  await expect(about.getByRole('button', { name: /Sam Signer/ })).toBeVisible();

  // From the panel to the manager, who has a team of two.
  await about.getByRole('button', { name: /Sam Signer/ }).click();
  const sam = panel(page, 'Sam Signer');
  await expect(sam.getByText('Team · 2 direct')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sam).toHaveCount(0);
});

test('a team folds away and opens again', async ({ page }) => {
  await backend.as(TRADER);
  await page.goto('/team');
  await chart(page).getByRole('button', { name: 'Hide the team of Sam Signer' }).click();
  await expect(card(page, 'Tom Trader')).toHaveCount(0);
  await chart(page).getByRole('button', { name: 'Show the team of Sam Signer' }).click();
  await expect(card(page, 'Tom Trader')).toBeVisible();

  await page.getByRole('button', { name: 'Collapse all teams' }).click();
  await expect(card(page, 'Sam Signer')).toBeVisible();
  await expect(card(page, 'Tia Trade')).toHaveCount(0);
  // Searching opens the teams above the person found.
  await page.getByLabel('Search').fill('tia');
  await expect(card(page, 'Tia Trade')).toBeVisible();
});

test('the directory is one click away and keeps the contacts', async ({ page }) => {
  await backend.as(TRADER);
  await page.goto('/team');
  await page.getByRole('tab', { name: 'Directory' }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(chart(page)).toHaveCount(0);
  await expect(page.getByText('nina.new@example.com')).toBeVisible();
});

test('without any managers the directory opens, and the chart tells an administrator where to set them', async ({ page }) => {
  backend.people = backend.people.map((p) => ({ ...p, managerId: null }));
  await backend.as(BOARD);
  await page.goto('/team');
  await expect(page.getByRole('tab', { name: 'Directory' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Org chart' }).click();
  await expect(page.getByText('The org chart appears once managers are set')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'User management' })).toBeVisible();
});

test('@phone on a phone the chart is an outline and the details come up from the bottom', async ({ page, isMobile }) => {
  await backend.as(TRADER);
  await page.goto('/team?view=chart');
  const tree = page.getByRole('tree', { name: 'Org chart' });
  if (!isMobile) {
    await expect(chart(page)).toBeVisible();
    await expect(tree).toBeHidden();
    return;
  }
  await expect(chart(page)).toBeHidden();
  await expect(tree.getByRole('button', { name: /^Tom Trader/ })).toBeVisible();
  await tree.getByRole('button', { name: 'Hide the team of Sam Signer' }).click();
  await expect(tree.getByRole('button', { name: /^Tom Trader/ })).toBeHidden();
  await tree.getByRole('button', { name: 'Show the team of Sam Signer' }).click();
  await tree.getByRole('button', { name: /^Tom Trader/ }).click();
  await expect(panel(page, 'Tom Trader')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
