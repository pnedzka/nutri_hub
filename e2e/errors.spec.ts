/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { BOARD, startBackend } from './backend';

// A page that crashes while drawing (here: Leave gets an answer it does not expect) keeps the header and the side
// menu and says what happened, instead of blanking the whole app; another page from the menu works again.

test('a crash on one page shows a message and keeps the menu, and another page opens normally', async ({ page }) => {
  const backend = await startBackend(page);
  await backend.as({ ...BOARD, apps: ['leave'] });
  await page.route('**/api/leave', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto('/leave');
  await expect(page.getByRole('alert').getByRole('heading', { name: 'Something went wrong on this page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Apps' }).getByRole('link', { name: 'Team' }).click();
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
