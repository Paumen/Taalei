# Taaleiland

Taalgame voor basisschoolkinderen (groep 5–6) die moeite hebben met de
Nederlandse taal. Zie [`brainstorm.md`](brainstorm.md) voor het concept, de
doelgroep en de uitgangspunten.

## 3D-catalogus

`index.html` is een catalogus van alle 3D-modellen in `kits/`, met een live
3D-preview per model. De catalogus staat op GitHub Pages en heeft twee
weergaven over dezelfde 292 modellen:

- **Kits** — gegroepeerd per Kenney-kit, met de zones waarvoor de kit bedoeld
  is en een link naar de bron.
- **Semantische groepen** — gegroepeerd op wat een model *is* (bomen, rotsen,
  hekken, schepen …), op naam gesorteerd zodat dezelfde prop uit verschillende
  kits naast elkaar staat. Handig om overlap te zien en om per zone een
  consistente set te kiezen.

Per model tonen we het aantal driehoeken en de bestandsgrootte. Modellen vanaf
1.500 driehoeken worden rood gemarkeerd; die zijn relevant voor de
rendering-budgetten (de `modular-cave-kit` zit gemiddeld op ~1.570 driehoeken en
wordt daarom pas geladen zodra je de grot in gaat).

Zoeken kan in het Nederlands: "boom", "kist", "wegwijzer" en "startkamp" vinden
respectievelijk `tree`, `chest`, `signpost` en alles uit de startkamp-zones.

### Lokaal bekijken

De pagina laadt `catalog.json` via `fetch`, dus hij heeft een webserver nodig
(`file://` werkt niet):

```sh
python3 -m http.server 8000   # of: npx serve .
```

Daarna: <http://localhost:8000/>

### Catalogus opnieuw genereren

`catalog.json` wordt volledig afgeleid van de bestanden in `kits/`, zodat de
catalogus niet uit de pas kan lopen. Draai na het toevoegen of verwijderen van
modellen:

```sh
node tools/build-catalog.mjs
```

Het script leest elk `.glb`-bestand uit voor het aantal driehoeken en
materialen, en waarschuwt als een model geen semantische groep of Nederlands
trefwoord krijgt. De indeling zelf staat in
[`tools/semantiek.mjs`](tools/semantiek.mjs) — daar pas je groepen, regels en
zoekwoorden aan.

### Publiceren

De workflow in `.github/workflows/static.yml` publiceert de repo naar GitHub
Pages bij elke commit, op elke branch. De site staat op
<https://paumen.github.io/Taalei/>.

De enige vereiste instelling is *Settings → Pages → Source* op **GitHub
Actions**.

De deploy-job is bewust niet aan de `github-pages`-omgeving gekoppeld. Met
`environment: github-pages` toetst GitHub de deployment aan de branch-regels van
die omgeving, en dat weigerde elke run vanaf een andere branch dan `main` binnen
twee seconden — zonder runner en zonder logs. Zonder die koppeling draait de job
gewoon en gaat de deployment via de Pages-API, waarvoor `pages: write` en
`id-token: write` volstaan.

Dat verschil is meteen het handigste diagnosemiddel: faalt een run zónder
toegewezen runner en zonder logs, dan is hij geweigerd vóórdat de workflow
draaide en zit het in een instelling. Faalt hij óp een runner, dan is er een
echt probleem in de workflow.

Pages heeft één live site, dus de laatst gepushte branch wint: werk je op twee
branches tegelijk, dan zie je steeds die van de laatste push.

## Bestanden

| Pad | Wat |
| --- | --- |
| `kits/` | Zeven Kenney-kits (CC0), inclusief textures en `LICENSE.txt` per kit |
| `kits/manifest.js` | Kit-metadata: naam, bronlink en de zones waarvoor de kit bedoeld is |
| `kits/palet.json` | Kleurcellen van de gedeelde colormap en welke modellen ze gebruiken |
| `catalog.json` | Gegenereerd — modellen met kit, groep, driehoeken en grootte |
| `vendor/model-viewer.min.js` | `<model-viewer>` van Google, meegeleverd zodat de pagina geen externe verzoeken doet |

Alle 3D-kits komen van [Kenney](https://kenney.nl/) en zijn CC0.
