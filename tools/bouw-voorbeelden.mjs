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
 * Zoekt de draaistanden op in plaats van ze te gokken.
 *
 * Bij een hoek of een helling is niet uit het hoofd te zeggen welke kwartslag
 * de goede is; dat hangt van de vorm af, en de vorm staat in de meting. Deze
 * functie probeert alle standen voor elke groep en houdt de stand over waarbij
 * de meeste voegen sluiten.
 *
 * Dat is met opzet de meting als hulpmiddel en niet als scheidsrechter: het
 * levert een bouwsel op dat de kit gebruikt zoals hij in elkaar zit, zodat er
 * iets zinnigs te beoordelen valt. Of het er goed uitziet blijft de vraag die
 * de bouwer moet beantwoorden.
 *
 * @param {object[]} vast      stukken met een vaste stand
 * @param {object[][]} groepen elke groep krijgt één gezamenlijke draaistand
 */
function metBesteDraai(vast, groepen) {
  let beste = null;

  const probeer = (standen) => {
    const stukken = [
      ...vast,
      ...groepen.flatMap((groep, i) => groep.map((stuk) => ({ ...stuk, slagen: standen[i] }))),
    ];
    const model = new Bouwsel(kit);
    for (const stuk of stukken) model.zet(stuk);
    const voegen = naden(model);
    const score = voegen.filter((n) => n.sluit).length - (voegen.length - voegen.filter((n) => n.sluit).length);
    if (!beste || score > beste.score) beste = { score, stukken, voegen: voegen.length };
  };

  const loop = (i, standen) => {
    if (i === groepen.length) return probeer(standen);
    for (let s = 0; s < 4; s++) loop(i + 1, [...standen, s]);
    return undefined;
  };
  loop(0, []);

  return beste.stukken;
}

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
    naam: 'Klifhoek naar binnen',
    waarover: 'Een binnenbocht van drie lagen waar twee wanden samenkomen. De '
      + 'draaistanden zijn opgezocht, niet gegokt.',
    stukken: metBesteDraai(
      [
        ...rijZ('cliff-terrain-side-base', 0, 1, 2, 0),
        ...rijZ('cliff-terrain-side-mid', 0, 1, 2, 1),
        ...rijZ('cliff-terrain-side-top', 0, 1, 2, 2),
      ],
      [
        [
          { naam: 'cliff-terrain-corner-inner-1x1-base', x: 0, z: 0, laag: 0 },
          { naam: 'cliff-terrain-corner-inner-1x1-mid', x: 0, z: 0, laag: 1 },
          { naam: 'cliff-terrain-corner-inner-1x1-top', x: 0, z: 0, laag: 2 },
        ],
        [
          { naam: 'cliff-terrain-side-base', x: -1, z: 0, laag: 0 },
          { naam: 'cliff-terrain-side-mid', x: -1, z: 0, laag: 1 },
          { naam: 'cliff-terrain-side-top', x: -1, z: 0, laag: 2 },
          { naam: 'cliff-terrain-side-base', x: -2, z: 0, laag: 0 },
          { naam: 'cliff-terrain-side-mid', x: -2, z: 0, laag: 1 },
          { naam: 'cliff-terrain-side-top', x: -2, z: 0, laag: 2 },
        ],
      ],
    ),
  },
  {
    naam: 'Klifhoek naar buiten',
    waarover: 'Een buitenbocht van 2×2 over drie lagen. Zijn -mid vult maar drie '
      + 'van de vier vakken; het lege vak hoort erbij.',
    stukken: metBesteDraai(
      [
        ...rijZ('cliff-terrain-side-base', 0, 2, 3, 0),
        ...rijZ('cliff-terrain-side-mid', 0, 2, 3, 1),
        ...rijZ('cliff-terrain-side-top', 0, 2, 3, 2),
      ],
      [
        [
          { naam: 'cliff-terrain-corner-outer-2x2-base', x: 0, z: 0, laag: 0 },
          { naam: 'cliff-terrain-corner-outer-2x2-mid', x: 0, z: 0, laag: 1 },
          { naam: 'cliff-terrain-corner-outer-2x2-top', x: 0, z: 0, laag: 2 },
        ],
        /* Een tweede arm, anders raakt de hoek maar aan één kant iets en valt
         * er nauwelijks een voeg te beoordelen. */
        [
          { naam: 'cliff-terrain-side-base', x: 2, z: -1, laag: 0 },
          { naam: 'cliff-terrain-side-mid', x: 2, z: -1, laag: 1 },
          { naam: 'cliff-terrain-side-top', x: 2, z: -1, laag: 2 },
          { naam: 'cliff-terrain-side-base', x: 3, z: -1, laag: 0 },
          { naam: 'cliff-terrain-side-mid', x: 3, z: -1, laag: 1 },
          { naam: 'cliff-terrain-side-top', x: 3, z: -1, laag: 2 },
        ],
      ],
    ),
  },
  {
    naam: 'Heuvel in het gras',
    waarover: 'Een glooiing van 0,1 naar 0,6 met de grasvlakte eronder en '
      + 'erboven. Hellingen zijn de lastigste voegen van de kit.',
    stukken: metBesteDraai(
      [
        ...vlak('hilly-terrain-grass-floor', -2, -1, -1, 2, 0),
        ...vlak('hilly-terrain-grass-floor', 3, 4, -1, 2, 1),
      ],
      [[
        { naam: 'hilly-terrain-hill-side-gentle', x: 0, z: -1, laag: 0 },
        { naam: 'hilly-terrain-hill-side-gentle', x: 0, z: 0, laag: 0 },
        { naam: 'hilly-terrain-hill-side-gentle', x: 0, z: 1, laag: 0 },
        { naam: 'hilly-terrain-hill-side-gentle', x: 0, z: 2, laag: 0 },
      ]],
    ),
  },
  {
    naam: 'Beek',
    waarover: 'Water tussen het gras. Het water ligt op 0,35 en het gras op 0,1 — '
      + 'de vraag is of dat een oever is of een fout.',
    stukken: [
      ...vlak('hilly-terrain-grass-floor', -2, -1, -2, 2, 0),
      ...vlak('hilly-terrain-water-flat', 0, 0, -2, 2, 0),
      ...vlak('hilly-terrain-grass-floor', 1, 2, -2, 2, 0),
    ],
  },
  {
    naam: 'Strandhelling',
    waarover: 'Van zand op 0 via de helling naar zand op 0,25. Zes vakken lang, '
      + 'dus zes voegen in één stuk.',
    stukken: metBesteDraai(
      [
        ...vlak('beach-terrain-sand-floor', -2, -1, 0, 5, 0),
        ...vlak('beach-terrain-sand-floor-raised', 1, 2, 0, 5, 0),
      ],
      [[{ naam: 'beach-terrain-sand-side-gentle', x: 0, z: 0, laag: 0 }]],
    ),
  },
  {
    naam: 'Berg op de vlakte',
    waarover: 'Een berg van 5×5 vakken en 3,4 units hoog, in het gras gezet. De '
      + 'enige stukken van de kit die geen enkele rand met iets anders delen.',
    stukken: [
      ...vlak('hilly-terrain-grass-floor', -3, 3, -3, 3, 0),
      { naam: 'mountain-a', x: 0, z: 0, laag: 0 },
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
