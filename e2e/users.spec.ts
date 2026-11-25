/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { ADMINISTRATION, PARTNER, TRADER, startBackend, type Backend, type TestPerson } from './backend';

// "Edit user profiles" (edit-users, 25.11.2026): someone from administration opens User management and changes a
// colleague's contact details and manager, without roles, apps, passwords or account actions.

let backend: Backend;

test.beforeEach(async ({ page }) => {
  backend = await startBackend(page);
});

const EDITOR: TestPerson = { ...ADMINISTRATION, apps: ['edit-users'] };

test('with "Edit user profiles" a colleague\'s contact details and manager are changed in User management', async ({ page }) => {
  await backend.as(EDITOR);
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add user' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /Role of/ })).toHaveCount(0);

  // The menu closes on scroll, so the button is scrolled into view before it is clicked.
  const actions = page.getByRole('button', { name: `Actions for ${TRADER.email}` }).locator('visible=true');
  await actions.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await actions.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Set a new password|Deactivate|Delete account/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Edit profile and history' }).click();

  await expect(page.getByRole('heading', { name: TRADER.name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apps and access' })).toHaveCount(0);
  await page.getByLabel('Job title').fill('Senior Trader');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => backend.accountChanges.find((c) => c.url === '/api/people')?.body).toMatchObject({ jobTitle: 'Senior Trader' });

  await page.getByLabel('Manager').selectOption({ label: PARTNER.name });
  await page.getByRole('button', { name: 'Save manager' }).click();
  await expect.poll(() => backend.accountChanges.find((c) => c.url === '/api/admin/users')?.body).toEqual({ id: expect.any(String), managerId: expect.any(String) });
});

test('without the permission User management stays closed', async ({ page }) => {
  await backend.as(TRADER);
  await page.goto('/users');
  await expect(page).toHaveURL(/\/$/);
});
