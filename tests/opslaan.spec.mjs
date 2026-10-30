// De belangrijkste controle van allemaal.
//
// Twee mensen kunnen tegelijk in dezelfde dienstdag zitten: het kaderlid op
// de tribune en de barcoördinator thuis. De app stuurde vroeger de hele
// dienstdag in één keer naar de server, en wie als laatste iets aanvinkte
// wiste daarmee de invoer van de ander. Dat is gerepareerd: vlak voor het
// opslaan haalt de app de serverversie op en zet alleen de eigen
// wijzigingen daar overheen. Deze tests bewaken dat.

import { test, expect } from '@playwright/test';
import { stand, nepDatabase, logInAlsTeam, logInMetAccount } from './helpers/app.mjs';

test.describe('Opslaan van afgevinkte taken', () => {
  test('samenvoegen laat de invoer van de ander staan', async ({ page }) => {
    const s = stand();
    await nepDatabase(page, s);
    await page.goto('/');

    const uitkomst = await page.evaluate(() => {
      // op de server staat al iets: taak 2 van blok 1, ingevuld door een ander
      const server = { b1: [{ done: false, name: '' }, { done: true, name: 'Els' }] };
      // bij mij op het scherm staat alleen mijn eigen vinkje bij taak 1
      const mijn = { b1: [{ done: true, name: 'Wito' }, { done: false, name: '' }] };
      // en ik heb alleen taak 1 aangeraakt
      const aangeraakt = new Set(['b1\u0000' + 0]);
      return mergeStatus(server, mijn, aangeraakt);
    });

    expect(uitkomst.b1[0]).toEqual({ done: true, name: 'Wito' });
    expect(uitkomst.b1[1]).toEqual({ done: true, name: 'Els' });
  });

  test('samenvoegen raakt blokken die ik niet aanraakte niet aan', async ({ page }) => {
    const s = stand();
    await nepDatabase(page, s);
    await page.goto('/');

    const uitkomst = await page.evaluate(() => {
      const server = { b1: [{ done: true, name: 'Els' }], b2: [{ done: true, name: 'Joop' }] };
      const mijn = { b1: [{ done: false, name: '' }], b2: [{ done: false, name: '' }] };
      return mergeStatus(server, mijn, new Set(['b1\u0000' + 0]));
    });

    expect(uitkomst.b1[0].name).toBe('');       // dit heb ik gewist, dat mag
    expect(uitkomst.b2[0].name).toBe('Joop');   // hier bleef ik vanaf
  });

  test('kaderlid met teamcode overschrijft de ander niet', async ({ page }) => {
    const s = stand();
    await nepDatabase(page, s);
    await logInAlsTeam(page);

    // terwijl het kaderlid kijkt, vult iemand anders taak 2 in
    s.serverStatus = { b1: [{ done: false, name: '' }, { done: true, name: 'Els' }] };

    await page.locator('#content .block').first().locator('input[type=checkbox]').first().check();

    // Let op: niet wachten op de tekst "Opgeslagen" — die staat al in de pagina
    // voordat er iets bewaard is. Wachten op het verzoek zelf is het enige
    // betrouwbare signaal.
    await expect.poll(() => s.rpc.filter((r) => r.fn === 'team_set_status').length,
      { message: 'de app moet het bewaren via team_set_status', timeout: 10_000 }).toBe(1);

    const opslag = s.rpc.filter((r) => r.fn === 'team_set_status').at(-1);
    expect(opslag.body.p_status.b1[0].done).toBe(true);        // mijn vinkje
    expect(opslag.body.p_status.b1[1].name).toBe('Els');       // en dat van de ander
  });

  test('beheerder met account overschrijft de ander niet', async ({ page }) => {
    const s = stand();
    await nepDatabase(page, s);
    await logInMetAccount(page);

    s.serverStatus = { b1: [{ done: false, name: '' }, { done: true, name: 'Els' }] };

    await page.locator('.sathead').first().click();
    await page.locator('.satbody .block').first().locator('input[type=checkbox]').first().check();

    await expect.poll(() => s.patches.filter((p) => p.tabel === 'saturdays' && p.body.team_status).length,
      { message: 'de app moet de dienstdag bijwerken', timeout: 10_000 }).toBe(1);

    const patch = s.patches.filter((p) => p.tabel === 'saturdays' && p.body.team_status).at(-1);
    expect(patch.body.team_status.b1[0].done).toBe(true);
    expect(patch.body.team_status.b1[1].name).toBe('Els');
  });

  test('de app zegt het als er invoer van een ander is bijgekomen', async ({ page }) => {
    const s = stand();
    await nepDatabase(page, s);
    await logInAlsTeam(page);

    s.serverStatus = { b1: [{ done: false, name: '' }, { done: true, name: 'Els' }] };

    await page.locator('#content .block').first().locator('input[type=checkbox]').first().check();
    await expect(page.locator('#saving')).toContainText('ook invoer van een ander', { timeout: 10_000 });
  });

  test('mislukt opslaan geeft een zichtbare foutmelding, geen stilte', async ({ page }) => {
    const s = stand();
    await nepDatabase(page, s);
    await logInAlsTeam(page);

    // vanaf nu weigert de server het opslaan
    await page.route('**/rpc/team_set_status', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));

    await page.locator('#content .block').first().locator('input[type=checkbox]').first().check();
    const toast = page.locator('#saving');
    await expect(toast).toContainText('mislukt', { timeout: 10_000 });
    await expect(toast).toHaveClass(/err/);
  });
});
