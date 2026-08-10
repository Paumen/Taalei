/**
 * Bouwt een handvol voorbeeldbouwsels en schrijft ze weg als
 * tools/terreinbouwer/bouwsels.json.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/bouw-voorbeelden.mjs            # schrijf het bestand
 *     node tools/bouw-voorbeelden.mjs --toon     # met een verslag per bouwsel
 *
 * Waarvoor: de bouwer laat je oordelen over combinaties, maar dan moet er wel
 * iets staan om over te oordelen. Zelf tegel voor tegel een klifwand
 * neerzetten op een telefoon is werk; deze bouwsels leveren in één tik een
 * stuk terrein op waar tien tot twintig voegen in zitten.
 *
 * Het zijn met opzet gewone bouwsels en geen showstukken. Ze gebruiken de kit
 * zoals hij bedoeld lijkt — een klifwand van base, mid en top met de
 * grasvlakte erachter een laag hoger — juist omdat dát de combinaties zijn
 * waarover een oordeel de moeite waard is.
 *
 * Elk bouwsel wordt hier nagerekend voordat het het bestand in gaat: hoeveel
 * voegen het oplevert, hoeveel verschillende combinaties, en wat de meting
 * ervan zegt. Een bouwsel dat per ongeluk uit losse stukken bestaat zou
 * niemand iets te beoordelen geven, en dat wil je merken vóór het op een
 * telefoon staat.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kit, Bouwsel, controleer, naden } from './terreinbouwer/aansluiting.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UIT = join(ROOT, 'tools', 'terreinbouwer', 'bouwsels.json');
const kit = new Kit(JSON.parse(readFileSync(join(ROOT, 'kits/modulair-terrein/aansluitingen.json'), 'utf8')));

/** Korte schrijfwijze: een rij van hetzelfde stuk langs z. */
const rijZ = (naam, x, vanZ, totZ, laag, slagen = 0) => {
  const uit = [];
  for (let z = vanZ; z <= totZ; z++) uit.push({ naam, x, z, laag, slagen });
  return uit;
};

/** Een vlak van hetzelfde stuk. */
const vlak = (naam, vanX, totX, vanZ, totZ, laag, slagen = 0) => {
  const uit = [];
  for (let x = vanX; x <= totX; x++) {
    for (let z = vanZ; z <= totZ; z++) uit.push({ naam, x, z, laag, slagen });
  }
  return uit;
};

/**
 * De bouwsels.
 *
 * De hoogtes zijn geen gok. `cliff-terrain-side-top` op laag L eindigt op
 * L · 0,5 + 0,6, en `hilly-terrain-grass-floor` op laag L+1 ligt op
 * (L+1) · 0,5 + 0,1 — dezelfde hoogte. Vandaar dat de grasvlakte achter een
 * klif van drie lagen op laag 3 ligt en niet op laag 2.
 */
const BOUWSELS = [
  {
    naam: 'Grasvlakte',
    waarover: 'De eenvoudigste voeg die er is: gras tegen gras, twaalf keer.',
    stukken: vlak('hilly-terrain-grass-floor', -1, 2, -1, 1, 0),
  },
  {
    naam: 'Klifwand van drie lagen',
    waarover: 'Base, mid en top op elkaar, en de grasvlakte erachter een laag '
      + 'hoger. Hier zitten de stapelvoegen én de wandvoegen in.',
    stukken: [
      ...rijZ('cliff-terrain-side-base', 0, -1, 1, 0),
      ...rijZ('cliff-terrain-side-mid', 0, -1, 1, 1),
      ...rijZ('cliff-terrain-side-top', 0, -1, 1, 2),
      ...vlak('hilly-terrain-grass-floor', -2, -1, -1, 1, 3),
    ],
  },
  {
    naam: 'Steilrand van drie lagen',
    waarover: 'Hetzelfde als de klifwand, maar met escarpment. De stukken heten '
      + 'hetzelfde en hun voorkant is anders — de moeite van het vergelijken waard.',
    stukken: [
      ...rijZ('escarpment-terrain-side-base', 0, -1, 1, 0),
      ...rijZ('escarpment-terrain-side-mid', 0, -1, 1, 1),
      ...rijZ('escarpment-terrain-side-top', 0, -1, 1, 2),
      ...vlak('hilly-terrain-grass-floor', -2, -1, -1, 1, 3),
    ],
  },
  {
    naam: 'Klif en steilrand naast elkaar',
    waarover: 'Dezelfde wand, half klif en half steilrand. De voegen sluiten aan '
      + 'en het oppervlak golft ertussen: precies een geval waarin de meting je '
      + 'niets zegt en je oordeel alles.',
    stukken: [
      ...rijZ('cliff-terrain-side-mid', 0, -1, 0, 0),
      ...rijZ('escarpment-terrain-side-mid', 0, 1, 2, 0),
      ...vlak('hilly-terrain-grass-floor', -1, -1, -1, 2, 1),
    ],
  },
  {
    naam: 'Waterval',
    waarover: 'De watervalstukken over drie lagen, met het water erin.',
    stukken: [
      { naam: 'cliff-terrain-waterfall-base-flat', x: 0, z: 0, laag: 0 },
      { naam: 'cliff-terrain-waterfall-mid', x: 0, z: 0, laag: 1 },
      { naam: 'cliff-terrain-waterfall-top', x: 0, z: 0, laag: 2 },
      { naam: 'cliff-terrain-side-base', x: 0, z: -1, laag: 0 },
      { naam: 'cliff-terrain-side-mid', x: 0, z: -1, laag: 1 },
      { naam: 'cliff-terrain-side-top', x: 0, z: -1, laag: 2 },
      { naam: 'cliff-terrain-side-base', x: 0, z: 1, laag: 0 },
      { naam: 'cliff-terrain-side-mid', x: 0, z: 1, laag: 1 },
      { naam: 'cliff-terrain-side-top', x: 0, z: 1, laag: 2 },
    ],
  },
  {
    naam: 'Strand',
    waarover: 'Zand tegen zand, en zand tegen gras. Dat laatste scheelt een '
      + 'tiende unit in hoogte — zichtbaar of niet, dat is aan jou.',
    stukken: [
      ...vlak('beach-terrain-sand-floor', -2, 0, -1, 1, 0),
      ...vlak('hilly-terrain-grass-floor', 1, 2, -1, 1, 0),
    ],
  },
  {
    naam: 'Keien op gras',
    waarover: 'Props in hetzelfde vak als de tegel eronder. Hun omtrek raakt de '
      + 'buurtegels wél, dus de meting ziet er voegen die niet sluiten — terwijl '
      + 'er niets mis is. Twaalf van de twintig sluiten; de rest is aan jou.',
    stukken: [
      ...vlak('hilly-terrain-grass-floor', -1, 1, -1, 1, 0),
      { naam: 'shared-prop-boulder-a', x: -1, z: -1, laag: 0 },
      { naam: 'shared-prop-boulder-c', x: 0, z: 1, laag: 0 },
      { naam: 'hilly-prop-rock-b', x: 1, z: 0, laag: 0 },
    ],
  },
];

/* -- nakijken en wegschrijven ---------------------------------------------- */

const toon = process.argv.includes('--toon');
const uit = [];

for (const bouwsel of BOUWSELS) {
  const model = new Bouwsel(kit);
  for (const stuk of bouwsel.stukken) model.zet(stuk);

  const voegen = naden(model);
  const meldingen = controleer(model);
  const combinaties = new Set(voegen.map((n) => n.sleutel));
  const sluiten = voegen.filter((n) => n.sluit).length;

  uit.push({ ...bouwsel, stukken: bouwsel.stukken });

  console.log(
    `${bouwsel.naam.padEnd(34)} ${String(bouwsel.stukken.length).padStart(3)} stukken, `
    + `${String(voegen.length).padStart(3)} voegen, `
    + `${String(combinaties.size).padStart(2)} combinaties, `
    + `${sluiten}/${voegen.length} sluit volgens de meting`,
  );

  if (voegen.length === 0) {
    console.warn(`  ! ${bouwsel.naam} levert geen enkele voeg op — er valt niets te beoordelen`);
  }

  if (toon) {
    for (const soort of new Set(meldingen.map((m) => m.soort))) {
      const hoeveel = meldingen.filter((m) => m.soort === soort).length;
      console.log(`    ${hoeveel}× ${soort}`);
    }
  }
}

writeFileSync(UIT, `${JSON.stringify({
  kit: 'modulair-terrein',
  gemaakt: 'node tools/bouw-voorbeelden.mjs',
  toelichting: 'Voorbeeldbouwsels om in tools/terreinbouwer/ te openen en te beoordelen.',
  bouwsels: uit,
}, null, 1)}\n`);

console.log(`\n${uit.length} bouwsels → ${UIT.replace(`${ROOT}/`, '')}`);
