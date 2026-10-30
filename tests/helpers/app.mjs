// Gedeelde hulpmiddelen voor de tests.
//
// De app praat met Supabase. In de tests laten we hem niet met de echte
// database praten — dat zou traag zijn, en erger: de tests zouden dan het
// echte rooster kunnen veranderen. In plaats daarvan onderscheppen we elk
// verzoek naar supabase.co en antwoorden we zelf. Zo weten we precies wat de
// app te zien krijgt, en kunnen we naderhand nakijken wát de app wilde
// opslaan.

/** Datum van vandaag plus (of min) een aantal dagen, als 2026-10-30. */
export function dag(verschil = 0) {
  const d = new Date();
  d.setDate(d.getDate() + verschil);
  return d.toISOString().slice(0, 10);
}

/** De eerstvolgende zaterdag, nooit vandaag. */
export function komendeZaterdag() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

/** De eerstvolgende woensdag — om te testen dat de app die weigert. */
export function komendeWoensdag() {
  const d = new Date();
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

/** De instellingen die de app bij het opstarten ophaalt. */
export const CONFIG = {
  club: 'Arnhemse Boys',
  blocks: [
    { id: 'b1', label: 'Blok 1', start: '08:00', end: '11:00', tasks: ['Bar', 'Keuken'] },
    { id: 'b2', label: 'Blok 2', start: '11:00', end: '14:00', tasks: ['Bar', 'Keuken'] },
  ],
  bar_shifts: [
    { id: 'v1', label: 'Ochtend', start: '07:30', end: '12:00' },
    { id: 'v2', label: 'Middag', start: '12:00', end: '16:00' },
  ],
  task_info: {},
  general_info: '',
};

/**
 * Maakt een verse "database" aan. Alles is te overschrijven per test.
 * Wat de app wegschrijft komt in posts / patches / deletes / rpc terecht,
 * zodat een test kan nakijken wat er verstuurd is.
 */
export function stand(extra = {}) {
  return {
    rol: 'admin',
    teams: [
      { id: 't1', name: 'JO11-1', sort: 1 },
      { id: 't2', name: 'JO11-2', sort: 2 },
      { id: 't3', name: 'JO13-1', sort: 3 },
    ],
    barStaff: [{ id: 'p1', name: 'Wito', user_id: 'u1' }, { id: 'p2', name: 'Els Bakker', user_id: null }],
    teamCodes: [{ team_id: 't1', code: 'aaaaa' }],
    barAssignments: [],
    saturdays: null,       // null = standaardrooster hieronder
    teamSaturdays: null,   // antwoord op team_saturdays (teamcode-login)
    swaps: [],             // antwoord op team_swap_list
    swapOptions: [],       // antwoord op team_swap_options
    adminSwaps: [],        // antwoord op swap_admin_list
    teamCodePatchLeeg: false, // doet alsof er nog geen coderegel bestaat
    weigerDatum: null,     // deze datum geeft een 409 bij het aanmaken
    posts: [], patches: [], deletes: [], rpc: [], signups: [],
    ...extra,
  };
}

function standaardZaterdagen() {
  return [
    { id: 's0', date: dag(-14), team_id: 't1', team_status: {}, label: '', blocks: null, bar_shifts: null },
    { id: 's1', date: dag(7), team_id: 't2', team_status: {}, label: '', blocks: null, bar_shifts: null },
    { id: 's2', date: dag(14), team_id: 't3', team_status: {}, label: '', blocks: null, bar_shifts: null },
  ];
}

/** Hangt de nep-database aan een pagina. Aanroepen vóór page.goto(). */
export async function nepDatabase(page, s) {
  await page.route('**supabase.co/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const m = req.method();
    let body = {};
    if (m === 'POST' || m === 'PATCH') {
      try { body = JSON.parse(req.postData() || '{}'); } catch { body = {}; }
    }
    const json = (d, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(d),
    });
    const leeg = () => route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });

    // --- inloggen met e-mailadres ---
    if (url.includes('/auth/v1/signup')) { s.signups.push(body); return json({ id: 'u9', user: { id: 'u9' } }); }
    if (url.includes('/auth/v1/token')) return json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: 'u1' } });

    // --- functies op de server ---
    const fn = url.match(/\/rpc\/([a-z_]+)/)?.[1];
    if (fn) {
      s.rpc.push({ fn, body });
      switch (fn) {
        case 'public_config': return json(CONFIG);
        case 'team_login': return json([{ id: 't1', name: s.teams[0].name }]);
        case 'team_saturdays': return json(s.teamSaturdays ?? [
          { id: 's1', date: komendeZaterdag(), team_status: s.serverStatus ?? {}, bar: {}, label: '', blocks: null, bar_shifts: null },
        ]);
        case 'team_set_status': return json([]);
        case 'team_swap_list': return json(s.swaps);
        case 'team_swap_options': return json(s.swapOptions);
        case 'team_swap_create': return json([{ ok: true }]);
        case 'team_swap_respond': return json([{ ok: true }]);
        case 'swap_admin_list': return json(s.adminSwaps);
        case 'swap_decide': return json([{ ok: true }]);
        default: return json([]);
      }
    }

    // --- gewone tabellen ---
    if (url.includes('/rest/v1/profiles?select=name,role')) return json([{ name: 'Wito', role: s.rol }]);
    if (url.includes('/rest/v1/profiles')) return json([{ id: 'u1', name: 'Wito', role: s.rol }]);
    if (url.includes('/rest/v1/teams')) return json(s.teams);
    if (url.includes('/rest/v1/bar_staff')) return json(s.barStaff);

    if (url.includes('/rest/v1/team_codes')) {
      if (m === 'PATCH') { s.patches.push({ tabel: 'team_codes', url, body }); return json(s.teamCodePatchLeeg ? [] : [{ team_id: 't1', code: body.code }]); }
      if (m === 'POST') { s.posts.push({ tabel: 'team_codes', body }); return json([body], 201); }
      return json(s.teamCodes);
    }

    if (url.includes('/rest/v1/bar_assignments')) {
      if (m === 'POST') { s.posts.push({ tabel: 'bar_assignments', body }); return json([body], 201); }
      if (m === 'DELETE') { s.deletes.push(url); return leeg(); }
      return json(s.barAssignments);
    }

    if (url.includes('/rest/v1/saturdays')) {
      if (m === 'POST') {
        s.posts.push({ tabel: 'saturdays', body });
        if (s.weigerDatum && body.date === s.weigerDatum) return json({ message: 'bestaat al' }, 409);
        return json([body], 201);
      }
      if (m === 'PATCH') { s.patches.push({ tabel: 'saturdays', url, body }); return json([body]); }
      // de app vraagt vlak voor het opslaan alleen team_status op
      if (url.includes('select=team_status')) return json([{ team_status: s.serverStatus ?? {} }]);
      return json(s.saturdays ?? standaardZaterdagen());
    }

    return json([]);
  });
}

/** Inloggen met een teamcode (de route die een kaderlid loopt). */
export async function logInAlsTeam(page, code = 'aaaaa') {
  await page.goto('/');
  await page.fill('#codeInput', code);
  await page.click('#codeBtn');
  await page.waitForSelector('#content .block, #content .sat, #content .empty', { timeout: 10_000 });
}

/** Inloggen met een account (barcoördinator, vaste kracht of beheerder). */
export async function logInMetAccount(page) {
  await page.goto('/');
  await page.click('#tabAcc');
  await page.fill('#accEmail', 'wito@voorbeeld.nl');
  await page.fill('#accPass', 'geheim1234');
  await page.click('#accBtn');
  await page.waitForSelector('#content .sat, #content .empty', { timeout: 10_000 });
}

/** Naar een tabblad in de navigatiebalk onderin. */
export async function naarTab(page, naam) {
  await page.click(`#navbar button[data-tab="${naam}"]`);
}
