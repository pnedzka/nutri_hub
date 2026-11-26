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

test('"Set a new password" shows the password in a window to copy, open until the administrator closes it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await backend.as(PARTNER);
  await page.goto('/users');
  const actions = page.getByRole('button', { name: `Actions for ${TRADER.email}` }).locator('visible=true');
  await actions.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Set a new password' }).click();

  const dialog = page.getByRole('dialog', { name: `Set a new password for ${TRADER.email}?` });
  await expect(dialog).toBeVisible();
  const password = await dialog.getByLabel('New password').inputValue();
  expect(password).toMatch(/^[A-Za-z2-9]{14}$/);
  await dialog.getByRole('button', { name: 'Copy password' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(password);

  await dialog.getByRole('button', { name: 'Set password' }).click();
  const done = page.getByRole('dialog', { name: `New password set for ${TRADER.email}` });
  await expect(done).toBeVisible();
  await expect.poll(() => backend.accountChanges.find((c) => c.url === '/api/admin/users')?.body).toEqual({ id: expect.any(String), password });
  // Still there after the 4 s a toast used to last.
  await page.waitForTimeout(4500);
  await expect(done.getByLabel('New password')).toHaveValue(password);
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Deactivate asks in the hub\'s window: Cancel changes nothing, Deactivate sends the change', async ({ page }) => {
  await backend.as(PARTNER);
  await page.goto('/users');
  const open = async () => {
    const actions = page.getByRole('button', { name: `Actions for ${TRADER.email}` }).locator('visible=true');
    await actions.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await actions.click();
    await page.getByRole('menuitem', { name: 'Deactivate' }).click();
    return page.getByRole('dialog', { name: `Deactivate the account ${TRADER.email}?` });
  };
  let dialog = await open();
  await expect(dialog.getByText('Use this when someone leaves')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(backend.accountChanges).toHaveLength(0);

  await expect(await open()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(backend.accountChanges).toHaveLength(0);

  dialog = await open();
  await dialog.getByRole('button', { name: 'Deactivate' }).click();
  await expect.poll(() => backend.accountChanges[0]?.body).toEqual({ id: expect.any(String), active: false });
});
