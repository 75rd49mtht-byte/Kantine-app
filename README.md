# Kantinediensten Arnhemse Boys

De app waarmee kaders de bardiensten van hun team invullen, plus de controles
erop. Kantinedienst geldt voor de teams onder JO17 (JO7 t/m JO16 en de
MO-teams in dezelfde leeftijden).

## Wat staat waar

| Map | Wat erin zit |
| --- | --- |
| `site/` | De app zelf. Dit is wat er online staat — één `index.html` met alles erin, plus de iconen en de instellingen voor de webhosting. |
| `sql/` | Scripts voor de database bij Supabase. Draaien doe je in de SQL-editor van Supabase, niet vanaf hier. |
| `tests/` | De controles op de app. Zie hieronder. |
| `tools/` | Een kleine webserver om `site/` lokaal te openen. |

## De app bekijken

```
npm install
npm start
```

Daarna staat de app op <http://127.0.0.1:4173/>. Hij praat dan wel met de
echte database, dus wat je daar invult staat er ook echt in.

## De controles draaien

```
npm test
```

De eerste keer heb je ook een testbrowser nodig:

```
npx playwright install chromium
```

De tests praten **niet** met de echte database. Elk verzoek naar Supabase
wordt onderschept en beantwoord door `tests/helpers/app.mjs`. Je kunt ze dus
zonder risico draaien: er verandert niets aan het echte rooster.

Na een mislukte test:

```
npm run rapport
```

Draai je in een omgeving die al een Chromium klaar heeft staan, zet dan
`CHROMIUM_PAD` op het pad daarvan.

### Wat er gecontroleerd wordt

- `opslaan.spec.mjs` — dat twee mensen tegelijk in dezelfde dienstdag kunnen
  typen zonder elkaars invoer te wissen. Dit is de belangrijkste van allemaal.
- `rooster.spec.mjs` — dat afgelopen zaterdagen standaard niet in de weg
  staan, dat de waarschuwing over lege bardiensten alleen over komende dagen
  gaat, en dat de printversie klopt bij dagen met eigen tijdvakken.
- `beheer.spec.mjs` — dienstdagen aanmaken: geen zaterdag wordt gemeld, de
  teams rouleren door, een dubbele datum houdt de rest niet tegen, en een
  teamcode wordt ook bewaard als er nog geen regel voor dat team bestond.
- `ruilen.spec.mjs` — de hele route: team vraagt, ander team gaat akkoord,
  coördinator bevestigt. Pas na die derde stap wisselt de dienstdag echt.
- `veiligheid.spec.mjs` — dat ingetypte scripttekst gewoon tekst blijft, dat
  tijdelijke wachtwoorden niet te raden zijn, en wie welke namen mag weghalen.

Bij elke push draaien ze ook op GitHub, zie het tabblad **Actions**.

## Online zetten

De map `site/` gaat als geheel naar Cloudflare Pages. Zie `HOSTING.md`.

Let op: de tests draaien náást de uitrol, niet ervóór. Een mislukte test
houdt een nieuwe versie dus niet tegen — je krijgt er wel bericht van.

## Waar de app online staat

`kantine-app.pages.dev` — Cloudflare Pages, gekoppeld aan deze repo. Een push
naar `main` rolt vanzelf uit.

Er draaien nog oudere kopieën van dezelfde app op andere adressen, die wel
dezelfde database gebruiken. Die horen weg: zolang ze bestaan kan iemand per
ongeluk in een versie werken waarin fouten zitten die hier allang gerepareerd
zijn.

## Nog te doen

- `sql/rooster-najaar-2026.sql` is nog niet uitgevoerd, en de datums erin zijn
  verlopen — die moeten eerst opnieuw gezet worden.
- Het subdomein `kantine.arnhemseboys.nl` is nog niet gekoppeld. Het DNS van
  `arnhemseboys.nl` zit niet bij Netlify of Cloudflare maar bij de hoster van
  de clubsite; daar is één CNAME-regel nodig.
- Een rol intrekken verwijdert nu alleen de profielregel, niet het account
  zelf. Daar is een serverfunctie voor nodig.
