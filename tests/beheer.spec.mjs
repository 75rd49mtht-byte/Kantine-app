// Beheer: dienstdagen aanmaken en teamcodes bewaren.

import { test, expect } from '@playwright/test';
import { stand, nepDatabase, logInMetAccount, naarTab, komendeZaterdag, komendeWoensdag, dag } from './helpers/app.mjs';

async function naarBeheer(page) {
  await naarTab(page, 'beheer');
  await page.waitForSelector('.card');
}

test('een datum die geen zaterdag is wordt gemeld', async ({ page }) => {
  const s = stand();
  const meldingen = [];
  page.on('dialog', (d) => { meldingen.push(d.message()); d.accept(); });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarBeheer(page);

  const kaart = page.locator('.card', { hasText: 'Zaterdagen genereren' });
  await kaart.locator('input[type=date]').fill(komendeWoensdag());
  await kaart.locator('input[type=number]').fill('3');
  await kaart.getByRole('button', { name: 'Genereren' }).click();

  await expect.poll(() => meldingen.join(' ')).toMatch(/geen zaterdag/i);
});

test('dienstdagen worden stuk voor stuk aangemaakt en de teams rouleren door', async ({ page }) => {
  const s = stand();
  page.on('dialog', (d) => d.accept());
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarBeheer(page);

  const kaart = page.locator('.card', { hasText: 'Zaterdagen genereren' });
  await kaart.locator('input[type=date]').fill(komendeZaterdag());
  await kaart.locator('input[type=number]').fill('3');
  await kaart.getByRole('button', { name: 'Genereren' }).click();

  await expect.poll(() => s.posts.filter((p) => p.tabel === 'saturdays').length).toBe(3);

  const dagen = s.posts.filter((p) => p.tabel === 'saturdays');
  // de laatste bestaande dienstdag was van t3, dus hierna is t1 weer aan de beurt
  expect(dagen.map((d) => d.body.team_id)).toEqual(['t1', 't2', 't3']);
});

test('als één datum al bestaat gaan de andere gewoon door', async ({ page }) => {
  const eerste = komendeZaterdag();
  const tweede = (() => { const d = new Date(eerste + 'T12:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const s = stand({ weigerDatum: tweede });
  page.on('dialog', (d) => d.accept());
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarBeheer(page);

  const kaart = page.locator('.card', { hasText: 'Zaterdagen genereren' });
  await kaart.locator('input[type=date]').fill(eerste);
  await kaart.locator('input[type=number]').fill('3');
  await kaart.getByRole('button', { name: 'Genereren' }).click();

  await expect.poll(() => s.posts.filter((p) => p.tabel === 'saturdays').length).toBe(3);
  const melding = page.locator('.tempbox').first();
  await expect(melding).toContainText('2 dienstdag');
  await expect(melding).toContainText('Niet gelukt');
});

test('een teamcode wordt alsnog aangemaakt als er nog geen regel bestaat', async ({ page }) => {
  const s = stand({ teamCodePatchLeeg: true });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarBeheer(page);

  const veld = page.locator('.card', { hasText: 'Teams' }).locator('input[type=text]').first();
  await veld.fill('zzz99');
  await veld.blur();

  await expect.poll(() => s.posts.some((p) => p.tabel === 'team_codes' && p.body.code === 'zzz99')).toBe(true);
});
