/**
 * Genereert kits/helden-kit/vuurtoren.glb — het eerste "held"-object.
 *
 * Draai vanuit de repo-root:  node tools/maak-vuurtoren.mjs
 *
 * Het model volgt asset_style_guide.md:
 * - alle kleuren zijn bestaande cellen uit de gedeelde colormap (zie CEL in
 *   tools/modelbouw.mjs); de UV van elk vlak wijst naar een gradiënttrede
 *   binnen zo'n cel — de schacht wisselt per vlakje tussen de twee middelste
 *   treden, wat het handgemaakte lapjeswerk geeft zonder nieuwe kleuren;
 * - platte-stukken-bouw: de toren is een 14-zijdige veelhoek, de lantaarn en
 *   het dak zijn 8-zijdig (max 16 per volledige cirkel);
 * - de schacht loopt hol toe (exponent < 1), zodat hij aan de voet
 *   uitwaaiert in plaats van als een rechte kegel te eindigen;
 * - basis op Y = 0, pivot in het midden van de voetafdruk (2 × 2 tegels,
 *   diameter 1,76 — de stoep aan de +Z-kant blijft binnen de tegelrand);
 * - vlakke shading: elk vlak heeft eigen vertices met de vlaknormaal, licht
 *   en schaduw komen uit de scène.
 */

import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CEL, uvCel, ruis, maakBouwer, op, hoeken, controleerStijl, schrijfGlb,
} from './modelbouw.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'helden-kit', 'vuurtoren.glb');

const KLEUR = Object.fromEntries(
  Object.entries(CEL).map(([naam, c]) => [naam, uvCel(c)]),
);

const bouwer = maakBouwer();
const { vlak, trommel, schijf, ringvlak, kegel, blok, paaltje } = bouwer;

/* -- de vuurtoren ---------------------------------------------------------- */

const ZIJDEN = 14; // de toren zelf; lantaarn en dak blijven 8-zijdig

// Plint: lage stenen voet met richel waar de schacht op staat.
const PLINT_R = 0.88, PLINT_H = 0.25, SCHACHT_R0 = 0.75;
schijf(ZIJDEN, PLINT_R, 0, KLEUR.steen, false);
trommel(ZIJDEN, PLINT_R, 0, PLINT_R, PLINT_H, KLEUR.steen);
ringvlak(ZIJDEN, SCHACHT_R0, PLINT_R, PLINT_H, KLEUR.steen);

// Schacht: vijf smalle banden, wit onder en boven. De straal volgt een
// machtsfunctie in plaats van een rechte lijn: onderaan waaiert de toren
// uit, bovenin loopt hij bijna recht — de klassieke vuurtorenlijn.
const SCHACHT_TOP = 4.65, SCHACHT_R1 = 0.48;
const straal = (y) => {
  const t = (y - PLINT_H) / (SCHACHT_TOP - PLINT_H);
  return SCHACHT_R0 + (SCHACHT_R1 - SCHACHT_R0) * Math.pow(t, 0.82);
};
const BANDEN = 5, RINGEN_PER_BAND = 2;
const BAND_H = (SCHACHT_TOP - PLINT_H) / BANDEN;
for (let band = 0; band < BANDEN; band++) {
  const celVanBand = band % 2 === 0 ? CEL.wit : CEL.rood;
  for (let sub = 0; sub < RINGEN_PER_BAND; sub++) {
    const ringIndex = band * RINGEN_PER_BAND + sub;
    const y0 = PLINT_H + (ringIndex * BAND_H) / RINGEN_PER_BAND;
    const y1 = PLINT_H + ((ringIndex + 1) * BAND_H) / RINGEN_PER_BAND;
    const h = hoeken(ZIJDEN);
    for (let z = 0; z < ZIJDEN; z++) {
      // Per vlakje één van de twee middelste gradiënttreden van de cel:
      // bestaand kleurverloop uit de atlas, dus geen verzonnen tint.
      const rij = 1 + Math.round(ruis(ringIndex * 7 + 1, z * 3 + 2));
      vlak(uvCel(celVanBand, rij),
        op(straal(y0), y0, h[z]), op(straal(y0), y0, h[z + 1]),
        op(straal(y1), y1, h[z + 1]), op(straal(y1), y1, h[z]));
    }
  }
}

// Donkere metalen kraag waar de schacht de omloop raakt.
const KRAAG_H = 0.10, KRAAG_R = straal(SCHACHT_TOP) + 0.015;
ringvlak(ZIJDEN, straal(SCHACHT_TOP - KRAAG_H), KRAAG_R, SCHACHT_TOP - KRAAG_H, KLEUR.donker, false);
trommel(ZIJDEN, KRAAG_R, SCHACHT_TOP - KRAAG_H, KRAAG_R, SCHACHT_TOP, KLEUR.donker);

// Omloop: stenen vloer die uitsteekt, met reling van paaltjes en een leuning.
const OMLOOP_R = 0.70, OMLOOP_Y0 = SCHACHT_TOP, OMLOOP_Y1 = 4.77;
ringvlak(ZIJDEN, straal(SCHACHT_TOP), OMLOOP_R, OMLOOP_Y0, KLEUR.steen, false);
trommel(ZIJDEN, OMLOOP_R, OMLOOP_Y0, OMLOOP_R, OMLOOP_Y1, KLEUR.steen);
schijf(ZIJDEN, OMLOOP_R, OMLOOP_Y1, KLEUR.steen);

const RELING_R = 0.645, RELING_TOP = 5.08, LEUNING_H = 0.05;
for (const hoek of hoeken(12).slice(0, 12)) {
  paaltje(RELING_R, 0.028, OMLOOP_Y1, RELING_TOP, hoek, KLEUR.donker);
}
const LB = 0.030; // halve dikte van de leuning
trommel(12, RELING_R + LB, RELING_TOP, RELING_R + LB, RELING_TOP + LEUNING_H, KLEUR.donker);
trommel(12, RELING_R - LB, RELING_TOP + LEUNING_H, RELING_R - LB, RELING_TOP, KLEUR.donker);
ringvlak(12, RELING_R - LB, RELING_R + LB, RELING_TOP + LEUNING_H, KLEUR.donker);
ringvlak(12, RELING_R - LB, RELING_R + LB, RELING_TOP, KLEUR.donker, false);

// Lantaarn: open kooi van acht donkere stijlen met de gele lamp erin.
const KOOI_R = 0.345, KOOI_TOP = 5.38;
for (const hoek of hoeken(8).slice(0, 8)) {
  paaltje(KOOI_R, 0.026, OMLOOP_Y1, KOOI_TOP, hoek, KLEUR.donker);
}
const LAMP_R = 0.29;
schijf(8, LAMP_R, 4.85, KLEUR.lamp, false);
trommel(8, LAMP_R, 4.85, LAMP_R, 5.33, KLEUR.lamp);
schijf(8, LAMP_R, 5.33, KLEUR.lamp);

// Dak: rode kegel met overstek, en een donkere piek als bliksemafleider.
const DAK_R = 0.45;
ringvlak(8, KOOI_R - 0.026, DAK_R, KOOI_TOP, KLEUR.rood, false);
kegel(8, DAK_R, KOOI_TOP, 6.05, KLEUR.rood);
trommel(4, 0.028, 5.95, 0.028, 6.24, KLEUR.donker);
kegel(4, 0.028, 6.24, 6.34, KLEUR.donker);

// Deur aan de +Z-kant: houten paneel met afgeschuinde bovenhoeken, iets
// vóór de schacht. De achterkant verdwijnt in de muur en blijft dicht.
// De diepte volgt de muur: apotheem = afstand van de as tot het vlakmidden.
const apotheem = (y) => straal(y) * Math.cos(Math.PI / ZIJDEN);
{
  const y0 = PLINT_H, y1 = 0.95, half = 0.19, schuin = 0.10;
  const voor = apotheem(y0) + 0.05, achter = apotheem(y1) - 0.10;
  const profiel = [ // tegen de klok in, gezien vanaf +Z
    [-half, y0], [half, y0], [half, y1 - schuin],
    [half - schuin, y1], [-half + schuin, y1], [-half, y1 - schuin],
  ];
  vlak(KLEUR.hout, ...profiel.map(([x, y]) => [x, y, voor]));
  for (let i = 0; i < profiel.length; i++) {
    const [x1, y1a] = profiel[i];
    const [x2, y2a] = profiel[(i + 1) % profiel.length];
    vlak(KLEUR.hout, [x2, y2a, voor], [x1, y1a, voor], [x1, y1a, achter], [x2, y2a, achter]);
  }
}

// Stoep voor de deur: één stenen traptrede tot aan de tegelrand (z = 1,0).
blok(-0.30, 0, 0.84, 0.30, PLINT_H, 1.00, KLEUR.steen, ['achter', 'onder']);

// Ramen: donkere openingen op de +Z-kant, om en om op een rode en witte
// band, kleiner naarmate de toren smaller wordt.
const RAMEN = [
  { midden: 1.55, half: 0.085, hoogte: 0.26 },
  { midden: 2.45, half: 0.075, hoogte: 0.24 },
  { midden: 3.35, half: 0.065, hoogte: 0.22 },
];
for (const raam of RAMEN) {
  const y0 = raam.midden - raam.hoogte / 2, y1 = raam.midden + raam.hoogte / 2;
  const voor = apotheem(y0) + 0.025, achter = apotheem(y1) - 0.06;
  blok(-raam.half, y0, achter, raam.half, y1, voor, KLEUR.donker, ['achter']);
}

/* -- controleren en schrijven ---------------------------------------------- */

const { maxHoogte, maxAfstand } = controleerStijl(bouwer, { maxHalf: 1.0 });
const { vertices, driehoeken } = schrijfGlb(bouwer, DOEL, 'vuurtoren', {
  generator: 'tools/maak-vuurtoren.mjs',
});
console.log(
  `${DOEL} — ${vertices} vertices, ${driehoeken} driehoeken, ` +
  `hoogte ${maxHoogte.toFixed(2)}, halve voetafdruk ${maxAfstand.toFixed(2)}`,
);
