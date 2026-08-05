/**
 * Genereert kits/taalei-kit/hot-air-balloon.glb.
 *
 * Draai vanuit de repo-root:  node tools/make-hot-air-balloon.mjs
 *
 * Zelfde conventies als lighthouse.glb: één materiaal dat naar de gedeelde
 * colormap wijst (Textures/colormap.png), platte facetten met eigen normalen,
 * kleuren via UV's in een paletcel. De ballon staat met de mandbodem op Y = 0,
 * pivot in het midden van de voetafdruk.
 *
 * Twee tekenopdrachten: de ballon zelf en een losse `flame`-node boven de
 * brander (oorsprong op de brandermond), zodat de vlam kan flakkeren.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UIT = join(ROOT, 'kits', 'taalei-kit', 'hot-air-balloon.glb');

/* -- kleuren ---------------------------------------------------------------
 * Cellen uit palet.json (gedeeld palet): [kolom, rij] op de 16×4-atlas van
 * 32×128px-gradiëntcellen. UV wijst naar het midden van de kolom; `vPx` kiest
 * de hoogte in de gradiënt (klein = licht, groot = donker) — zo krijgt de
 * envelop een subtiel verloop van donker onderaan naar licht bovenin, zonder
 * kleuren buiten het palet.
 */
const CEL = {
  creme: [5, 2],     // #f0ece3 — hoofdkleur van de goren
  roest: [5, 0],     // #d07b56 — accentgoor en top
  blauw: [3, 2],     // #9da4c4 — accentgoor en onderrand
  vlam: [6, 0],      // #ffb349 — brandervlam
  weefsel: [5, 0],   // #d07b56 — mandvlechtwerk
  band: [12, 0],     // #995a41 — banden in het vlechtwerk
  rand: [12, 0],     // #995a41 — mandranden en hoekstijlen
  touw: [6, 1],      // #474a58 — touwen en draagring
  donker: [10, 0],   // #3e3e44 — skirt, brander, kroontje, opening
};
const uv = (cel, vPx = 48.5) => [(cel[0] * 32 + 16.5) / 512, (cel[1] * 128 + vPx) / 512];

/* -- meshbouw --------------------------------------------------------------
 * Twee losse delen, elk één primitive: 'ballon' en 'vlam'.
 */

function deel() {
  return { posities: [], normalen: [], uvs: [], indices: [] };
}
const ballon = deel();
const vlamDeel = deel();

/** Eén platte veelhoek (fan-getrianguleerd) met eigen facetnormaal. */
function vlak(d, hoeken, cel, vPx) {
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

  const basis = d.posities.length / 3;
  const [u, v] = uv(cel, vPx);
  for (const p of hoeken) {
    d.posities.push(...p);
    d.normalen.push(...n);
    d.uvs.push(u, v);
  }
  for (let i = 1; i < hoeken.length - 1; i++) {
    d.indices.push(basis, basis + i, basis + i + 1);
  }
}

/** Balk met as-uitlijning. */
function balk(d, [x1, y1, z1], [x2, y2, z2], cel, vPx) {
  const A = [x1, y1, z1], B = [x2, y1, z1], C = [x2, y1, z2], D = [x1, y1, z2];
  const E = [x1, y2, z1], F = [x2, y2, z1], G = [x2, y2, z2], H = [x1, y2, z2];
  vlak(d, [A, B, C, D], cel, vPx);
  vlak(d, [H, G, F, E], cel, vPx);
  vlak(d, [E, F, B, A], cel, vPx);
  vlak(d, [G, H, D, C], cel, vPx);
  vlak(d, [F, G, C, B], cel, vPx);
  vlak(d, [H, E, A, D], cel, vPx);
}

/** Schuine vierzijdige koker tussen twee horizontale vierkantjes, met dop. */
function stijl(d, [x1, y, z1], [x2, y2, z2], dikte, cel, vPx) {
  const h = dikte / 2;
  const onder = [
    [x1 - h, y, z1 - h], [x1 + h, y, z1 - h], [x1 + h, y, z1 + h], [x1 - h, y, z1 + h],
  ];
  const boven = [
    [x2 - h, y2, z2 - h], [x2 + h, y2, z2 - h], [x2 + h, y2, z2 + h], [x2 - h, y2, z2 + h],
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    vlak(d, [onder[i], onder[j], boven[j], boven[i]], cel, vPx);
  }
  vlak(d, [boven[3], boven[2], boven[1], boven[0]], cel, vPx);
}

const punt = (hoek, r, y) => [Math.sin(hoek) * r, y, Math.cos(hoek) * r];

/** Draaivorm: banden tussen opeenvolgende ringen; kleur per (band, segment). */
function draaivorm(d, ringen, zijden, kleurVan) {
  for (let s = 0; s < zijden; s++) {
    const a1 = (s / zijden) * Math.PI * 2;
    const a2 = ((s + 1) / zijden) * Math.PI * 2;
    for (let band = 0; band < ringen.length - 1; band++) {
      const [rO, yO] = ringen[band];
      const [rB, yB] = ringen[band + 1];
      const { cel, vPx } = kleurVan(band, s);
      vlak(d, [punt(a1, rO, yO), punt(a2, rO, yO), punt(a2, rB, yB), punt(a1, rB, yB)], cel, vPx);
    }
  }
}

/* -- de envelop ------------------------------------------------------------
 * Druppelvorm als 16 verticale goren: het maximum aan platte stukken per
 * volle cirkel voor objecten groter dan 1×1×1. Patroon: crème met om de vier
 * goren een roest- of blauwbaan; de onderste twee banden blauw, de bovenste
 * twee roest, donker kroontje als parachuteventiel.
 */
const GOREN = 16;

// Envelopprofiel: [straal, hoogte], van keel tot kruin.
const PROFIEL = [
  [0.117, 1.180],
  [0.307, 1.350],
  [0.519, 1.572],
  [0.710, 1.827],
  [0.869, 2.123],
  [0.965, 2.420],
  [1.001, 2.685],
  [0.971, 2.929],
  [0.880, 3.130],
  [0.721, 3.310],
  [0.498, 3.459],
  [0.244, 3.554],
  [0.106, 3.592],
];
const BANDEN = PROFIEL.length - 1;

draaivorm(ballon, PROFIEL, GOREN, (band, goor) => {
  // Donker onderin, licht bovenin: hoogte in de gradiëntcel per band.
  const vPx = 78 - (band / (BANDEN - 1)) * 48;
  if (band <= 1) return { cel: CEL.blauw, vPx };
  if (band >= BANDEN - 2) return { cel: CEL.roest, vPx };
  const k = goor % 4;
  const cel = k === 1 ? CEL.roest : k === 3 ? CEL.blauw : CEL.creme;
  return { cel, vPx };
});

// Kroontje bovenop en donkere schijf in de keelopening.
{
  const [rTop, yTop] = PROFIEL[PROFIEL.length - 1];
  const [rKeel, yKeel] = PROFIEL[0];
  const kroon = [];
  const opening = [];
  for (let i = 0; i < GOREN; i++) {
    const a = (i / GOREN) * Math.PI * 2;
    kroon.push(punt(a, rTop, yTop + 0.03));
    opening.push(punt(a, rKeel, yKeel));
  }
  // Kroontje als laag afgeplat schijfje, iets boven de kruin.
  draaivorm(ballon, [[rTop, yTop], [rTop + 0.02, yTop + 0.03]], GOREN, () => ({ cel: CEL.donker }));
  vlak(ballon, kroon.slice().reverse(), CEL.donker);
  vlak(ballon, opening, CEL.donker, 100);
}

/* -- skirt, draagring, brander ---------------------------------------------
 * De skirt is de open donkere kraag tussen keel en draagring; de vlam hangt
 * als losse node boven de brander.
 */
const SKIRT_ONDER = [0.205, 0.950];
const RING_R = 0.175;
const RING_Y = [0.840, 0.880];
const BRANDER_R = 0.075;
const BRANDER_Y = [0.700, 0.850];
const VLAM_JOINT = 0.850;  // oorsprong van de vlam-node: de brandermond
const VLAM_HOOGTE = 0.26;

draaivorm(ballon, [SKIRT_ONDER, PROFIEL[0]], GOREN, () => ({ cel: CEL.donker, vPx: 70 }));

// Draagring: achtkantige band waar skirt, touwen en brander samenkomen.
draaivorm(
  ballon,
  [[RING_R, RING_Y[0]], [RING_R, RING_Y[1]]],
  8,
  () => ({ cel: CEL.touw }),
);

// Brander: zeszijdig blokje dat onder de ring hangt.
{
  const zes = [];
  for (let i = 0; i < 6; i++) zes.push((i / 6) * Math.PI * 2);
  draaivorm(
    ballon,
    [[BRANDER_R + 0.01, BRANDER_Y[0]], [BRANDER_R, BRANDER_Y[1]]],
    6,
    () => ({ cel: CEL.donker, vPx: 60 }),
  );
  const bodem = zes.map((a) => punt(a, BRANDER_R + 0.01, BRANDER_Y[0]));
  vlak(ballon, bodem, CEL.donker, 60);
}

// Vlam: losse node, zeszijdige kegel; lokale coördinaten vanaf de brandermond.
{
  const voet = [];
  for (let i = 0; i < 6; i++) {
    voet.push(punt((i / 6) * Math.PI * 2, 0.07, 0));
  }
  const top = [0, VLAM_HOOGTE, 0];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    vlak(vlamDeel, [voet[i], voet[j], top], CEL.vlam, 20);
  }
  vlak(vlamDeel, voet.slice().reverse(), CEL.vlam, 90);
}

/* -- mand ------------------------------------------------------------------
 * Gevlochten bak: licht weefsel met twee oranje banden, donkere randen en
 * vier hoekstijlen waar de draagtouwen aan vastzitten.
 */
const MAND_HALF = 0.27;       // halve breedte van het weefsel
const MAND_WEEFSEL = [0.06, 0.44];
const MAND_RIJEN = 5;         // vlechtrijen: zelfde cel, om en om licht/donker
const MAND_VOET = [0, 0.06];
const MAND_RAND = [0.44, 0.50];
const STIJL_TOP = 0.52;       // hoekstijlen steken boven de rand uit
const TOUW_DIKTE = 0.022;

{
  const w = MAND_HALF;
  // Vlechtwerk: horizontale rijen die om en om licht en donker uit dezelfde
  // gradiëntcel putten — leest als riet zonder extra kleuren.
  const [w0, w1] = MAND_WEEFSEL;
  for (let rij = 0; rij < MAND_RIJEN; rij++) {
    const y1 = w0 + ((w1 - w0) * rij) / MAND_RIJEN;
    const y2 = w0 + ((w1 - w0) * (rij + 1)) / MAND_RIJEN;
    balk(ballon, [-w, y1, -w], [w, y2, w], CEL.weefsel, rij % 2 === 0 ? 68 : 38);
  }
  balk(ballon, [-w - 0.015, MAND_VOET[0], -w - 0.015], [w + 0.015, MAND_VOET[1], w + 0.015], CEL.rand);
  balk(ballon, [-w - 0.03, MAND_RAND[0], -w - 0.03], [w + 0.03, MAND_RAND[1], w + 0.03], CEL.rand);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    balk(
      ballon,
      [sx * w - 0.025, 0.02, sz * w - 0.025],
      [sx * w + 0.025, STIJL_TOP, sz * w + 0.025],
      CEL.rand,
      70,
    );
  }
}

/* -- touwen ----------------------------------------------------------------
 * Vier draagtouwen van de hoekstijlen naar de draagring, en acht korte
 * touwtjes van de ring omhoog naar de onderrand van de skirt.
 */
{
  const naarRing = RING_R / Math.SQRT2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    stijl(
      ballon,
      [sx * MAND_HALF, STIJL_TOP, sz * MAND_HALF],
      [sx * naarRing, RING_Y[0], sz * naarRing],
      TOUW_DIKTE,
      CEL.touw,
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    stijl(
      ballon,
      [Math.sin(a) * RING_R, RING_Y[1], Math.cos(a) * RING_R],
      [Math.sin(a) * SKIRT_ONDER[0], SKIRT_ONDER[1], Math.cos(a) * SKIRT_ONDER[0]],
      0.02,
      CEL.touw,
    );
  }
}

/* -- GLB schrijven --------------------------------------------------------- */

const pad4 = (n) => (4 - (n % 4)) % 4;

function accessorData(d) {
  const pos = new Float32Array(d.posities);
  const nor = new Float32Array(d.normalen);
  const uvA = new Float32Array(d.uvs);
  const idx = new Uint16Array(d.indices);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let as = 0; as < 3; as++) {
      if (pos[i + as] < min[as]) min[as] = pos[i + as];
      if (pos[i + as] > max[as]) max[as] = pos[i + as];
    }
  }
  return { buffers: [pos, nor, uvA, idx].map((a) => Buffer.from(a.buffer)), min, max, aantal: pos.length / 3, indexAantal: idx.length };
}

const delen = [accessorData(ballon), accessorData(vlamDeel)];

const bufferViews = [];
const accessors = [];
const stukken = [];
let cursor = 0;
delen.forEach((d, m) => {
  const basis = bufferViews.length;
  d.buffers.forEach((buf, i) => {
    bufferViews.push({
      buffer: 0,
      byteOffset: cursor,
      byteLength: buf.length,
      target: i === 3 ? 34963 : 34962,
    });
    stukken.push({ buf, at: cursor });
    cursor += buf.length + pad4(buf.length);
  });
  accessors.push(
    { bufferView: basis, componentType: 5126, count: d.aantal, type: 'VEC3', min: d.min, max: d.max },
    { bufferView: basis + 1, componentType: 5126, count: d.aantal, type: 'VEC3' },
    { bufferView: basis + 2, componentType: 5126, count: d.aantal, type: 'VEC2' },
    { bufferView: basis + 3, componentType: 5123, count: d.indexAantal, type: 'SCALAR' },
  );
});
const bin = Buffer.alloc(cursor);
for (const { buf, at } of stukken) buf.copy(bin, at);

const json = {
  asset: {
    generator: 'taaleiland/make-hot-air-balloon.mjs',
    version: '2.0',
    extras: { taaleiland: { versie: 2, bron: 'procedureel', palet: 1 } },
  },
  scene: 0,
  scenes: [{ nodes: [0], name: 'hot-air-balloon' }],
  nodes: [
    { name: 'hot-air-balloon', children: [1, 2] },
    { mesh: 0, name: 'balloon' },
    { mesh: 1, name: 'flame', translation: [0, VLAM_JOINT, 0] },
  ],
  meshes: [
    { name: 'balloon', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] },
    { name: 'flame', primitives: [{ attributes: { POSITION: 4, NORMAL: 5, TEXCOORD_0: 6 }, indices: 7, material: 0 }] },
  ],
  materials: [{
    name: 'colormap',
    doubleSided: true,
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
  }],
  textures: [{ sampler: 0, source: 0, name: 'colormap' }],
  images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
  samplers: [{ magFilter: 9728, minFilter: 9728 }],
  accessors,
  bufferViews,
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
const tris = delen.reduce((t, d) => t + d.indexAantal / 3, 0);
const breedte = Math.max(delen[0].max[0] - delen[0].min[0], delen[0].max[2] - delen[0].min[2]);
console.log(
  `${UIT}: ${glb.length} bytes, ${tris} driehoeken, 2 tekenopdrachten, ` +
  `voetafdruk ${breedte.toFixed(2)}, hoogte ${(delen[0].max[1]).toFixed(2)}`,
);
