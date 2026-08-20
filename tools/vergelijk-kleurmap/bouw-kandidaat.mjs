/**
 * Bouwt colormap-v2.png uit colormap-v2-aangeleverd.png — de atlas die nu in
 * kits/ ligt.
 *
 * Draaien vanuit de repo-root:
 *   node tools/vergelijk-kleurmap/bouw-kandidaat.mjs
 *
 * De aangeleverde atlas blijft ongemoeid bewaard en colormap-v1.png is de
 * gedeelde atlas van vóór deze wijziging. Het bouwen leest uit die twee, niet
 * uit kits/colormap.png, want daar ligt inmiddels het resultaat.
 *
 * Vier regels, in deze volgorde:
 *
 *   1. Cel 5,0 is de houtbaan. De aangeleverde atlas zette hem op dezelfde rode
 *      baan als het dak en het vuur, waardoor boomstammen, planken, trappen en
 *      scheepsrompen rood werden.
 *
 *   2. De cellen 3,1 en 4,1 dragen de graspollen en blijven staan zoals ze in
 *      colormap-v1.png stonden: allebei de baan van cel 3,1 daar.
 *
 *   3. Cellen met dezelfde kleur delen één baan, en een paar families gaan
 *      samen — zie SAMEN. Dat drukt het aantal kleuren verder omlaag; de keuze
 *      valt op families die dicht bij elkaar liggen en die weinig modellen
 *      delen, want juist die modellen verliezen het onderscheid.
 *
 *   4. Elke familie krijgt de lichtheid terug van de cellen die hij vervangt:
 *      zowel het midden als het verval, gewogen naar hoeveel modellen een cel
 *      gebruiken. De kleurtoon blijft die van de aangeleverde atlas. Zonder die
 *      correctie wordt het palet als geheel donkerder — en een cel als 13,0,
 *      die het kaarsvet en het tafelgoed licht houdt, verkleurt dan naar bruin.
 *
 * De baan zelf loopt door OKLab in plaats van rechttoe rechtaan door sRGB: de
 * lichtheid loopt gelijkmatig, en naar de schaduw toe wordt de kleur iets
 * verzadigder. Dat is hoe verf zich gedraagt en het leest voller dan een rechte
 * lijn tussen twee hexen.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesPng, schrijfPng } from '../png.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HIER, '..', '..');

/** De kleurtoon voor cel 5,0; lichtheid en verval regelt regel 4. */
const HOUT = '#c08a55';

/** Families die samengaan, aangewezen met één cel uit elk. */
const SAMEN = [
  [['8,0'], ['10,0'], 'de twee donkerste banen'],
  [['5,2'], ['5,3'], 'gebroken wit en zand'],
];

/* Niet samengevoegd, hoewel ze dicht bij elkaar liggen: het blauwgrijs van de
 * rotsen (3,2 en 15,3) en het grijsbruin van de grond (14,3). Ze delen maar
 * vijftien modellen, maar samen zouden ze de aarden vloeren blauw maken — het
 * grijsbruin hangt aan 216 modellen die er juist warm horen uit te zien. */

/** Hoeveel verzadigder de onderkant van een baan is dan de bovenkant. */
const SCHADUWVERZADIGING = 0.22;

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const leeg = (c) => c[0] + c[1] + c[2] === 0;
const px = (im, x, y) => { const i = (y * im.breedte + x) * 4; return [im.pixels[i], im.pixels[i+1], im.pixels[i+2]]; };
const midden = (kolom) => kolom * 32 + 16;

/* -- kleurruimtes ---------------------------------------------------------- */

const naarLin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const naarSrgb = (u) => { const s = u <= 0.0031308 ? u * 12.92 : 1.055 * Math.pow(u, 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, s)) * 255); };
const Y = (c) => 0.2126 * naarLin(c[0]) + 0.7152 * naarLin(c[1]) + 0.0722 * naarLin(c[2]);
/** CIE-lichtheid: waar het oog licht van donker aan afmeet. */
const ster = (c) => { const y = Y(c); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };
const uitSter = (L) => (L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3);

function naarOklab([r, g, b]) {
  const [R, G, B] = [naarLin(r), naarLin(g), naarLin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function uitOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    naarSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    naarSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    naarSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

/** De OKLab-lichtheid van een grijs met deze CIE-lichtheid. */
const oklabLVanSter = (Lster) => { const y = uitSter(Math.max(0, Lster)); return naarOklab([naarSrgb(y), naarSrgb(y), naarSrgb(y)])[0]; };

/**
 * Een kleur binnen het bereik van het scherm houden door verzadiging terug te
 * nemen: buiten bereik knijpen de kanalen af en verschuift de kleurtoon.
 */
function binnenBereik(L, C, h) {
  for (let i = 0; i <= 12; i++) {
    const c = C * (1 - i / 12);
    const kleur = uitOklab([L, c * Math.cos(h), c * Math.sin(h)]);
    const terug = naarOklab(kleur);
    if (Math.abs(terug[0] - L) < 0.012) return kleur;
  }
  return uitOklab([L, 0, 0]);
}

/* -- inlezen --------------------------------------------------------------- */

const oud = leesPng(join(HIER, 'colormap-v1.png'));
const atlas = leesPng(join(HIER, 'colormap-v2-aangeleverd.png'));

/** Hoeveel modellen een cel gebruiken, volgens kits/palet.json. */
const gewichten = new Map();
{
  const palet = JSON.parse(readFileSync(join(ROOT, 'kits', 'palet.json'), 'utf8'));
  const gedeeld = palet.paletten.find((p) => p.id === 'gedeeld');
  for (const cel of gedeeld?.cellen ?? []) {
    const modellen = new Set((cel.bronnen ?? []).flatMap((b) => (b.modellen ?? []).map((m) => `${b.kit}/${m}`)));
    gewichten.set(cel.cel.join(','), modellen.size);
  }
}

/* -- regel 2: de graspollen ------------------------------------------------ */

const GRASPOLLEN = ['3,1', '4,1'];
for (const naam of GRASPOLLEN) {
  const kolom = Number(naam.split(',')[0]);
  const rij = Number(naam.split(',')[1]);
  for (let i = 0; i < 128; i++) {
    const y = rij * 128 + i;
    for (let j = 0; j < 32; j++) {
      const bron = (y * oud.breedte + 3 * 32 + j) * 4;   // cel 3,1 van de oude atlas
      const doel = (y * atlas.breedte + kolom * 32 + j) * 4;
      for (let k = 0; k < 4; k++) atlas.pixels[doel + k] = oud.pixels[bron + k];
    }
  }
}

/* -- families ------------------------------------------------------------- */

const families = new Map();   // sleutel → { toon, cellen }
for (let rij = 0; rij < 4; rij++) {
  for (let kolom = 0; kolom < 16; kolom++) {
    const naam = `${kolom},${rij}`;
    if (GRASPOLLEN.includes(naam)) continue;
    const boven = px(atlas, midden(kolom), rij * 128);
    if (leeg(boven)) continue;
    /* regel 1: cel 5,0 hoort niet bij het rood maar krijgt zijn eigen houttoon */
    const sleutel = naam === '5,0' ? 'hout' : hex(boven) + '→' + hex(px(atlas, midden(kolom), rij * 128 + 127));
    if (!families.has(sleutel)) {
      families.set(sleutel, { toon: naam === '5,0' ? rgb(HOUT) : px(atlas, midden(kolom), rij * 128 + 64), cellen: [] });
    }
    families.get(sleutel).cellen.push(naam);
  }
}

/* regel 3: aangewezen families samenvoegen. De kleurtoon wordt het gewogen
 * midden van de twee, in OKLab, naar hoeveel modellen elke kant meebrengt — de
 * kleinste kant helemaal laten vallen zou hem te ver verschuiven. */
const sleutelVan = (cel) => [...families].find(([, f]) => f.cellen.includes(cel))?.[0];
const samengevoegd = [];
for (const [[celA], [celB], omschrijving] of SAMEN) {
  const a = sleutelVan(celA);
  const b = sleutelVan(celB);
  if (!a || !b || a === b) continue;
  const [groot, klein] = gewicht(families.get(a).cellen) >= gewicht(families.get(b).cellen) ? [a, b] : [b, a];
  const wg = gewicht(families.get(groot).cellen);
  const wk = gewicht(families.get(klein).cellen);
  const deel = wk / (wg + wk || 1);
  const [tg, tk] = [naarOklab(families.get(groot).toon), naarOklab(families.get(klein).toon)];
  families.get(groot).toon = uitOklab([0, 1, 2].map((i) => tg[i] + (tk[i] - tg[i]) * deel));
  families.get(groot).cellen.push(...families.get(klein).cellen);
  families.delete(klein);
  samengevoegd.push(`${omschrijving}: ${families.get(groot).cellen.join(' · ')}`);
}

function gewicht(cellen) {
  return cellen.reduce((a, c) => a + (gewichten.get(c) ?? 0), 0);
}

/* -- regel 4: lichtheid terug, en de baan door OKLab ----------------------- */

function schrijfBaan(cel, rijen) {
  const kolom = Number(cel.split(',')[0]);
  const rij = Number(cel.split(',')[1]);
  for (let i = 0; i < 128; i++) {
    const kleur = rijen[i];
    for (let j = 0; j < 32; j++) {
      const p = ((rij * 128 + i) * atlas.breedte + kolom * 32 + j) * 4;
      atlas.pixels[p] = kleur[0];
      atlas.pixels[p + 1] = kleur[1];
      atlas.pixels[p + 2] = kleur[2];
      atlas.pixels[p + 3] = 255;
    }
  }
}

const regels = [];
for (const [sleutel, familie] of families) {
  /* waar deze cellen in de oude atlas stonden: midden en verval, gewogen naar
   * hoeveel modellen ze gebruiken */
  const bron = familie.cellen
    .map((cel) => {
      const kolom = Number(cel.split(',')[0]);
      const rij = Number(cel.split(',')[1]);
      const boven = px(oud, midden(kolom), rij * 128);
      if (leeg(boven)) return null;
      const onder = px(oud, midden(kolom), rij * 128 + 127);
      const mid = px(oud, midden(kolom), rij * 128 + 64);
      return { cel, mid: ster(mid), verval: Math.max(0, ster(boven) - ster(onder)), gewicht: gewichten.get(cel) ?? 0 };
    })
    .filter(Boolean);

  if (bron.length === 0) {
    regels.push({ sleutel, cellen: familie.cellen, baan: null });
    continue;
  }

  const totaal = bron.reduce((a, b) => a + b.gewicht, 0);
  const weeg = (veld) => totaal > 0
    ? bron.reduce((a, b) => a + b[veld] * b.gewicht, 0) / totaal
    : bron.reduce((a, b) => a + b[veld], 0) / bron.length;
  const midSter = weeg('mid');
  const verval = weeg('verval');

  const [, a, b] = naarOklab(familie.toon);
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const Lboven = oklabLVanSter(midSter + verval / 2);
  const Londer = oklabLVanSter(midSter - verval / 2);

  const rijen = Array.from({ length: 128 }, (_, i) => {
    const t = i / 127;
    return binnenBereik(Lboven + (Londer - Lboven) * t, C * (1 - SCHADUWVERZADIGING / 2 + SCHADUWVERZADIGING * t), h);
  });
  for (const cel of familie.cellen) schrijfBaan(cel, rijen);
  regels.push({ sleutel, cellen: familie.cellen, midSter, verval, gewicht: totaal, baan: `${hex(rijen[0])} → ${hex(rijen[127])}` });
}

schrijfPng(join(HIER, 'colormap-v2.png'), atlas);

console.log('| familie | cellen | modellen | midden L* | verval ΔL* | baan |');
console.log('| --- | --- | ---: | ---: | ---: | --- |');
for (const r of regels) {
  const cellen = r.cellen.join(' · ');
  if (!r.baan) { console.log(`| \`${r.sleutel}\` | ${cellen} | 0 | — | — | onveranderd |`); continue; }
  console.log(`| \`${r.sleutel}\` | ${cellen} | ${r.gewicht} | ${r.midSter.toFixed(1)} | ${r.verval.toFixed(1)} | \`${r.baan}\` |`);
}
console.log('\nsamengevoegd:', samengevoegd.length ? '\n  ' + samengevoegd.join('\n  ') : 'niets');
console.log(`banen: ${regels.length + 1} (de graspollen dragen de baan van cel 3,1 uit colormap-v1.png)`);
