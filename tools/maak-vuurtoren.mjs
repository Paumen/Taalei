/**
 * Bouwt kits/taalei-kit/lighthouse.glb volgens docs/asset-stijlgids.md.
 *
 * Draai vanuit de repo-root:  node tools/maak-vuurtoren.mjs
 *
 * Het model is opgebouwd uit vlakke stukken en kleurt zich door UV's naar
 * cellen van de gedeelde colormap te wijzen — geen vertexkleuren, geen eigen
 * textuur. Elke driehoek krijgt de normaal van zijn eigen vlak, zodat de
 * stukken zichtbaar blijven (§2, §3).
 *
 * Herkomst: de vorm komt uit een three.js-schets; hier is hij hertekend op
 * het wereldraster, met paletkleuren en zonder vertexkleuren of emissie.
 */

import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schrijfGlb } from './glb-schrijver.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'taalei-kit');

/* -- palet ----------------------------------------------------------------
 * Alleen cellen die al in kits/palet.json staan. `t` kiest een stop in het
 * verticale verloop van de cel; de gids staat bestaande verloopcellen toe,
 * dus twee tinten uit één cel mag — nieuwe tinten verzinnen niet.
 */
const KOLOMMEN = 16;
const RIJEN = 4;

const CEL = {
  wit: { cel: [5, 2], t: 0.35 },        // #dcdce9 — witte torenbanden
  rood: { cel: [7, 0], t: 0.5 },        // #e76047 — rode torenbanden
  // Sokkel en stoep staan onderaan en dragen het geheel; donker leest als
  // zwaar. Zelfde cel als het smeedwerk, maar dieper in het verloop, zodat
  // de basis nog iets donkerder is dan de balustrade erboven.
  steen: { cel: [10, 0], t: 0.78 },     // #38383c — sokkel en stoep
  donker: { cel: [10, 0], t: 0.5 },     // #3e3e44 — smeedwerk, dak
  staal: { cel: [6, 1], t: 0.5 },       // #474a58 — omloopvloer
  hout: { cel: [4, 1], t: 0.5 },        // #8a5d4b — deur
  zand: { cel: [5, 3], t: 0.5 },        // #f0c59d — deurkozijn
  amber: { cel: [6, 0], t: 0.45 },      // #ffb349 — lamp
};

const uvVan = ({ cel, t }) => [(cel[0] + 0.5) / KOLOMMEN, (cel[1] + t) / RIJEN];

/* -- meetkunde ------------------------------------------------------------ */

const driehoeken = [];   // { hoeken: [a, b, c], kleur }

const aftrek = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const kruis = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const stip = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Legt één driehoek vast, met de winding zo gedraaid dat de normaal van
 * `binnen` af wijst. Zo hoef je per vorm alleen een punt binnenin te kennen
 * en nooit over de volgorde van hoekpunten na te denken.
 */
function vlak(a, b, c, kleur, binnen) {
  const n = kruis(aftrek(b, a), aftrek(c, a));
  const midden = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const naarBuiten = aftrek(midden, binnen);
  driehoeken.push({ hoeken: stip(n, naarBuiten) >= 0 ? [a, b, c] : [a, c, b], kleur });
}

const vierhoek = (a, b, c, d, kleur, binnen) => {
  vlak(a, b, c, kleur, binnen);
  vlak(a, c, d, kleur, binnen);
};

const opRing = (r, y, hoek) => [Math.cos(hoek) * r, y, Math.sin(hoek) * r];

/** Omwentelingslichaam uit een profiel van { r, y }-ringen. */
function gedraaid(ringen, zijden, kleurVan) {
  for (let i = 0; i < ringen.length - 1; i += 1) {
    const kleur = kleurVan(i);
    for (let s = 0; s < zijden; s += 1) {
      const h1 = (s / zijden) * Math.PI * 2;
      const h2 = ((s + 1) / zijden) * Math.PI * 2;
      const as = [0, (ringen[i].y + ringen[i + 1].y) / 2, 0];
      vierhoek(
        opRing(ringen[i].r, ringen[i].y, h1),
        opRing(ringen[i].r, ringen[i].y, h2),
        opRing(ringen[i + 1].r, ringen[i + 1].y, h2),
        opRing(ringen[i + 1].r, ringen[i + 1].y, h1),
        kleur, as,
      );
    }
  }
}

/** Dekt een ring af met een waaier naar het midden. */
function deksel(r, y, zijden, kleur, binnen) {
  const mid = [0, y, 0];
  for (let s = 0; s < zijden; s += 1) {
    const h1 = (s / zijden) * Math.PI * 2;
    const h2 = ((s + 1) / zijden) * Math.PI * 2;
    vlak(mid, opRing(r, y, h1), opRing(r, y, h2), kleur, binnen);
  }
}

function cilinder(rBoven, rOnder, hoogte, zijden, y, kleur) {
  const boven = y + hoogte / 2;
  const onder = y - hoogte / 2;
  gedraaid([{ r: rOnder, y: onder }, { r: rBoven, y: boven }], zijden, () => kleur);
  deksel(rBoven, boven, zijden, kleur, [0, y, 0]);
  deksel(rOnder, onder, zijden, kleur, [0, y, 0]);
}

function kegel(r, hoogte, zijden, y, kleur) {
  const onder = y - hoogte / 2;
  const top = [0, y + hoogte / 2, 0];
  const binnen = [0, y, 0];
  for (let s = 0; s < zijden; s += 1) {
    const h1 = (s / zijden) * Math.PI * 2;
    const h2 = ((s + 1) / zijden) * Math.PI * 2;
    vlak(top, opRing(r, onder, h1), opRing(r, onder, h2), kleur, binnen);
  }
  deksel(r, onder, zijden, kleur, binnen);
}

/** Balk, eventueel om de Y-as gedraaid zodat hij naar buiten wijst. */
function balk(breedte, hoogte, diepte, [px, py, pz], draaiY, kleur) {
  const hx = breedte / 2;
  const hy = hoogte / 2;
  const hz = diepte / 2;
  const cos = Math.cos(draaiY);
  const sin = Math.sin(draaiY);
  const punt = (x, y, z) => [px + x * cos + z * sin, py + y, pz - x * sin + z * cos];
  const h = [
    punt(-hx, -hy, -hz), punt(hx, -hy, -hz), punt(hx, -hy, hz), punt(-hx, -hy, hz),
    punt(-hx, hy, -hz), punt(hx, hy, -hz), punt(hx, hy, hz), punt(-hx, hy, hz),
  ];
  const binnen = [px, py, pz];
  vierhoek(h[0], h[1], h[2], h[3], kleur, binnen);
  vierhoek(h[4], h[5], h[6], h[7], kleur, binnen);
  vierhoek(h[0], h[1], h[5], h[4], kleur, binnen);
  vierhoek(h[1], h[2], h[6], h[5], kleur, binnen);
  vierhoek(h[2], h[3], h[7], h[6], kleur, binnen);
  vierhoek(h[3], h[0], h[4], h[7], kleur, binnen);
}

/** Ring met een vierkante buisdoorsnede — de handreling van de omloop. */
function reling(straal, dikte, ringZijden, y, kleur) {
  const buis = 4;
  const punt = (i, j) => {
    const a = (i / ringZijden) * Math.PI * 2;
    const b = (j / buis) * Math.PI * 2 + Math.PI / 4;
    const r = straal + Math.cos(b) * dikte;
    return [Math.cos(a) * r, y + Math.sin(b) * dikte, Math.sin(a) * r];
  };
  for (let i = 0; i < ringZijden; i += 1) {
    const a = ((i + 0.5) / ringZijden) * Math.PI * 2;
    const hart = [Math.cos(a) * straal, y, Math.sin(a) * straal];
    for (let j = 0; j < buis; j += 1) {
      vierhoek(punt(i, j), punt(i + 1, j), punt(i + 1, j + 1), punt(i, j + 1), kleur, hart);
    }
  }
}

/* -- de vuurtoren ---------------------------------------------------------
 * Alle maten hieronder zijn "ontwerpmaten"; onderaan wordt het geheel in één
 * keer op het wereldraster geschaald. Zo blijft de vorm leesbaar en staat de
 * schaalkeuze op één plek.
 */

const ZIJDEN = 16;      // §2: ruim onder 24, en even zodat de footprint vierkant is
const BANDEN = 5;
const PER_BAND = 2;
const Y0 = 0.15;
const Y1 = 1.06;
const R0 = 0.285;
const R1 = 0.158;

const ringen = [];
for (let i = 0; i <= BANDEN * PER_BAND; i += 1) {
  const t = i / (BANDEN * PER_BAND);
  ringen.push({ y: Y0 + (Y1 - Y0) * t, r: R0 + (R1 - R0) * t ** 0.88 });
}

// toren met afwisselend witte en rode banden
gedraaid(ringen, ZIJDEN, (i) => (Math.floor(i / PER_BAND) % 2 === 0 ? CEL.wit : CEL.rood));

// sokkel — de breedste vorm, en dus wat de footprint bepaalt
cilinder(0.30, 0.33, 0.10, ZIJDEN, 0.11, CEL.steen);

// omloop: vloer, rand, balusters en handreling
cilinder(0.185, 0.185, 0.028, ZIJDEN, 1.05, CEL.staal);
cilinder(0.245, 0.215, 0.045, ZIJDEN, 1.086, CEL.donker);
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * Math.PI * 2;
  balk(0.015, 0.075, 0.015, [Math.cos(a) * 0.228, 1.145, Math.sin(a) * 0.228], -a, CEL.donker);
}
reling(0.231, 0.014, ZIJDEN, 1.183, CEL.donker);

// lantaarnhuis: lamp met roeden eromheen, plaat en dak
cilinder(0.135, 0.145, 0.185, 10, 1.22, CEL.amber);
for (let i = 0; i < 10; i += 1) {
  const a = (i / 10) * Math.PI * 2;
  balk(0.014, 0.185, 0.014, [Math.cos(a) * 0.152, 1.22, Math.sin(a) * 0.152], -a, CEL.donker);
}
cilinder(0.165, 0.165, 0.022, 10, 1.322, CEL.donker);
kegel(0.165, 0.15, 10, 1.408, CEL.staal);

// deur op een plat vlak van de toren
const straalOp = (y) => {
  const t = (y - Y0) / (Y1 - Y0);
  return (R0 + (R1 - R0) * t ** 0.88) * Math.cos(Math.PI / ZIJDEN);
};
const dz = straalOp(0.27);
balk(0.125, 0.225, 0.030, [0, 0.28, dz + 0.004], 0, CEL.zand);
balk(0.090, 0.185, 0.030, [0, 0.27, dz + 0.014], 0, CEL.hout);
// De stoep blijft binnen de sokkel, anders bepaalt hij de footprint.
balk(0.160, 0.030, 0.070, [0, 0.16, dz + 0.020], 0, CEL.steen);

/* -- op het raster zetten -------------------------------------------------
 * §4: de footprint moet op hele of halve units vallen. De sokkel is met 16
 * zijden even breed als diep, dus één schaalfactor zet beide assen tegelijk
 * goed. §5: de basis komt op Y = 0, het hart van de tegel op X/Z = 0.
 */
const DOEL_FOOTPRINT = 2.0;   // een vuurtoren bezet een tegel van 2 × 2

let laagY = Infinity;
let maxXZ = 0;
for (const d of driehoeken) {
  for (const h of d.hoeken) {
    laagY = Math.min(laagY, h[1]);
    maxXZ = Math.max(maxXZ, Math.abs(h[0]), Math.abs(h[2]));
  }
}
const schaal = DOEL_FOOTPRINT / 2 / maxXZ;

for (const d of driehoeken) {
  d.hoeken = d.hoeken.map(([x, y, z]) => [x * schaal, (y - laagY) * schaal, z * schaal]);
}

/* -- naar buffers ---------------------------------------------------------
 * Per driehoek de eigen vlaknormaal, en hoekpunten alleen samenvoegen als
 * positie, normaal én UV gelijk zijn. Daarmee splitst elke scherpe rand
 * vanzelf en blijven de vlakke stukken zichtbaar.
 */
const posities = [];
const normalen = [];
const uvs = [];
const indices = [];
const gezien = new Map();

for (const d of driehoeken) {
  const [a, b, c] = d.hoeken;
  const n = kruis(aftrek(b, a), aftrek(c, a));
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-12) continue;                 // ontaarde driehoek
  const normaal = [n[0] / len, n[1] / len, n[2] / len];
  const uv = uvVan(d.kleur);
  for (const hoek of d.hoeken) {
    const sleutel = [...hoek.map((v) => v.toFixed(5)), ...normaal.map((v) => v.toFixed(4)), ...uv].join('|');
    let index = gezien.get(sleutel);
    if (index === undefined) {
      index = posities.length;
      gezien.set(sleutel, index);
      posities.push(hoek);
      normalen.push(normaal);
      uvs.push(uv);
    }
    indices.push(index);
  }
}

mkdirSync(join(KIT, 'Textures'), { recursive: true });
copyFileSync(join(ROOT, 'kits', 'colormap.png'), join(KIT, 'Textures', 'colormap.png'));
writeFileSync(join(KIT, 'LICENSE.txt'),
  'Vuurtoren — eigen werk, gegenereerd door tools/maak-vuurtoren.mjs.\n'
  + 'Kleuren komen uit de gedeelde colormap van de Kenney-kits (CC0).\n'
  + 'Vrij te gebruiken onder CC0 1.0 Universal.\n');

const bytes = schrijfGlb(join(KIT, 'lighthouse.glb'), {
  naam: 'lighthouse',
  posities,
  normalen,
  uvs,
  indices,
  textuur: 'Textures/colormap.png',
  generator: 'taalei/maak-vuurtoren',
  extras: { versie: 1, schaal: Number(schaal.toFixed(4)), tangenten: 'gestript', palet: 1 },
});

const hoogte = Math.max(...posities.map((p) => p[1]));
console.log(`kits/taalei-kit/lighthouse.glb  ${indices.length / 3} driehoeken, ${bytes} bytes`);
console.log(`  schaal ${schaal.toFixed(4)}   footprint ${DOEL_FOOTPRINT} × ${DOEL_FOOTPRINT}   hoogte ${hoogte.toFixed(3)}`);
console.log(`  paletcellen: ${[...new Set(Object.values(CEL).map((c) => c.cel.join(',')))].join('  ')}`);
