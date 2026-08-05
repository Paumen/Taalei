/**
 * Genereert kits/taalei-kit/hot-air-balloon.glb.
 *
 * Draai vanuit de repo-root:  node tools/make-hot-air-balloon.mjs
 *
 * Zelfde conventies als lighthouse.glb: één mesh, één materiaal dat naar de
 * gedeelde colormap wijst (Textures/colormap.png), platte facetten met eigen
 * normalen, kleuren via UV's midden in een paletcel. De ballon staat met de
 * mandbodem op Y = 0, pivot in het midden van de voetafdruk.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UIT = join(ROOT, 'kits', 'taalei-kit', 'hot-air-balloon.glb');

/* -- kleuren ---------------------------------------------------------------
 * Cellen uit palet.json (gedeeld palet): [kolom, rij] op de 16×4-atlas van
 * 32×128px-gradiëntcellen. UV wijst net als bij de vuurtoren naar het midden
 * van de kolom, 48.5px onder de celrand.
 */
const CEL = {
  rood: [7, 0],      // #b2413a — vuurtorenrood
  creme: [5, 2],     // #f0ece3 — vuurtorencrème
  geel: [6, 0],      // #ffb349 — accent (vuurtorenlicht)
  mand: [12, 0],     // #995a41 — wilgentenen
  mandRand: [5, 0],  // #d07b56 — lichtere rand
  touw: [6, 1],      // #474a58 — donker touwwerk/frame
  brander: [10, 0],  // #3e3e44 — brander en ballonopening
};
const uv = ([cx, cy]) => [(cx * 32 + 16.5) / 512, (cy * 128 + 48.5) / 512];

/* -- meshbouw ------------------------------------------------------------- */

const posities = [];
const normalen = [];
const uvs = [];
const indices = [];

/** Eén platte veelhoek (fan-getrianguleerd) met eigen facetnormaal. */
function vlak(hoeken, cel) {
  const [ax, ay, az] = hoeken[0];
  const [bx, by, bz] = hoeken[1];
  const [cx, cy, cz] = hoeken[2];
  const u1 = [bx - ax, by - ay, bz - az];
  const u2 = [cx - ax, cy - ay, cz - az];
  let n = [
    u1[1] * u2[2] - u1[2] * u2[1],
    u1[2] * u2[0] - u1[0] * u2[2],
    u1[0] * u2[1] - u1[1] * u2[0],
  ];
  const lengte = Math.hypot(...n) || 1;
  n = n.map((v) => v / lengte);

  const basis = posities.length / 3;
  const [u, v] = uv(cel);
  for (const p of hoeken) {
    posities.push(...p);
    normalen.push(...n);
    uvs.push(u, v);
  }
  for (let i = 1; i < hoeken.length - 1; i++) {
    indices.push(basis, basis + i, basis + i + 1);
  }
}

/** Balk met as-uitlijning; `zonder` slaat vlakken over ('onder', 'boven'). */
function balk([x1, y1, z1], [x2, y2, z2], cel, zonder = []) {
  const A = [x1, y1, z1], B = [x2, y1, z1], C = [x2, y1, z2], D = [x1, y1, z2];
  const E = [x1, y2, z1], F = [x2, y2, z1], G = [x2, y2, z2], H = [x1, y2, z2];
  if (!zonder.includes('onder')) vlak([A, B, C, D], cel);
  if (!zonder.includes('boven')) vlak([H, G, F, E], cel);
  vlak([E, F, B, A], cel);
  vlak([G, H, D, C], cel);
  vlak([F, G, C, B], cel);
  vlak([H, E, A, D], cel);
}

/** Schuine vierzijdige koker tussen twee horizontale vierkantjes. */
function stijl([x1, y, z1], [x2, y2, z2], dikte, cel) {
  const h = dikte / 2;
  const onder = [
    [x1 - h, y, z1 - h], [x1 + h, y, z1 - h], [x1 + h, y, z1 + h], [x1 - h, y, z1 + h],
  ];
  const boven = [
    [x2 - h, y2, z2 - h], [x2 + h, y2, z2 - h], [x2 + h, y2, z2 + h], [x2 - h, y2, z2 + h],
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    vlak([onder[i], onder[j], boven[j], boven[i]], cel);
  }
  vlak([boven[3], boven[2], boven[1], boven[0]], cel);
}

/* -- de ballon -------------------------------------------------------------
 * Ballonvorm als 12 verticale banen ("goren"): 12 platte stukken per volle
 * cirkel, binnen het maximum van 16 voor objecten groter dan 1×1×1. De banen
 * wisselen rood en crème af; de onderste ring (de sleeve boven de brander)
 * is geel als accentband. Kleine platte dop bovenop als parachuteventiel.
 */
const ZIJDEN = 12;

// Profiel van de envelop: [hoogte, straal].
const PROFIEL = [
  [1.30, 0.34],
  [1.55, 0.66],
  [1.95, 0.96],
  [2.35, 1.02],
  [2.75, 0.85],
  [3.05, 0.50],
  [3.22, 0.18],
];

const punt = (hoek, r, y) => [Math.sin(hoek) * r, y, Math.cos(hoek) * r];

for (let i = 0; i < ZIJDEN; i++) {
  const a1 = (i / ZIJDEN) * Math.PI * 2;
  const a2 = ((i + 1) / ZIJDEN) * Math.PI * 2;
  const baan = i % 2 === 0 ? CEL.rood : CEL.creme;

  for (let ring = 0; ring < PROFIEL.length - 1; ring++) {
    const [yO, rO] = PROFIEL[ring];
    const [yB, rB] = PROFIEL[ring + 1];
    const cel = ring === 0 ? CEL.geel : baan;
    vlak(
      [punt(a1, rO, yO), punt(a2, rO, yO), punt(a2, rB, yB), punt(a1, rB, yB)],
      cel,
    );
  }
}

// Dop bovenop en donkere schijf in de opening onderin.
{
  const [yTop, rTop] = PROFIEL[PROFIEL.length - 1];
  const [yOnder, rOnder] = PROFIEL[0];
  const dop = [];
  const opening = [];
  for (let i = 0; i < ZIJDEN; i++) {
    const a = (i / ZIJDEN) * Math.PI * 2;
    dop.push(punt(a, rTop, yTop));
    opening.push(punt(a, rOnder, yOnder));
  }
  vlak(dop.slice().reverse(), CEL.rood);
  vlak(opening, CEL.brander);
}

/* -- mand, brander, touwen ------------------------------------------------- */

// Mand: taps toelopende bak, bodem op Y = 0.
const MAND_ONDER = 0.30;    // halve breedte van de bodem
const MAND_BOVEN = 0.37;    // halve breedte van de bovenrand
const MAND_HOOGTE = 0.52;
const MAND_RAND = 0.045;    // dikte van de balkjes rond de bovenrand
const FRAME_DIKTE = 0.035;  // stijlen van het branderframe
const TOUW_DIKTE = 0.025;   // draagtouwen; ondergrens uit de stijlgids is 0.02
const BRANDER_BLOK = 0.09;  // halve breedte van het branderblokje
const BRANDER_HOOGTE = 0.12;
{
  const o = MAND_ONDER, b = MAND_BOVEN, h = MAND_HOOGTE;
  const A = [-o, 0, -o], B = [o, 0, -o], C = [o, 0, o], D = [-o, 0, o];
  const E = [-b, h, -b], F = [b, h, -b], G = [b, h, b], H = [-b, h, b];
  vlak([D, C, B, A], CEL.mand);            // bodem
  vlak([E, F, G, H], CEL.mand);            // deksel (mand is dicht: goedkoop en van boven af nooit leeg)
  vlak([E, F, B, A], CEL.mand);
  vlak([G, H, D, C], CEL.mand);
  vlak([F, G, C, B], CEL.mand);
  vlak([H, E, A, D], CEL.mand);

  // Rand: liggende ring van vier balkjes rond de bovenrand.
  const r = MAND_RAND;
  balk([-b - r, h - 0.02, -b - r], [b + r, h + 2 * r - 0.02, -b + r], CEL.mandRand);
  balk([-b - r, h - 0.02, b - r], [b + r, h + 2 * r - 0.02, b + r], CEL.mandRand);
  balk([-b - r, h - 0.02, -b + r], [-b + r, h + 2 * r - 0.02, b - r], CEL.mandRand);
  balk([b - r, h - 0.02, -b + r], [b + r, h + 2 * r - 0.02, b - r], CEL.mandRand);
}

// Brander: vier schuine stijlen vanaf de mandrand naar een donker blokje.
const BRANDER_Y = 1.06;
{
  const voet = MAND_BOVEN - 0.02;
  const kop = 0.10;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    stijl(
      [sx * voet, MAND_HOOGTE + 0.05, sz * voet],
      [sx * kop, BRANDER_Y, sz * kop],
      FRAME_DIKTE,
      CEL.touw,
    );
  }
  balk(
    [-BRANDER_BLOK, BRANDER_Y, -BRANDER_BLOK],
    [BRANDER_BLOK, BRANDER_Y + BRANDER_HOOGTE, BRANDER_BLOK],
    CEL.brander,
  );
}

// Vier draagtouwen van de mandhoeken schuin omhoog naar de gele sleeve.
{
  const voet = MAND_BOVEN + 0.02;
  const [ySleeve, rSleeve] = PROFIEL[0];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const r = (rSleeve + 0.06) / Math.SQRT2;
    stijl(
      [sx * voet, MAND_HOOGTE + 0.06, sz * voet],
      [sx * r, ySleeve + 0.10, sz * r],
      TOUW_DIKTE,
      CEL.touw,
    );
  }
}

/* -- GLB schrijven --------------------------------------------------------- */

const posF = new Float32Array(posities);
const norF = new Float32Array(normalen);
const uvF = new Float32Array(uvs);
const idx = new Uint16Array(indices);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < posF.length; i += 3) {
  for (let as = 0; as < 3; as++) {
    if (posF[i + as] < min[as]) min[as] = posF[i + as];
    if (posF[i + as] > max[as]) max[as] = posF[i + as];
  }
}

const pad4 = (n) => (4 - (n % 4)) % 4;
const delen = [posF, norF, uvF, idx].map((a) => Buffer.from(a.buffer));
const offsets = [];
let cursor = 0;
for (const deel of delen) {
  offsets.push(cursor);
  cursor += deel.length + pad4(deel.length);
}
const bin = Buffer.alloc(cursor);
delen.forEach((deel, i) => deel.copy(bin, offsets[i]));

const aantal = posF.length / 3;
const json = {
  asset: {
    generator: 'taaleiland/make-hot-air-balloon.mjs',
    version: '2.0',
    extras: { taaleiland: { versie: 1, bron: 'procedureel', palet: 1 } },
  },
  scene: 0,
  scenes: [{ nodes: [0], name: 'hot-air-balloon' }],
  nodes: [{ mesh: 0, name: 'hot-air-balloon' }],
  meshes: [{
    name: 'hot-air-balloon',
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: 3,
      material: 0,
    }],
  }],
  materials: [{
    name: 'colormap',
    doubleSided: true,
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
  }],
  textures: [{ sampler: 0, source: 0, name: 'colormap' }],
  images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
  samplers: [{ magFilter: 9728, minFilter: 9728 }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: aantal, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: aantal, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: aantal, type: 'VEC2' },
    { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: delen[0].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[1], byteLength: delen[1].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[2], byteLength: delen[2].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[3], byteLength: delen[3].length, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};

const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = pad4(jsonBuf.length);
const totaal = 12 + 8 + jsonBuf.length + jsonPad + 8 + bin.length;

const glb = Buffer.alloc(totaal);
let p = 0;
glb.writeUInt32LE(0x46546c67, p); p += 4;             // 'glTF'
glb.writeUInt32LE(2, p); p += 4;
glb.writeUInt32LE(totaal, p); p += 4;
glb.writeUInt32LE(jsonBuf.length + jsonPad, p); p += 4;
glb.writeUInt32LE(0x4e4f534a, p); p += 4;             // 'JSON'
jsonBuf.copy(glb, p); p += jsonBuf.length;
glb.fill(0x20, p, p + jsonPad); p += jsonPad;         // JSON-chunk vult aan met spaties
glb.writeUInt32LE(bin.length, p); p += 4;
glb.writeUInt32LE(0x004e4942, p); p += 4;             // 'BIN'
bin.copy(glb, p);

writeFileSync(UIT, glb);
console.log(
  `${UIT}: ${glb.length} bytes, ${aantal} vertices, ${idx.length / 3} driehoeken, ` +
  `voetafdruk ${(max[0] - min[0]).toFixed(2)}×${(max[2] - min[2]).toFixed(2)}, hoogte ${max[1].toFixed(2)}`,
);
