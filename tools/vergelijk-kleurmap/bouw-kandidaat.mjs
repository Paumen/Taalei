/**
 * Bouwt colormap-v2.png uit colormap-v2-aangeleverd.png.
 *
 * Draaien vanuit de repo-root:
 *   node tools/vergelijk-kleurmap/bouw-kandidaat.mjs
 *
 * De aangeleverde atlas blijft ongemoeid bewaard, zodat na te lopen is wat er
 * aan is veranderd en waarom. Er zijn drie regels, in deze volgorde:
 *
 *   1. Cel 5,0 is de houtbaan. De aangeleverde atlas zette hem op dezelfde rode
 *      baan als het dak en het vuur, waardoor boomstammen, planken, trappen en
 *      scheepsrompen rood werden. Hij krijgt een eigen houttoon.
 *
 *   2. De cellen 3,1 en 4,1 dragen de graspollen en blijven staan zoals ze in
 *      kits/colormap.png staan: allebei de baan van cel 3,1 daar.
 *
 *   3. Cellen met dezelfde kleur delen één baan, en die baan krijgt het verval
 *      in lichtheid dat diezelfde cellen nu hebben. De aangeleverde atlas gaf
 *      elke baan ongeveer hetzelfde verval — rond 19 in L* — ook waar de huidige
 *      atlas vlak is of juist heel steil. Per familie wordt daarom het
 *      gemiddelde verval van de huidige cellen genomen, en dat verval krijgt
 *      elke cel van de familie: gelijke kleur, gelijke baan.
 */

import { copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesPng, schrijfPng } from '../png.mjs';
import { voegGradientCelToe } from '../kleurmap.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HIER, '..', '..');

/** De houttoon voor cel 5,0; het verval eromheen regelt regel 3. */
const HOUT = ['#dda06a', '#7a4f2c'];

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const leeg = (c) => c[0] + c[1] + c[2] === 0;
const px = (im, x, y) => { const i = (y * im.breedte + x) * 4; return [im.pixels[i], im.pixels[i+1], im.pixels[i+2]]; };
const midden = (kolom) => kolom * 32 + 16;

/* sRGB ↔ lineair ↔ L*: het verval moet gaan over wat het oog als licht-donker
 * ziet, niet over bytes. */
const naarLin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const naarSrgb = (u) => { const s = u <= 0.0031308 ? u * 12.92 : 1.055 * Math.pow(u, 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, s)) * 255); };
const Y = (c) => 0.2126 * naarLin(c[0]) + 0.7152 * naarLin(c[1]) + 0.0722 * naarLin(c[2]);
const ster = (c) => { const y = Y(c); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };
const uitSter = (L) => (L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3);

/** Zelfde kleurtoon, andere lichtheid: de luminantie wordt naar `doelL` geschaald. */
function opLichtheid(kleur, doelL) {
  const y = Y(kleur);
  if (y <= 0) return kleur;
  const factor = uitSter(Math.max(0, doelL)) / y;
  return kleur.map((v) => naarSrgb(naarLin(v) * factor));
}

const huidig = leesPng(join(ROOT, 'kits', 'colormap.png'));
const atlas = leesPng(join(HIER, 'colormap-v2-aangeleverd.png'));

/* -- regel 1: de houtbaan --------------------------------------------------- */
voegGradientCelToe(atlas, [5, 0], rgb(HOUT[0]), rgb(HOUT[1]));

/* -- regel 2: de graspollen ------------------------------------------------- */
const GRASPOLLEN = [[3, 1], [4, 1]];
for (const [kolom, rij] of GRASPOLLEN) {
  for (let i = 0; i < 128; i++) {
    const y = rij * 128 + i;
    for (let j = 0; j < 32; j++) {
      const bron = (y * huidig.breedte + 3 * 32 + j) * 4;  // cel 3,1 van de huidige atlas
      const doel = (y * atlas.breedte + kolom * 32 + j) * 4;
      for (let k = 0; k < 4; k++) atlas.pixels[doel + k] = huidig.pixels[bron + k];
    }
  }
}

/* -- regel 3: één baan per kleur, met het verval van nu --------------------- */
const vast = new Set(GRASPOLLEN.map((c) => c.join(',')));
const families = new Map();      // 'boven→onder' van de aangeleverde baan → cellen
for (let rij = 0; rij < 4; rij++) {
  for (let kolom = 0; kolom < 16; kolom++) {
    const naam = `${kolom},${rij}`;
    if (vast.has(naam)) continue;
    const boven = px(atlas, midden(kolom), rij * 128);
    const onder = px(atlas, midden(kolom), rij * 128 + 127);
    if (leeg(boven)) continue;
    const sleutel = `${hex(boven)}→${hex(onder)}`;
    if (!families.has(sleutel)) families.set(sleutel, { boven, onder, cellen: [] });
    families.get(sleutel).cellen.push([kolom, rij]);
  }
}

const regels = [];
for (const [sleutel, familie] of families) {
  /* het verval dat deze cellen nu hebben; cellen die nu leeg zijn tellen niet mee */
  const vervallen = familie.cellen
    .map(([kolom, rij]) => {
      const boven = px(huidig, midden(kolom), rij * 128);
      const onder = px(huidig, midden(kolom), rij * 128 + 127);
      return leeg(boven) ? null : Math.max(0, ster(boven) - ster(onder));
    })
    .filter((v) => v !== null);

  if (vervallen.length === 0) {
    /* Geen van deze cellen bestaat nu: niets om naar terug te rekenen. */
    regels.push({ sleutel, cellen: familie.cellen, verval: null });
    continue;
  }

  const doel = vervallen.reduce((a, b) => a + b, 0) / vervallen.length;
  const mid = px(atlas, midden(familie.cellen[0][0]), familie.cellen[0][1] * 128 + 64);
  const Lmid = ster(mid);
  /* Een baan die vroeger vlak was, hoort vlak te blijven: twee kleurtonen op
   * gelijke lichtheid zouden alsnog een verloop opleveren. */
  const boven = doel < 1.5 ? mid : opLichtheid(familie.boven, Lmid + doel / 2);
  const onder = doel < 1.5 ? mid : opLichtheid(familie.onder, Lmid - doel / 2);
  for (const cel of familie.cellen) voegGradientCelToe(atlas, cel, boven, onder);
  regels.push({ sleutel, cellen: familie.cellen, verval: doel, vervallen, baan: `${hex(boven)} → ${hex(onder)}` });
}

schrijfPng(join(HIER, 'colormap-v2.png'), atlas);

console.log('| familie | cellen | verval nu | doel | baan |');
console.log('| --- | --- | --- | ---: | --- |');
for (const r of regels) {
  const cellen = r.cellen.map((c) => c.join(',')).join(' · ');
  if (r.verval === null) { console.log(`| \`${r.sleutel}\` | ${cellen} | _cellen zijn nu leeg_ | — | onveranderd |`); continue; }
  console.log(`| \`${r.sleutel}\` | ${cellen} | ${r.vervallen.map((v) => v.toFixed(1)).join(', ')} | ${r.verval.toFixed(1)} | \`${r.baan}\` |`);
}
console.log(`\ncellen 3,1 en 4,1 dragen de baan van cel 3,1 uit kits/colormap.png`);
