/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { money } from '../shared/contractsApi.ts';
import { ADMINISTRATION, ASSISTANT, BOARD, SIGNER, TRADER, startBackend, type Backend } from './backend';

// Contract generator: the screens people use, typed and clicked in a real browser (see e2e/backend.ts).

let backend: Backend;

test.beforeEach(async ({ page }) => {
  backend = await startBackend(page);
});

const section = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function fillNewContract(page: Page) {
  const buyer = section(page, 'Buyer');
  await buyer.getByLabel('Company name').fill('Acme Foods GmbH');
  await buyer.getByLabel('VAT ID').fill('DE123456789');
  await buyer.getByLabel('Street').fill('Hauptstrasse 1');
  await buyer.getByLabel('Postal code').fill('10115');
  await buyer.getByLabel('City').fill('Berlin');
  await buyer.getByLabel('Country').selectOption('DE');
  await buyer.getByLabel('Contact first name').fill('Anna');
  await buyer.getByLabel('Contact last name').fill('Schmidt');
  await buyer.getByLabel('E-mail').fill('anna@example.com');
  await buyer.getByLabel('Phone').fill('+49 30 123456');

  await page.getByRole('combobox', { name: 'Product', exact: true }).fill('Whey protein concentrate 80%');
  await page.getByRole('textbox', { name: 'Quantity' }).fill('1250,5');
  await page.getByRole('textbox', { name: 'Unit price' }).fill('4,25');
  await page.getByRole('textbox', { name: 'Product notes' }).fill('Big bags, 1 MT each');

  await page.getByRole('button', { name: 'Same address as the buyer' }).click();
  const delivery = section(page, 'Delivery');
  await delivery.getByLabel('Delivery from').fill('2026-12-01');
}

test.describe('new contract', () => {
  test('decimal amounts with a comma or a point are kept while typing', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    const quantity = page.getByRole('textbox', { name: 'Quantity' });
    await quantity.pressSequentially('12,5');
    await expect(quantity).toHaveValue('12,5');
    const price = page.getByRole('textbox', { name: 'Unit price' });
    await price.pressSequentially('0.75');
    await expect(price).toHaveValue('0.75');
    await expect(page.getByText('Total net:')).toContainText(money(12.5 * 0.75, 'EUR'));
    await page.getByLabel('Prepayment before shipment (%)').fill('30');
    await expect(page.getByLabel(/The rest \(70%\) within days/)).toBeVisible();
  });

  test('the currency is chosen in the Goods section, next to the prices, and shown with them', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    const goods = section(page, 'Goods');
    await expect(section(page, 'New contract').getByLabel('Currency of the contract')).toHaveCount(0);
    await goods.getByLabel('Currency of the contract').selectOption('USD');
    await expect(goods.getByText('Price (USD)')).toBeVisible();
    await fillNewContract(page);
    await expect(goods.getByText('Total net:')).toContainText(money(1250.5 * 4.25, 'USD'));
    await page.getByRole('button', { name: 'Generate and send to administration' }).click();
    await expect(page).toHaveURL(/\/contracts\/14-S-TT-2026$/);
    const sent = backend.posts.find((p) => p.action === 'create') as { contract: { currency: string } };
    expect(sent.contract.currency).toBe('USD');
  });

  test('a trader generates a contract and the server accepts what the form sends', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    await expect(page.getByText('Number: 14-S-TT-2026')).toBeVisible();
    await fillNewContract(page);
    await expect(page.getByText('Total net:')).toContainText(money(1250.5 * 4.25, 'EUR'));
    await page.getByRole('button', { name: 'Generate and send to administration' }).click();

    await expect(page).toHaveURL(/\/contracts\/14-S-TT-2026$/);
    const sent = backend.posts.find((p) => p.action === 'create') as { contract: { products: { quantity: number; unitPrice: number; notes: string }[] } };
    expect(sent.contract.products[0]).toMatchObject({ quantity: 1250.5, unitPrice: 4.25, notes: 'Big bags, 1 MT each' });
    await expect(page.getByText('Big bags, 1 MT each')).toBeVisible();
    await expect(page.getByText('Waiting for administration').first()).toBeVisible();
  });

  test('with "Create contracts for other traders" a contract is made for a trader and waits for administration as usual', async ({ page }) => {
    await backend.as(ASSISTANT);
    await page.goto('/contracts/new');
    await page.getByLabel('Trader').selectOption(TRADER.email);
    await fillNewContract(page);
    await page.getByRole('button', { name: 'Generate and send to administration' }).click();

    await expect(page).toHaveURL(/\/contracts\/14-S-TT-2026$/);
    const sent = backend.posts.find((p) => p.action === 'create') as { contract: { ownerEmail: string } };
    expect(sent.contract.ownerEmail).toBe(TRADER.email);
    await expect(page.getByText('Waiting for administration').first()).toBeVisible();
    // The creator cannot accept it: that stays with administration.
    await expect(page.getByRole('button', { name: 'Accept the contract' })).toHaveCount(0);
    await expect(page.getByLabel('Internal order number (enova)')).toHaveCount(0);
  });

  test('the delivery address has its own fields (labels do not point at the buyer)', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    await fillNewContract(page);
    const delivery = section(page, 'Delivery');
    await delivery.getByLabel('Street').fill('Lagerweg 7');
    await delivery.getByLabel('Postal code').fill('20095');
    await delivery.getByLabel('City').fill('Hamburg');
    await expect(section(page, 'Buyer').getByLabel('Street')).toHaveValue('Hauptstrasse 1');
    await page.getByRole('button', { name: 'Generate and send to administration' }).click();
    await expect(page).toHaveURL(/\/contracts\/14-S-TT-2026$/);
    const sent = backend.posts.find((p) => p.action === 'create') as { contract: { party: { city: string }; delivery: { street: string; city: string } } };
    expect(sent.contract.party.city).toBe('Berlin');
    expect(sent.contract.delivery).toMatchObject({ street: 'Lagerweg 7', city: 'Hamburg' });
  });

  test('every field on the form has its own id (a label opens the right field)', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    await page.getByRole('button', { name: 'Add product' }).click();
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    expect(duplicates).toEqual([]);
  });

  test('missing fields are marked and nothing is sent', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    await page.getByRole('button', { name: 'Generate and send to administration' }).click();
    await expect(page.getByText(/fields need attention/)).toBeVisible();
    expect(backend.posts.filter((p) => p.action === 'create')).toHaveLength(0);
    await expect(page).toHaveURL(/\/contracts\/new$/);
  });

  test('a draft keeps the typed amounts and opens again from My contracts', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    await section(page, 'Buyer').getByLabel('Company name').fill('Draft Foods');
    await page.getByRole('textbox', { name: 'Quantity' }).fill('2,5');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/draft=/);

    await page.goto('/contracts');
    await page.getByText('Draft Foods').click();
    await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue('2.5');
    await expect(section(page, 'Buyer').getByLabel('Company name')).toHaveValue('Draft Foods');
  });

  test('more products: each line has its own total and can be removed', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts/new');
    await page.getByRole('button', { name: 'Add product' }).click();
    const quantities = page.getByRole('textbox', { name: 'Quantity' });
    const prices = page.getByRole('textbox', { name: 'Unit price' });
    await quantities.nth(0).fill('10');
    await prices.nth(0).fill('2');
    await quantities.nth(1).fill('1');
    await page.getByRole('combobox', { name: 'Unit', exact: true }).nth(1).selectOption('MT');
    await prices.nth(1).fill('1500,5');
    await expect(page.getByRole('combobox', { name: 'Price per' }).nth(1)).toHaveValue('MT');
    await expect(page.getByText('Total net:')).toContainText(money(10 * 2 + 1500.5, 'EUR'));
    // Quantity in tonnes, price per kilogram: the line converts the units.
    await page.getByRole('combobox', { name: 'Price per' }).nth(1).selectOption('KG');
    await prices.nth(1).fill('1,5');
    await expect(page.getByText('Total net:')).toContainText(money(10 * 2 + 1000 * 1.5, 'EUR'));
    await page.getByRole('button', { name: 'Remove product' }).nth(1).click();
    await expect(page.getByText('Total net:')).toContainText(money(20, 'EUR'));
  });
});

test.describe('approval flow', () => {
  test('administration must enter the internal order number to accept, and can correct it later', async ({ page }) => {
    backend.seed({ id: '7-S-TT-2026' });
    await backend.as(ADMINISTRATION);
    await page.goto('/contracts/7-S-TT-2026');

    const accept = page.getByRole('button', { name: 'Accept the contract' });
    await expect(accept).toBeDisabled();
    await page.getByLabel('Internal order number (enova)').first().fill('ZO/123/2026');
    await accept.click();
    await expect(page.getByText('Waiting for signature').first()).toBeVisible();
    expect(backend.posts.at(-1)).toMatchObject({ action: 'accept', enovaOrder: 'ZO/123/2026' });

    const edit = section(page, 'Internal order number');
    await expect(edit.getByLabel('Internal order number (enova)')).toHaveValue('ZO/123/2026');
    await edit.getByLabel('Internal order number (enova)').fill('ZO/124/2026');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Order number saved')).toBeVisible();
    expect(backend.contracts.get('7-S-TT-2026')?.enovaOrder).toBe('ZO/124/2026');
  });

  test('the signer signs; a return needs a comment and goes back to the trader', async ({ page }) => {
    backend.seed({ id: '8-S-TT-2026', status: 'signature', enovaOrder: 'ZO/1', acceptedBy: { email: ADMINISTRATION.email, name: ADMINISTRATION.name, at: '2026-11-24T10:00:00Z' } });
    backend.seed({ id: '9-S-TT-2026', status: 'signature', enovaOrder: 'ZO/2' });
    await backend.as(SIGNER);

    await page.goto('/contracts/8-S-TT-2026');
    await page.getByRole('button', { name: 'Sign the contract' }).click();
    await expect(page.getByText('Signed by Nutri Partners').first()).toBeVisible();

    await page.goto('/contracts/9-S-TT-2026');
    await page.getByRole('button', { name: /^Return/ }).first().click();
    const confirm = page.getByRole('button', { name: /^Return/ }).last();
    await page.getByRole('textbox').last().fill('Wrong price for the second delivery');
    await confirm.click();
    await expect(page.getByText('Returned for corrections').first()).toBeVisible();
    expect(backend.contracts.get('9-S-TT-2026')?.returnComment).toBe('Wrong price for the second delivery');
  });

  test('above 100 000 EUR the signer approves and a board member signs', async ({ page }) => {
    backend.seed({ id: '11-S-TT-2026', status: 'signature', boardRequired: true, amountNet: 250000, amountEur: 250000, enovaOrder: 'ZO/3' });
    await backend.as(SIGNER);
    await page.goto('/contracts/11-S-TT-2026');
    await expect(page.getByRole('button', { name: 'Sign the contract' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Approve for the board' }).click();
    await expect(page.getByText('Waiting for the board').first()).toBeVisible();

    await backend.as(BOARD);
    await page.goto('/contracts/11-S-TT-2026');
    await page.getByRole('button', { name: 'Sign the contract' }).click();
    await expect(page.getByText('Signed by Nutri Partners').first()).toBeVisible();
  });

  test('a trader corrects a returned contract and sends it again', async ({ page }) => {
    backend.seed({ id: '10-S-TT-2026', status: 'returned', returnComment: 'Change the quantity' });
    await backend.as(TRADER);
    await page.goto('/contracts/10-S-TT-2026');
    await page.getByRole('button', { name: 'Correct the contract' }).click();
    await expect(page.getByText('Change the quantity')).toBeVisible();
    const quantity = page.getByRole('textbox', { name: 'Quantity' });
    await expect(quantity).toHaveValue('1000');
    await quantity.fill('1500,25');
    await page.getByRole('button', { name: 'Send again to administration' }).click();
    const sent = backend.posts.find((p) => p.action === 'update') as { contract: { products: { quantity: number }[] } };
    expect(sent.contract.products[0].quantity).toBe(1500.25);
  });
});

test('@phone the form fits a phone and amounts can be typed', async ({ page }) => {
  await backend.as(TRADER);
  await page.goto('/contracts/new');
  const quantity = page.getByRole('textbox', { name: 'Quantity' });
  await quantity.pressSequentially('3,75');
  await expect(quantity).toHaveValue('3,75');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('documents', () => {
  test('"Download both PDFs" saves the contract and the terms, one after another', async ({ page }) => {
    backend.files.terms = 'http://files.test/ows.pdf';
    backend.files.signature = 'http://files.test/signature.png';
    backend.seed({
      id: '12-S-TT-2026', status: 'signed', boardRequired: true, amountNet: 160000, amountEur: 160000, enovaOrder: 'ZO/4',
      signedBy: { email: BOARD.email, name: BOARD.name, at: '2026-11-24T12:00:00Z', title: 'Chief Operating Officer' } as never,
    });
    await backend.as(TRADER);
    await page.goto('/contracts/12-S-TT-2026');
    const downloads: { name: string; at: number }[] = [];
    page.on('download', (d) => downloads.push({ name: d.suggestedFilename(), at: Date.now() }));
    await page.getByRole('button', { name: 'Download both PDFs' }).click();
    await expect.poll(() => downloads.map((d) => d.name), { timeout: 15_000 }).toEqual(['12-S-TT-2026.pdf', '12-S-TT-2026 - OWS.pdf']);
    // A moment apart: a browser drops a download that starts while the previous one is being handed over.
    expect(downloads[1].at - downloads[0].at).toBeGreaterThanOrEqual(1000);
  });
});

test.describe('archive (intranet)', () => {
  test('a trader sees only their own old contracts, read only, with the attachments', async ({ page }) => {
    await backend.as(TRADER);
    await page.goto('/contracts');
    await page.getByRole('link', { name: 'Archive (intranet)' }).click();
    await expect(page.getByText('Old Client SARL')).toBeVisible();
    await expect(page.getByText('Supplier Ltd')).toHaveCount(0);
    await page.getByText('Old Client SARL').click();
    await expect(page).toHaveURL(/\/contracts\/archive\/13-S-TT-2026$/);
    await expect(page.getByText('From the old intranet, read only')).toBeVisible();
    await expect(page.getByText(money(4700, 'EUR')).first()).toBeVisible();
    await expect(page.getByText('25 Nov 2026')).toBeVisible();
    await expect(page.getByRole('link', { name: 'signed contract.pdf' })).toHaveAttribute('href', 'http://files.test/signed.pdf');
    await expect(page.getByRole('button', { name: /^(Sign the contract|Accept the contract|Correct the contract)$/ })).toHaveCount(0);

    await page.goto('/contracts/archive/40-P-AA-2025');
    await expect(page.getByText(/belongs to another trader/)).toBeVisible();
  });

  test('administration sees every old contract and can filter them', async ({ page }) => {
    await backend.as(ADMINISTRATION);
    await page.goto('/contracts/archive');
    await expect(page.getByText('Supplier Ltd')).toBeVisible();
    await page.getByLabel('Type').selectOption('S');
    await expect(page.getByText('Supplier Ltd')).toHaveCount(0);
    await page.getByLabel('Type').selectOption('');
    await page.getByLabel('Trader').selectOption('Other Trader');
    await expect(page.getByText('Old Client SARL')).toHaveCount(0);
    await page.getByLabel('Trader').selectOption('');
    await page.getByLabel('Search the archive').fill('pea protein');
    await expect(page.getByText('Supplier Ltd')).toBeVisible();
    await expect(page.getByText('Old Client SARL')).toHaveCount(0);
  });
});
