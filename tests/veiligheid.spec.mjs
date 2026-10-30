// Veiligheid en rechten: wie mag wat, en wat gebeurt er met rare invoer.

import { test, expect } from '@playwright/test';
import { stand, nepDatabase, logInMetAccount, logInAlsTeam, naarTab, CONFIG, komendeZaterdag } from './helpers/app.mjs';

test('scripttekst in een teamnaam of bloklabel wordt getoond, niet uitgevoerd', async ({ page }) => {
  const uitgevoerd = [];
  await page.exposeFunction('__boem', () => uitgevoerd.push(1));
  const gemeen = '<img src=x onerror="window.__boem()">';

  await page.route('**supabase.co/**', (route) => {
    const url = route.request().url();
    const json = (d) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (url.includes('/rpc/public_config')) return json(CONFIG);
    if (url.includes('/rpc/team_login')) return json([{ id: 't1', name: 'JO11-2' + gemeen }]);
    if (url.includes('/rpc/team_saturdays')) return json([{
      id: 's1', date: komendeZaterdag(), team_status: {}, bar: {}, label: '',
      blocks: [{ id: 'b1', label: gemeen + 'Blok 1', start: '08:00', end: '11:00', tasks: ['Bar'] }], bar_shifts: null,
    }]);
    return json([]);
  });

  await page.goto('/');
  await page.fill('#codeInput', 'aaaaa');
  await page.click('#codeBtn');
  await page.waitForSelector('#content .block');

  expect(uitgevoerd, 'de ingesmokkelde code mag niet draaien').toHaveLength(0);
  await expect(page.locator('#content .bhead').first()).toContainText('<img');
});

test('het tijdelijke wachtwoord is lang en elke keer anders', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await page.goto('/');

  const r = await page.evaluate(() => {
    const set = new Set();
    let voorbeeld = '';
    for (let i = 0; i < 2000; i++) { const p = sterkWachtwoord(); set.add(p); if (!voorbeeld) voorbeeld = p; }
    return { uniek: set.size, voorbeeld };
  });

  expect(r.uniek).toBe(2000);
  expect(r.voorbeeld.replace(/-/g, '').length).toBeGreaterThanOrEqual(12);
  expect(r.voorbeeld).not.toMatch(/^Kantine/);   // het oude, voorspelbare patroon
});

test('inloggegevens worden getoond met een kopieerknop en verdwijnen na het wisselen van tabblad', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await naarTab(page, 'beheer');
  await page.waitForSelector('.card');

  const kaart = page.locator('.card', { hasText: 'Accounts' });
  await kaart.locator('input[type=text]').first().fill('Nieuwe Vrijwilliger');
  await kaart.locator('input[type=email]').first().fill('nieuw@voorbeeld.nl');
  await page.getByRole('button', { name: 'Aanmaken' }).click();

  const box = page.locator('.tempbox');
  await expect(box).toContainText(/wachtwoord/i);
  await expect(box).toContainText(/wijzigen/i);
  await expect(page.getByRole('button', { name: 'Kopieer inloggegevens' })).toBeVisible();

  const verstuurd = s.signups.at(-1)?.password || '';
  expect(verstuurd.replace(/-/g, '').length).toBeGreaterThanOrEqual(12);

  await naarTab(page, 'rooster');
  await naarTab(page, 'beheer');
  await expect(page.locator('.tempbox')).toHaveCount(0);
});

test('een vaste kracht mag alleen zichzelf weghalen', async ({ page }) => {
  const s = stand({
    rol: 'vast',
    saturdays: [{ id: 's1', date: komendeZaterdag(), team_id: 't1', team_status: {}, label: '', blocks: null, bar_shifts: null }],
    barAssignments: [
      { saturday_id: 's1', shift_id: 'v1', staff_id: 'p1' },   // Wito, dat is deze gebruiker
      { saturday_id: 's1', shift_id: 'v1', staff_id: 'p2' },   // Els
    ],
  });
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await page.locator('.sathead').first().click();

  await expect(page.locator('.satbody .chip.staff')).toHaveCount(2);
  await expect(page.locator('.satbody .chip.staff .x')).toHaveCount(1);
  await expect(page.locator('.satbody .chip.staff', { has: page.locator('.x') })).toContainText('Wito');
});

test('een coördinator mag iedereen weghalen, na bevestiging', async ({ page }) => {
  const s = stand({
    rol: 'barco',
    saturdays: [{ id: 's1', date: komendeZaterdag(), team_id: 't1', team_status: {}, label: '', blocks: null, bar_shifts: null }],
    barAssignments: [
      { saturday_id: 's1', shift_id: 'v1', staff_id: 'p1' },
      { saturday_id: 's1', shift_id: 'v1', staff_id: 'p2' },
    ],
  });
  page.on('dialog', (d) => d.accept());
  await nepDatabase(page, s);
  await logInMetAccount(page);
  await page.locator('.sathead').first().click();

  await expect(page.locator('.satbody .chip.staff .x')).toHaveCount(2);
  await page.locator('.satbody .chip.staff .x').first().click();
  await expect.poll(() => s.deletes.length).toBe(1);
});

test('de melding onderin blokkeert de knoppenbalk niet', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  // melding oproepen en meteen op een knop in de balk proberen te klikken
  await page.evaluate(() => saved('Opgeslagen ✓'));
  const stijl = await page.evaluate(() => getComputedStyle(document.querySelector('#saving')).pointerEvents);
  expect(stijl).toBe('none');
});
