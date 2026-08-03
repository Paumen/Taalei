/**
 * Bouwt kits/taaleiland-kit/lighthouse.glb.
 *
 * Draai vanuit de repo-root:  node tools/build-lighthouse.mjs
 *
 * De vuurtoren is geen Kenney-model maar eigen werk, dus hij wordt hier
 * uitgerekend in plaats van gedownload. Zo blijft hij reproduceerbaar en kun
 * je aan de maten draaien zonder een 3D-pakket te openen.
 *
 * Alles uit de stijlgids zit in de constanten hieronder:
 *   - 10 vlakke stukken per rondje (asset_style_guide.md §2: max 16)
 *   - kleuren komen uit de gedeelde colormap; geen nieuwe kleur toegevoegd
 *   - geen grond of rotsen eromheen, alleen het bouwwerk zelf
 *   - het dak loopt niet over de lantaarn heen (§0: geen overstek)
 *   - voet op Y = 0, pivot in het midden van het grondvlak (§5)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'taaleiland-kit', 'lighthouse.glb');

/* -- palet ----------------------------------------------------------------
 * De gedeelde colormap is een raster van 16 × 16 cellen. Een kleur is een
 * kolom plus een band van vier rijen; binnen die band loopt een verloop van
 * licht (boven) naar donker (onder). Een vertex prikt met zijn UV één punt in
 * dat verloop, precies zoals de Kenney-modellen doen.
 *
 * Zelfde kolom, andere band = een andere kleur: kolom 5 is hout (band 0),
 * wit (band 2) én zand (band 3).
 */
const KLEUREN = {
  wit: { kolom: 5, band: 2 },
  rood: { kolom: 7, band: 0 },
  donker: { kolom: 10, band: 0 },
  goud: { kolom: 6, band: 0 },
  steen: { kolom: 15, band: 3 },
  bruin: { kolom: 12, band: 0 },
  staal: { kolom: 3, band: 2 },
};

/**
 * UV voor een kleur. `schaduw` loopt van 0 (lichtste kant van het verloop) tot
 * 1 (donkerste) en blijft binnen de band, zodat er nooit uit een buurcel wordt
 * geprikt: de Kenney-modellen gebruiken hetzelfde venster van 0,025 tot 0,225.
 */
function uv(naam, schaduw) {
  const { kolom, band } = KLEUREN[naam];
  const t = Math.min(1, Math.max(0, schaduw));
  return [(kolom + 0.5) / 16, band * 0.25 + 0.025 + t * 0.2];
}

/* -- maten ----------------------------------------------------------------
 * Eén muur-/vloersegment is 1 × 1 (§4). De toren staat dus op bijna twee
 * segmenten en is met 5 eenheden hoger dan het grote schip (≈ 4): een baken
 * dat je van de andere kant van het eiland ziet, maar met een verhouding
 * hoogte : diameter van ongeveer 2,6 — gedrongen en speelgoedachtig.
 */
const KANTEN = 10;

const VOET_Y = 0.3;       // bovenkant van de stenen voet
const VOET_R0 = 0.95;
const VOET_R1 = 0.9;

const TOREN_Y0 = VOET_Y;
const TOREN_Y1 = 3.3;
const TOREN_R0 = 0.86;
const TOREN_R1 = 0.52;
const RINGEN = 5;         // wit, rood, wit, rood, wit

const DEK_Y1 = 3.44;      // omloop rond de lantaarn
const DEK_R = 0.76;
const HEK_Y1 = 3.7;
const HEK_R = 0.66;
const HEK_DIKTE = 0.1;

const LANTAARN_R = 0.5;
const LANTAARN_Y0 = HEK_Y1;
const GLAS_Y0 = 3.8;
const GLAS_Y1 = 4.3;
const LANTAARN_Y1 = 4.4;
const STIJL_BREED = 0.09; // de stijlen tussen de ruiten
const KRAAG_R = 0.56;     // buitenmaat van lantaarnrand én dakvoet

const DAK_TOP = 4.98;

const HOEK = (Math.PI * 2) / KANTEN;
const APOTHEMA = Math.cos(Math.PI / KANTEN); // vlakke kant ligt dichter bij de as dan een hoekpunt

/** Straal van de toren op hoogte y — de deur en de ramen moeten meetaperen. */
function torenStraal(y) {
  const t = (y - TOREN_Y0) / (TOREN_Y1 - TOREN_Y0);
  return TOREN_R0 + (TOREN_R1 - TOREN_R0) * t;
}

/**
 * Schaduw op hoogte y: onderaan donkerder, bovenin lichter. Dat is dezelfde
 * truc als bij de romp van `ship-large` — het verloop in de cel doet het werk
 * dat anders een tweede kleur of een outline zou kosten.
 */
function schaduwOp(y) {
  return Math.min(1, Math.max(0, 0.72 - (y / DAK_TOP) * 0.55));
}

/* -- meetkunde ------------------------------------------------------------ */

const posities = [];
const normalen = [];
const uvs = [];
const indices = [];
const gezien = new Map(); // vertexsleutel → index

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];

const trek = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const kruis = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const punt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normaliseer(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Punt op de omtrek: hoek 0 wijst naar +Z, zodat daar een vlakke kant zit. */
function omtrek(k, r, y) {
  const a = (k + 0.5) * HOEK;
  return [Math.sin(a) * r, y, Math.cos(a) * r];
}

/**
 * Eén driehoek, plat geschaduwd. `naarBuiten` zegt welke kant de voorkant is;
 * zo hoeft geen enkele aanroep hieronder over de draairichting na te denken.
 */
function driehoek(a, b, c, uvA, uvB, uvC, naarBuiten) {
  let n = normaliseer(kruis(trek(b, a), trek(c, a)));
  let hoeken = [
    [a, uvA],
    [b, uvB],
    [c, uvC],
  ];
  if (punt(n, naarBuiten) < 0) {
    n = [-n[0], -n[1], -n[2]];
    hoeken = [hoeken[0], hoeken[2], hoeken[1]];
  }
  for (const [p, t] of hoeken) {
    // Vertices met dezelfde plek, normaal én UV mogen samenvallen. Bij plat
    // schaduwen is dat alleen binnen een vlak zo — precies zoals de
    // Kenney-modellen het doen, en het scheelt hier tweederde van het bestand.
    const sleutel = [...p, ...n, ...t].map((v) => v.toFixed(5)).join(',');
    let index = gezien.get(sleutel);
    if (index === undefined) {
      index = posities.length / 3;
      gezien.set(sleutel, index);
      posities.push(p[0], p[1], p[2]);
      normalen.push(n[0], n[1], n[2]);
      uvs.push(t[0], t[1]);
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i];
        if (p[i] > max[i]) max[i] = p[i];
      }
    }
    indices.push(index);
  }
}

function vlak(hoekpunten, uvsVanHoek, naarBuiten) {
  for (let i = 1; i < hoekpunten.length - 1; i++) {
    driehoek(
      hoekpunten[0], hoekpunten[i], hoekpunten[i + 1],
      uvsVanHoek[0], uvsVanHoek[i], uvsVanHoek[i + 1],
      naarBuiten,
    );
  }
}

/** Mantel van een (afgeknotte) tienhoekige kegel. */
function mantel(y0, y1, r0, r1, kleur, schaduwBoven, schaduwOnder) {
  const onder = schaduwOnder ?? schaduwOp(y0);
  const boven = schaduwBoven ?? schaduwOp(y1);
  for (let k = 0; k < KANTEN; k++) {
    const a = omtrek(k, r0, y0);
    const b = omtrek(k + 1, r0, y0);
    const c = omtrek(k + 1, r1, y1);
    const d = omtrek(k, r1, y1);
    const naarBuiten = [a[0] + b[0], 0, a[2] + b[2]];
    vlak([a, b, c, d], [uv(kleur, onder), uv(kleur, onder), uv(kleur, boven), uv(kleur, boven)], naarBuiten);
  }
}

/** Dichte tienhoek, `omhoog` bepaalt of hij naar boven of naar beneden kijkt. */
function deksel(y, r, kleur, schaduw, omhoog) {
  const midden = [0, y, 0];
  const t = uv(kleur, schaduw ?? schaduwOp(y));
  for (let k = 0; k < KANTEN; k++) {
    driehoek(midden, omtrek(k, r, y), omtrek(k + 1, r, y), t, t, t, [0, omhoog ? 1 : -1, 0]);
  }
}

/** Vlakke ring tussen twee stralen — de bovenkant van het hek, de dakvoet. */
function ring(y, rBinnen, rBuiten, kleur, schaduw, omhoog) {
  const t = uv(kleur, schaduw ?? schaduwOp(y));
  for (let k = 0; k < KANTEN; k++) {
    const a = omtrek(k, rBinnen, y);
    const b = omtrek(k + 1, rBinnen, y);
    const c = omtrek(k + 1, rBuiten, y);
    const d = omtrek(k, rBuiten, y);
    vlak([a, b, c, d], [t, t, t, t], [0, omhoog ? 1 : -1, 0]);
  }
}

/** Tienhoekige punt zonder overstek: de voet is precies zo breed als de kraag. */
function punthoed(y0, y1, r, kleur) {
  const top = [0, y1, 0];
  const tTop = uv(kleur, schaduwOp(y1));
  const tVoet = uv(kleur, schaduwOp(y0));
  for (let k = 0; k < KANTEN; k++) {
    const a = omtrek(k, r, y0);
    const b = omtrek(k + 1, r, y0);
    driehoek(a, b, top, tVoet, tVoet, tTop, [a[0] + b[0], 0.4, a[2] + b[2]]);
  }
}

/**
 * Paneel tegen een vlakke kant van de toren: deur en ramen. De achterkant volgt
 * de taps toelopende muur, de voorkant steekt er `diepte` uit. Zonder dat
 * meetaperen zou de bovenrand van de deur van de muur af gaan staan.
 */
function paneel(kant, y0, y1, halfBreed, diepte, kleur, schaduw) {
  const a = kant * HOEK;
  const n = [Math.sin(a), 0, Math.cos(a)];
  const zij = [Math.cos(a), 0, -Math.sin(a)];

  const opMuur = (y, zijkant, uitsteek) => {
    const d = torenStraal(y) * APOTHEMA + uitsteek;
    return [n[0] * d + zij[0] * zijkant, y, n[2] * d + zij[2] * zijkant];
  };

  const t = uv(kleur, schaduw ?? schaduwOp((y0 + y1) / 2));
  const vier = [t, t, t, t];

  const ao0 = opMuur(y0, -halfBreed, 0);
  const ao1 = opMuur(y0, halfBreed, 0);
  const ab1 = opMuur(y1, halfBreed, 0);
  const ab0 = opMuur(y1, -halfBreed, 0);
  const vo0 = opMuur(y0, -halfBreed, diepte);
  const vo1 = opMuur(y0, halfBreed, diepte);
  const vb1 = opMuur(y1, halfBreed, diepte);
  const vb0 = opMuur(y1, -halfBreed, diepte);

  vlak([vo0, vo1, vb1, vb0], vier, n);                       // voorkant
  vlak([ao0, vo0, vb0, ab0], vier, [-zij[0], 0, -zij[2]]);   // zijkanten
  vlak([ao1, vo1, vb1, ab1], vier, zij);
  vlak([ab0, vb0, vb1, ab1], vier, [0, 1, 0]);               // boven- en onderrand
  vlak([ao0, vo0, vo1, ao1], vier, [0, -1, 0]);
}

/** Rechthoekige balk, gebruikt voor de stijlen tussen de ruiten. */
function balk(hoek, r, y0, y1, breed, dik, kleur, schaduw) {
  const a = hoek;
  const n = [Math.sin(a), 0, Math.cos(a)];
  const zij = [Math.cos(a), 0, -Math.sin(a)];
  const hoekpunt = (y, s, d) => [
    n[0] * (r + d) + zij[0] * s,
    y,
    n[2] * (r + d) + zij[2] * s,
  ];

  const t = uv(kleur, schaduw ?? schaduwOp((y0 + y1) / 2));
  const vier = [t, t, t, t];
  const hb = breed / 2;

  const p = [
    hoekpunt(y0, -hb, -dik / 2), hoekpunt(y0, hb, -dik / 2),
    hoekpunt(y0, hb, dik / 2), hoekpunt(y0, -hb, dik / 2),
    hoekpunt(y1, -hb, -dik / 2), hoekpunt(y1, hb, -dik / 2),
    hoekpunt(y1, hb, dik / 2), hoekpunt(y1, -hb, dik / 2),
  ];

  vlak([p[3], p[2], p[6], p[7]], vier, n);                      // buiten
  vlak([p[0], p[1], p[5], p[4]], vier, [-n[0], 0, -n[2]]);      // binnen
  vlak([p[1], p[2], p[6], p[5]], vier, zij);
  vlak([p[0], p[3], p[7], p[4]], vier, [-zij[0], 0, -zij[2]]);
  vlak([p[4], p[5], p[6], p[7]], vier, [0, 1, 0]);
  vlak([p[0], p[1], p[2], p[3]], vier, [0, -1, 0]);
}

/* -- de vuurtoren --------------------------------------------------------- */

// Stenen voet. Geen rotsen of zand eromheen: het model is alleen het bouwwerk.
mantel(0, VOET_Y, VOET_R0, VOET_R1, 'steen');
deksel(VOET_Y, VOET_R1, 'steen', 0.25, true);

// Toren in vijf banden: wit onder, wit boven, rood ertussen.
for (let i = 0; i < RINGEN; i++) {
  const y0 = TOREN_Y0 + ((TOREN_Y1 - TOREN_Y0) * i) / RINGEN;
  const y1 = TOREN_Y0 + ((TOREN_Y1 - TOREN_Y0) * (i + 1)) / RINGEN;
  mantel(y0, y1, torenStraal(y0), torenStraal(y1), i % 2 === 0 ? 'wit' : 'rood');
}

// Omloop met hek. Het dek steekt over de toren uit — dat mag; het verbod op
// overstek gaat over het dak.
mantel(TOREN_Y1, DEK_Y1, DEK_R, DEK_R, 'donker');
ring(TOREN_Y1, TOREN_R1, DEK_R, 'donker', 0.9, false);
ring(DEK_Y1, HEK_R - HEK_DIKTE, DEK_R, 'donker', 0.35, true);

mantel(DEK_Y1, HEK_Y1, HEK_R, HEK_R, 'donker', 0.2, 0.3);
mantel(DEK_Y1, HEK_Y1, HEK_R - HEK_DIKTE, HEK_R - HEK_DIKTE, 'donker', 0.75, 0.85);
ring(HEK_Y1, HEK_R - HEK_DIKTE, HEK_R, 'donker', 0.2, true);

// Lantaarn: donkere kraag onder, glas met stijlen, donkere kraag boven.
mantel(LANTAARN_Y0, GLAS_Y0, KRAAG_R, KRAAG_R, 'donker');
mantel(GLAS_Y0, GLAS_Y1, LANTAARN_R, LANTAARN_R, 'goud', 0.15, 0.55);
mantel(GLAS_Y1, LANTAARN_Y1, KRAAG_R, KRAAG_R, 'donker');
ring(GLAS_Y0, LANTAARN_R, KRAAG_R, 'donker', 0.5, true);
ring(GLAS_Y1, LANTAARN_R, KRAAG_R, 'donker', 0.4, false);

for (let k = 0; k < KANTEN; k++) {
  balk((k + 0.5) * HOEK, LANTAARN_R, GLAS_Y0, GLAS_Y1, STIJL_BREED, STIJL_BREED, 'donker', 0.55);
}

// Dak: voet precies zo breed als de kraag eronder, dus geen overstek.
punthoed(LANTAARN_Y1, DAK_TOP, KRAAG_R, 'donker');
ring(LANTAARN_Y1, 0, KRAAG_R, 'donker', 0.8, false);

// Deur op de vlakke voorkant, twee ramen erboven — meer detail hoeft niet.
// De ramen staan midden in een witte band; over een bandgrens heen zien ze er
// slordig uit.
paneel(0, VOET_Y, VOET_Y + 0.74, 0.22, 0.05, 'bruin');
paneel(-1, 1.62, 1.92, 0.16, 0.04, 'staal', 0.95);
paneel(1, 2.78, 3.08, 0.16, 0.04, 'staal', 0.95);

/* -- glb schrijven --------------------------------------------------------
 * Zelfde opzet als de Kenney-bestanden: één mesh, één materiaal dat naar de
 * gedeelde colormap wijst, dubbelzijdig en niet-metallic.
 */

function uitlijnen(n) {
  return (4 - (n % 4)) % 4;
}

const posBuf = Buffer.from(new Float32Array(posities).buffer);
const norBuf = Buffer.from(new Float32Array(normalen).buffer);
const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
const idxBuf = Buffer.from(new Uint16Array(indices).buffer);

const delen = [posBuf, norBuf, uvBuf, idxBuf];
const stukken = [];
const offsets = [];
let offset = 0;
for (const deel of delen) {
  offsets.push(offset);
  stukken.push(deel);
  offset += deel.length;
  const vul = uitlijnen(offset);
  if (vul) {
    stukken.push(Buffer.alloc(vul));
    offset += vul;
  }
}
const bin = Buffer.concat(stukken);
const telling = posities.length / 3;

const gltf = {
  asset: {
    generator: 'taaleiland/tools/build-lighthouse.mjs',
    version: '2.0',
    extras: { taaleiland: { versie: 1, schaal: 1, tangenten: 'gestript', palet: 1 } },
  },
  scene: 0,
  scenes: [{ nodes: [0], name: 'lighthouse' }],
  nodes: [{ mesh: 0, name: 'lighthouse' }],
  meshes: [{
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: 3,
      material: 0,
    }],
    name: 'lighthouse',
  }],
  materials: [{
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
    doubleSided: true,
    name: 'colormap',
  }],
  textures: [{ sampler: 0, source: 0, name: 'colormap' }],
  images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
  samplers: [{ minFilter: 9987 }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: telling, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: telling, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: telling, type: 'VEC2' },
    { bufferView: 3, componentType: 5123, count: indices.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: posBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: offsets[1], byteLength: norBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: offsets[2], byteLength: uvBuf.length, byteStride: 8, target: 34962 },
    { buffer: 0, byteOffset: offsets[3], byteLength: idxBuf.length, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};

const json = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonVul = Buffer.alloc(uitlijnen(json.length), 0x20);
const jsonChunk = Buffer.concat([json, jsonVul]);

const kop = Buffer.alloc(12);
kop.write('glTF', 0, 'ascii');
kop.writeUInt32LE(2, 4);
kop.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);

const jsonKop = Buffer.alloc(8);
jsonKop.writeUInt32LE(jsonChunk.length, 0);
jsonKop.writeUInt32LE(0x4e4f534a, 4);

const binKop = Buffer.alloc(8);
binKop.writeUInt32LE(bin.length, 0);
binKop.writeUInt32LE(0x004e4942, 4);

mkdirSync(dirname(DOEL), { recursive: true });
writeFileSync(DOEL, Buffer.concat([kop, jsonKop, jsonChunk, binKop, bin]));

console.log(
  `lighthouse.glb → ${indices.length / 3} driehoeken, ${telling} vertices, ` +
  `${(max[1]).toFixed(2)} hoog, ${(max[0] - min[0]).toFixed(2)} breed`,
);
