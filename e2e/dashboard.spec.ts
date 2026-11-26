/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { BOARD, TRADER, startBackend, type Backend } from './backend';

// Home page: the calendar widget (who is away, holidays and, for administrators, Board and Administration, the
// company's Google Calendar). See e2e/backend.ts for what the fake server answers.

let backend: Backend;

test.beforeEach(async ({ page }) => {
  backend = await startBackend(page);
});

const calendar = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Calendar' });

test('an administrator sees who is away and the company calendar, and can move by weeks', async ({ page }) => {
  await backend.as(BOARD);
  await page.goto('/');
  const widget = calendar(page);
  await expect(widget.getByText('Today ·')).toBeVisible();
  await expect(widget.getByText('Meeting Board')).toBeVisible();
  await expect(widget.getByText('09:00–10:00')).toBeVisible();
  await expect(widget.getByText('Business trip').first()).toBeVisible();
  // The absence lasts two days, so it is on today and tomorrow.
  await expect(widget.getByText('Tom Trader')).toHaveCount(2);

  await widget.getByRole('button', { name: 'Next week' }).click();
  await expect(widget.getByText('Nothing in the calendar these days.')).toBeVisible();
  await widget.getByRole('button', { name: 'Today' }).click();
  await expect(widget.getByText('Meeting Board')).toBeVisible();
});

test('a person with Leave sees only who is away, without the type or the company calendar', async ({ page }) => {
  await backend.as({ ...TRADER, apps: ['contracts', 'leave'] });
  await page.goto('/');
  const widget = calendar(page);
  await expect(widget.getByText('Tom Trader').first()).toBeVisible();
  await expect(widget.getByText('Absent').first()).toBeVisible();
  await expect(widget.getByText('Meeting Board')).toHaveCount(0);
  await expect(widget.getByText('Business trip')).toHaveCount(0);
});

test('without Leave and outside the Board and Administration there is no calendar', async ({ page }) => {
  await backend.as(TRADER);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  // A quote under the greeting, fetched by the hub's server (ZenQuotes), with its author and the source.
  const welcome = page.getByRole('region', { name: 'Welcome' });
  await expect(welcome.locator('blockquote')).toHaveText('“Keep going.”');
  await expect(welcome.getByText('— Test Author')).toBeVisible();
  await expect(welcome.getByRole('link', { name: 'ZenQuotes' })).toBeVisible();
  await expect(calendar(page)).toHaveCount(0);
});

test('@phone the calendar shows only the days with entries on a phone, all seven on a wide screen', async ({ page, isMobile }) => {
  await backend.as(BOARD);
  await page.goto('/');
  const widget = calendar(page);
  await expect(widget.getByText('Meeting Board')).toBeVisible();
  await expect(widget.locator('ol > li:visible')).toHaveCount(isMobile ? 2 : 7);
  // Nothing sticks out of the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
