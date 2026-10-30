// Ruilen: een team vraagt, een team gaat akkoord, de coördinator bevestigt.
// Pas na die derde handtekening wisselt de dienstdag echt van team.

import { test, expect } from '@playwright/test';
import { stand, nepDatabase, logInAlsTeam, logInMetAccount, naarTab, komendeZaterdag, dag } from './helpers/app.mjs';

const EIGEN_DAG = komendeZaterdag();
const ANDERE_DAG = dag(21);

test('een team kan een ruil voorstellen aan een ander team', async ({ page }) => {
  const s = stand({
    swapOptions: [{ sat_id: 's9', sat_date: ANDERE_DAG, sat_label: '', t_name: 'JO13-1' }],
  });
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  await page.getByRole('button', { name: '🔁 Ruilen' }).first().click();
  const paneel = page.locator('.swappanel');
  await expect(paneel).toContainText('JO13-1');

  await paneel.locator('input[type=text]').fill('Wij zijn dat weekend op toernooi');
  await paneel.getByRole('button', { name: 'Voorstel versturen' }).click();

  await expect.poll(() => s.rpc.filter((r) => r.fn === 'team_swap_create').length).toBe(1);
  const verzoek = s.rpc.find((r) => r.fn === 'team_swap_create').body;
  expect(verzoek.p_kind).toBe('ruil');
  expect(verzoek.p_to_saturday).toBe('s9');
  expect(verzoek.p_note).toBe('Wij zijn dat weekend op toernooi');
});

test('aanbieden op het prikbord vraagt eerst om bevestiging', async ({ page }) => {
  const s = stand();
  const gevraagd = [];
  page.on('dialog', (d) => { gevraagd.push(d.message()); d.accept(); });
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  await page.getByRole('button', { name: '📌 Aanbieden' }).first().click();

  await expect.poll(() => gevraagd.join(' ')).toMatch(/prikbord/i);
  await expect.poll(() => s.rpc.filter((r) => r.fn === 'team_swap_create').length).toBe(1);
  expect(s.rpc.find((r) => r.fn === 'team_swap_create').body.p_kind).toBe('overname');
});

test('het gevraagde team ziet het voorstel en kan akkoord geven', async ({ page }) => {
  const s = stand({
    swaps: [{
      req_id: 'r1', req_kind: 'ruil', req_status: 'open', direction: 'in',
      from_team_name: 'JO11-1', to_team_name: 'JO11-2',
      from_sat_id: 's9', from_sat_date: ANDERE_DAG, from_sat_label: '',
      to_sat_id: 's1', to_sat_date: EIGEN_DAG, to_sat_label: '',
      note: 'Wij kunnen echt niet',
    }],
  });
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  await expect(page.locator('.swaprow').first()).toContainText('JO11-1 wil ruilen');
  await page.getByRole('button', { name: 'Akkoord' }).first().click();

  await expect.poll(() => s.rpc.filter((r) => r.fn === 'team_swap_respond').length).toBe(1);
  const antwoord = s.rpc.find((r) => r.fn === 'team_swap_respond').body;
  expect(antwoord.p_id).toBe('r1');
  expect(antwoord.p_action).toBe('accepteer');
});

test('een lopend voorstel is zichtbaar bij de dienstdag zelf', async ({ page }) => {
  const s = stand({
    swaps: [{
      req_id: 'r2', req_kind: 'ruil', req_status: 'wacht_barco', direction: 'uit',
      from_team_name: 'JO11-1', to_team_name: 'JO13-1',
      from_sat_id: 's1', from_sat_date: EIGEN_DAG, from_sat_label: '',
      to_sat_id: 's9', to_sat_date: ANDERE_DAG, to_sat_label: '',
      note: '',
    }],
  });
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  const balk = page.locator('.swapbar').first();
  await expect(balk).toContainText('Ruilvoorstel naar JO13-1');
  await expect(balk).toContainText('coördinator');   // status: wacht op de coördinator
});

test('de coördinator ziet hoeveel er klaarstaat en kan goedkeuren', async ({ page }) => {
  const s = stand({
    rol: 'barco',
    adminSwaps: [{
      req_id: 'r3', req_kind: 'ruil', req_status: 'wacht_barco',
      from_team_name: 'JO11-1', to_team_name: 'JO13-1',
      from_sat_id: 's1', from_sat_date: EIGEN_DAG, from_sat_label: '',
      to_sat_id: 's9', to_sat_date: ANDERE_DAG, to_sat_label: '',
      note: '', barco_note: '',
    }],
  });
  await nepDatabase(page, s);
  await logInMetAccount(page);

  // het tellertje op het tabblad
  await expect(page.locator('#navbar button[data-tab="ruil"] .navcount')).toHaveText('1');

  await naarTab(page, 'ruil');
  await expect(page.locator('.swapsub').first()).toContainText('Wacht op jouw goedkeuring (1)');
  // de app waarschuwt wat goedkeuren betekent
  await expect(page.locator('.swaprow').first()).toContainText('leeggemaakt');

  await page.getByRole('button', { name: 'Goedkeuren' }).click();

  await expect.poll(() => s.rpc.filter((r) => r.fn === 'swap_decide').length).toBe(1);
  const besluit = s.rpc.find((r) => r.fn === 'swap_decide').body;
  expect(besluit.p_id).toBe('r3');
  expect(besluit.p_approve).toBe(true);
});

test('een kaderlid komt niet bij het goedkeuren-tabblad', async ({ page }) => {
  const s = stand();
  await nepDatabase(page, s);
  await logInAlsTeam(page);

  // de knop bestaat wel in de pagina, maar is voor een teamcode-login verborgen
  await expect(page.locator('#navbar button[data-tab="ruil"]')).toBeHidden();
});
