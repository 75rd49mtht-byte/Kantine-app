// Het rooster zelf: wat zie je standaard, en klopt wat er geteld wordt.

import { test, expect } from '@playwright/test';
import { stand, nepDatabase, logInMetAccount, naarTab, dag } from './helpers/app.mjs';

test('de pagina rendert in standaardstand en staat op Nederlands', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await page.goto('/');
  const r = await page.evaluate(() => ({ mode: document.compatMode, lang: document.documentElement.lang }));
  expect(r.mode).toBe('CSS1Compat');   // anders mist het doctype
  expect(r.lang).toBe('nl');
});

test('afgelopen zaterdagen staan er standaard niet bij, maar zijn op te vragen', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInMetAccount(page);

  await expect(page.locator('.sat')).toHaveCount(2);
  await expect(page.locator('#content .muted').filter({ hasText: 'verborgen' }).first()).toBeVisible();

  await page.locator('.filterbar select').first().selectOption('all');
  await expect(page.locator('.sat')).toHaveCount(3);
});

test('de waarschuwing over lege bardiensten telt alleen komende zaterdagen', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInMetAccount(page);

  await naarTab(page, 'overzicht');
  await page.getByRole('button', { name: 'Bar & teller' }).click();
  await page.waitForSelector('.ovtable');

  await expect(page.locator('.banner').first()).toContainText('komende');
  await expect(page.locator('.ovtable tbody tr')).toHaveCount(2);

  await page.locator('label.row input[type=checkbox]').first().check();
  await expect(page.locator('.ovtable tbody tr')).toHaveCount(3);
});

test('de printversie toont de eigen tijdvakken van een bijzondere dag', async ({ page }) => {
  const eigenTijden = [{ id: 'x1', label: 'Toernooi-ochtend', start: '09:00', end: '13:00' }];
  const s = stand({
    saturdays: [
      { id: 's1', date: dag(7), team_id: 't2', team_status: {}, label: '', blocks: null, bar_shifts: null },
      { id: 's2', date: dag(14), team_id: 't3', team_status: {}, label: 'Toernooi', blocks: null, bar_shifts: eigenTijden },
    ],
    barAssignments: [{ saturday_id: 's2', shift_id: 'x1', staff_id: 'p2' }],
  });
  await nepDatabase(page, s);
  // niet echt gaan printen tijdens de test
  await page.addInitScript(() => { window.print = () => { window.__geprint = true; }; });
  await logInMetAccount(page);

  await page.click('#printBtn');
  const print = page.locator('#printArea');
  await expect(print).toContainText('Toernooi-ochtend');
  await expect(print).toContainText('Els Bakker');
});
