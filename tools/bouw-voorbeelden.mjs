/**
 * Bouwt een handvol voorbeeldbouwsels en schrijft ze weg als
 * tools/terreinbouwer/bouwsels.json.
 *
 * ── Getallen zijn niet genoeg ──────────────────────────────────────────────
 *
 * Een eerdere ronde ging hier de mist in. De bouwsels werden nagerekend — zoveel
 * voegen, zoveel sluiten er — en op grond daarvan goed bevonden, zonder dat er
 * ooit iemand naar gekeken had. Vijf van de zes waren onbruikbaar: hellingen die
 * over elkaar heen vielen omdat een stuk van 1×4 vier keer achter elkaar was
 * gezet in plaats van naast elkaar, water dat een kwart unit boven het gras
 * zweefde, een waterval zonder water erin, en hoeken waarvan de draaistand was
 * gekozen door een zoekfunctie die op het aantal sluitende voegen optimaliseert
 * en niet op hoe het eruitziet.
 *
 * De les staat in tools/kijk-bouwsels.mjs: die zet elk bouwsel op een plaatje in
 * docs/bouwsels/, en dat plaatje hoort bekeken te worden voordat er iets de deur
 * uit gaat. Een hoog aantal sluitende voegen zegt dat de randen op elkaar
 * passen. Het zegt niets over of het ergens op lijkt.
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

/** Korte schrijfwijze: een rij van hetzelfde stuk langs x. */
const rijX = (naam, z, vanX, totX, laag, slagen = 0) => {
  const uit = [];
  for (let x = vanX; x <= totX; x++) uit.push({ naam, x, z, laag, slagen });
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
    naam: 'Strand',
    waarover: 'Zand tegen zand, en zand tegen gras. Dat laatste scheelt een '
      + 'tiende unit in hoogte — zichtbaar of niet, dat is aan jou.',
    stukken: [
      ...vlak('beach-terrain-sand-floor', -2, 0, -1, 1, 0),
      ...vlak('hilly-terrain-grass-floor', 1, 2, -1, 1, 0),
    ],
  },
  {
    naam: 'Heuvel in het gras',
    waarover: 'Een glooiing van 0,1 naar 0,6, met gras op laag 0 ervoor en op '
      + 'laag 1 erachter — precies de hoogtes waar de helling op uitkomt.',
    stukken: [
      /* hilly-terrain-hill-side-gentle is 1 vak breed en 4 diep (z 0…3) en
       * loopt van y 0,1 naar 0,6. Vier stuks naast elkaar over x geven een
       * helling van vier vakken breed. Ze achter elkaar over z zetten laat ze
       * over elkaar heen vallen — dat was de fout van de vorige ronde. */
      ...vlak('hilly-terrain-hill-side-gentle', 0, 3, 0, 0, 0),
      ...vlak('hilly-terrain-grass-floor', 0, 3, -2, -1, 0),
      ...vlak('hilly-terrain-grass-floor', 0, 3, 4, 5, 1),
    ],
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

  /* ── tweede lichting ─────────────────────────────────────────────────────
   *
   * De eerste acht zijn beoordeeld: 353 voegen, waarvan zeven afgekeurd. Die
   * zeven zeggen samen twee dingen, en die twee dingen sturen deze lichting:
   *
   *   - een `-mid` met het gras er één laag hoger náást is fout (4×). Een wand
   *     moet eerst een `-top` krijgen; dáár ligt het gras tegenaan, en dat is
   *     zes keer goedgekeurd. Elke wand hieronder eindigt dus in een `-top`.
   *   - zand tegen gras is fout (3×), en de meting was het daarmee eens. Komt
   *     hier niet meer voor.
   *
   * Wat deze lichting toevoegt is de hoek. Van de 116 modellen in de kit waren
   * er dertien in gebruik; de hoekstukken — 34 stuks — nog geen. Een wand die
   * rechtdoor loopt is één soort voeg; een wand die om een hoek gaat is een
   * andere, en er is geen manier om vooraf te weten of die er goed uitziet.
   */
  {
    naam: 'Klifhoek naar buiten',
    waarover: 'Een plateau met een punt: twee klifwanden die om een bolle hoek '
      + 'heen draaien. Het hoekstuk deelt zijn randprofielen met de rechte wand, '
      + 'dus alles sluit — de vraag is of de hoek zelf niet te scherp oogt.',
    stukken: [
      ...rijZ('cliff-terrain-side-base', 0, -1, 0, 0),
      ...rijZ('cliff-terrain-side-top', 0, -1, 0, 1),
      { naam: 'cliff-terrain-corner-outer-1x1-base', x: 0, z: 1, laag: 0, slagen: 3 },
      { naam: 'cliff-terrain-corner-outer-1x1-top', x: 0, z: 1, laag: 1, slagen: 3 },
      ...rijX('cliff-terrain-side-base', 1, -2, -1, 0, 3),
      ...rijX('cliff-terrain-side-top', 1, -2, -1, 1, 3),
      ...vlak('hilly-terrain-grass-floor', -2, -1, -1, 0, 2),
    ],
  },
  {
    naam: 'Klifhoek naar binnen',
    waarover: 'Dezelfde wand, maar de hoek gaat de andere kant op: een hap uit '
      + 'de rand van het plateau. Buiten- en binnenhoek gebruiken hetzelfde paar '
      + 'randprofielen en zien er totaal anders uit.',
    stukken: [
      ...rijZ('cliff-terrain-side-base', 0, -2, -1, 0),
      ...rijZ('cliff-terrain-side-top', 0, -2, -1, 1),
      { naam: 'cliff-terrain-corner-inner-1x1-base', x: 0, z: 0, laag: 0 },
      { naam: 'cliff-terrain-corner-inner-1x1-top', x: 0, z: 0, laag: 1 },
      ...rijX('cliff-terrain-side-base', 0, 1, 2, 0, 1),
      ...rijX('cliff-terrain-side-top', 0, 1, 2, 1, 1),
      ...vlak('hilly-terrain-grass-floor', -2, -1, -2, 2, 2),
      ...vlak('hilly-terrain-grass-floor', 0, 2, 1, 2, 2),
    ],
  },
  {
    naam: 'Steilrandhoek naar buiten',
    waarover: 'Dezelfde hoek in steilrand, en hier zegt de meting iets anders. '
      + 'De hoekstukken dragen r093/r094 en de rechte wand r083/r084: die passen '
      + 'niet op elkaar, dus vier voegen sluiten niet. Het ziet er wel rond en '
      + 'heel uit. Precies zo\u2019n geval waarvoor jouw oordeel er is.',
    stukken: [
      ...rijZ('escarpment-terrain-side-base', 0, -1, 0, 0),
      ...rijZ('escarpment-terrain-side-top', 0, -1, 0, 1),
      { naam: 'escarpment-terrain-corner-outer-1x1-base', x: 0, z: 1, laag: 0, slagen: 3 },
      { naam: 'escarpment-terrain-corner-outer-1x1-top', x: 0, z: 1, laag: 1, slagen: 3 },
      ...rijX('escarpment-terrain-side-base', 1, -2, -1, 0, 3),
      ...rijX('escarpment-terrain-side-top', 1, -2, -1, 1, 3),
      ...vlak('hilly-terrain-grass-floor', -2, -1, -1, 0, 2),
    ],
  },
  {
    naam: 'Steilrand met binnenhoek',
    waarover: 'Drie lagen hoog met een binnenhoek erin: base, mid en top, ook in '
      + 'het hoekstuk. Hier zitten de stapelvoegen van een hoek in, en die zijn '
      + 'anders dan die van een rechte wand.',
    stukken: [
      ...rijZ('escarpment-terrain-side-base', 0, -2, -1, 0),
      ...rijZ('escarpment-terrain-side-mid', 0, -2, -1, 1),
      ...rijZ('escarpment-terrain-side-top', 0, -2, -1, 2),
      { naam: 'escarpment-terrain-corner-inner-1x1-base', x: 0, z: 0, laag: 0 },
      { naam: 'escarpment-terrain-corner-inner-1x1-mid', x: 0, z: 0, laag: 1 },
      { naam: 'escarpment-terrain-corner-inner-1x1-top', x: 0, z: 0, laag: 2 },
      ...rijX('escarpment-terrain-side-base', 0, 1, 2, 0, 1),
      ...rijX('escarpment-terrain-side-mid', 0, 1, 2, 1, 1),
      ...rijX('escarpment-terrain-side-top', 0, 1, 2, 2, 1),
      ...vlak('hilly-terrain-grass-floor', -2, -1, -2, 2, 3),
      ...vlak('hilly-terrain-grass-floor', 0, 2, 1, 2, 3),
    ],
  },
  {
    naam: 'Rotsen aan de voet van de wand',
    waarover: 'Losse rotsen tegen de onderkant van een klifwand. Props hoefden '
      + 'tot nu toe alleen tegen gras te staan; hier raken ze een wand, en dat is '
      + 'een ander soort voeg.',
    stukken: [
      ...rijZ('cliff-terrain-side-base', 0, -1, 1, 0),
      ...rijZ('cliff-terrain-side-top', 0, -1, 1, 1),
      ...vlak('hilly-terrain-grass-floor', -2, -1, -1, 1, 2),
      { naam: 'cliff-prop-rock-a', x: 1, z: 0, laag: 0 },
      { naam: 'cliff-prop-rock-b', x: 1, z: 1, laag: 0 },
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
