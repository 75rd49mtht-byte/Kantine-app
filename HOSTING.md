# De kantine-app online zetten (Cloudflare Pages)

Alles wat online moet, staat in deze map `site`. Upload dus deze map — niet de map
erboven, want daar staan de back-up en het SQL-bestand die niemand hoeft te zien.

Inhoud van `site`:

| Bestand | Waarvoor |
|---|---|
| `index.html` | de app zelf (dit is vanaf nu het bestand dat je bewerkt) |
| `manifest.webmanifest` | zorgt dat de app als snelkoppeling op het beginscherm kan |
| `icon-192.png`, `icon-512.png` | het clublogo als app-pictogram |
| `_headers` | cache-instellingen en het verbod op indexeren door zoekmachines |
| `robots.txt` | houdt zoekmachines weg |
| `HOSTING.md` | dit bestand |

## 1. Eenmalig: de site aanmaken

1. Log in op `dash.cloudflare.com` (gratis account is genoeg).
2. Ga naar **Workers & Pages**.
3. Kies **Create application** → **Pages** → **Drag and drop your files**.
4. Geef het project een naam, bijvoorbeeld `kantine-arnhemseboys`. Die naam komt
   terug in het tijdelijke adres.
5. Sleep de map `site` in het vlak (of een zip ervan).
6. Kies **Deploy site**.

Je krijgt een adres als `kantine-arnhemseboys.pages.dev`. Daarmee werkt de app al.

Grenzen bij slepen: maximaal 1.000 bestanden en 25 MB per bestand. Wij zitten op
zes bestanden van samen nog geen 250 kB, dus dat is ruim voldoende.

## 2. Het clubadres eraan hangen

1. Open het project → **Custom domains** → **Set up a domain**.
2. Vul in: `kantine.arnhemseboys.nl` → **Continue**.
3. Staat `arnhemseboys.nl` al bij Cloudflare, dan zet Cloudflare de DNS-regel er
   zelf in nadat je bevestigt. Klaar.
4. Staat de DNS ergens anders (bijvoorbeeld bij de provider van de clubsite), dan
   maak je daar deze regel aan:

   | Type | Naam | Waarde |
   |---|---|---|
   | CNAME | `kantine` | `kantine-arnhemseboys.pages.dev` |

   Doe dit pas **nadat** je stap 1 en 2 hierboven hebt gedaan. Zet je de CNAME er
   eerder neer, dan krijg je een foutmelding 522 en werkt het adres niet.

Het certificaat regelt Cloudflare zelf; dat kan een paar minuten duren.

## 3. Later een nieuwe versie uitrollen

Open het project → **Create deployment** (of **Upload assets**) en sleep de map
`site` er opnieuw in. De vorige versie blijft bewaard, dus je kunt met één klik
terug als er iets misgaat.

`index.html` staat op `no-cache`, dus teamleiders zien een nieuwe versie zodra ze
de app opnieuw openen. Geen gedoe met browsers die de oude versie vasthouden.

## 4. Teamleiders op weg helpen

Stuur ze het adres met deze uitleg erbij:

> Open `kantine.arnhemseboys.nl` op je telefoon en vul de code in die je van de
> kantinecoördinator hebt gekregen. Wil je hem snel bij de hand hebben: op een
> iPhone tik je op het deelicoon en daarna op "Zet op beginscherm"; op Android
> staat "Toevoegen aan startscherm" in het menu rechtsboven. De app opent dan als
> een gewone app.

## Waar je op moet letten

- De teamcode van 5 tekens is wat een team afschermt. Dat is genoeg voor een
  kantinerooster, maar het is geen slot: wie de code heeft, ziet de ingevulde
  namen van dat team. Deel codes dus via de teamleider en niet in een
  openbare groep.
- De app praat rechtstreeks met Supabase. Gaat Supabase eruit, dan doet de app
  het niet; het adres zelf blijft dan gewoon bereikbaar.
- De sleutel in `index.html` is de publieke Supabase-sleutel en hoort zichtbaar
  te zijn. De echte bescherming zit in de rechten op de database.
