/**
 * Bouwt kits/taalei-kit/hot-air-balloon.glb.
 *
 * Draai vanuit de repo-root:  node tools/bouw-luchtballon.mjs
 *
 * De ballon wordt procedureel getekend, net als de vuurtoren: er is geen
 * Kenney-onderdeel dat er ook maar in de buurt komt, dus overtrekken uit de
 * kits kan niet. Het bestand krijgt wel dezelfde vorm als de Kenney-bestanden,
 * zodat de catalogus en de laadcode geen uitzondering nodig hebben: één opaak
 * material 'colormap' dat via een externe URI naar Textures/colormap.png wijst,
 * geen transparantie en geen emissive.
 *
 * Er zit geen kleurwaarde in het model. Elk vlak wijst met zijn uv's naar één
 * texel van één cel uit de gedeelde colormap — dezelfde truc als de rest van de
 * kits, en dezelfde zes cellen die de vuurtoren al gebruikt.
 *
 * Volgens asset_style_guide.md:
 * - 2.4 x 2.4 voetafdruk, 4.52 hoog; mand 0.67 breed, op y = 0, pivot in het
 *   midden. De ballon staat naast de vuurtoren (4.27) en het grote schip.
 * - Rond werk is 14 stukken per cirkel (de ballon) en 8 voor de brander, die
 *   kleiner is dan 0.5 x 0.5 x 0.5. Niets dunner dan 0.045.
 * - Twee tekenopdrachten: de mand staat stil, `ballon` hangt aan een eigen node
 *   met zijn oorsprong op het brandersframe — het punt waar de kabels vastzitten
 *   en waar de ballon dus omheen wiegt.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UIT = join(ROOT, 'kits', 'taalei-kit', 'hot-air-balloon.glb');

/* -- kleuren --------------------------------------------------------------
 * De gedeelde colormap is 512 x 512 en bestaat uit cellen van 32 breed en 128
 * hoog, elk met een verloop van licht (boven) naar donker (onder). Een cel telt
 * vier banden van 32 pixels; `texel` mikt op het midden van zo'n band, zodat een
 * vlak precies één kleur oppikt en er nooit twee cellen door elkaar filteren.
 */
const ATLAS = 512;
const CEL_B = 32;
const CEL_H = 128;
const BAND = 32;

const texel = (cx, cy, band) => [
  (cx * CEL_B + CEL_B / 2 + 0.5) / ATLAS,
  (cy * CEL_H + band * BAND + BAND / 2 + 0.5) / ATLAS,
];

const KLEUR = {
  goud: texel(6, 0, 1),          // #ffbc50 — band, kroon en brander
  rood: texel(7, 0, 1),          // #b84439 — de rode banen
  room: texel(5, 2, 1),          // #fcf8e8 — de witte banen
  donker: texel(10, 0, 1),       // #404048 — kabels, staanders, frame
  schaduw: texel(10, 0, 3),      // #36363a — het gat onder in de ballon
  riet: texel(13, 0, 3),         // #cd8861 — de mand
  rietRand: texel(12, 0, 1),     // #9e5b41 — de rand van de mand
  rietDiep: texel(12, 0, 3),     // #875541 — bodem en binnenkant
};

/* -- maten ----------------------------------------------------------------
 * Alles in rastereenheden: 1 = één wand-/vloersegment.
 */
const BANEN = 14;                // stukken per cirkel voor de ballon

const MAND_ONDER = 0.36;         // halve maat onderaan
const MAND_BOVEN = 0.41;         // halve maat op randhoogte
const MAND_HOOG = 0.48;
const RAND_BUITEN = 0.45;
const RAND_TOP = 0.58;
const MAND_VLOER = 0.38;         // verzonken binnenvloer

const STAANDER = 0.04;           // halve dikte
const STAANDER_X = 0.375;        // hart van de staander, in x en z
const STAANDER_TOP = 1.0;
const FRAME_Y = 0.98;            // vier balkjes tussen de staanders
const FRAME = 0.035;             // halve dikte

const BRANDER_R = 0.18;
const BRANDER_ONDER = 0.8;
const BRANDER_BOVEN = 1.16;
const STEEL = 0.06;              // halve dikte van de branderstaander

const KABEL = 0.028;             // halve dikte
const MOND_Y = 1.55;
const MOND_R = 0.62;

/** Het scharnier: hier komen de kabels op de staanders en hier wiegt de ballon omheen. */
const SCHARNIER = FRAME_Y;

/**
 * Doorsnede van de ballon, van de mond naar de kroon. Een omgekeerde druppel:
 * snel breed worden, boven de evenaar langzaam intrekken.
 */
const RINGEN = [
  [MOND_Y, MOND_R],
  [1.72, 0.80],   // einde van de gouden band bij de mond
  [2.00, 1.02],
  [2.34, 1.17],
  [2.70, 1.21],
  [3.05, 1.18],
  [3.42, 1.06],
  [3.80, 0.82],
  [4.15, 0.48],
  [4.38, 0.18],   // begin van de gouden kroon
];

/* -- meshbouw -------------------------------------------------------------
 * Plat geschaduwd: elk vlak krijgt eigen hoekpunten met de normaal van dat vlak,
 * zodat de facetten zichtbaar blijven en niet worden weggerond.
 */
function nieuweMesh(naam) {
  return { naam, pos: [], nrm: [], uv: [], idx: [] };
}

const min3 = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
const max3 = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
const trek = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const kruis = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normeer = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Driehoek p0-p1-p2, tegen de klok in gezien vanaf de goede kant. */
function driehoek(mesh, p0, p1, p2, uv, normaal) {
  const n = normaal ?? normeer(kruis(trek(p1, p0), trek(p2, p0)));
  const basis = mesh.pos.length / 3;
  for (const p of [p0, p1, p2]) {
    mesh.pos.push(p[0], p[1], p[2]);
    mesh.nrm.push(n[0], n[1], n[2]);
    mesh.uv.push(uv[0], uv[1]);
  }
  mesh.idx.push(basis, basis + 1, basis + 2);
}

/**
 * Vierhoek p0-p1-p2-p3. De vier punten liggen op een omwentelingsvlak niet
 * precies in één vlak; beide driehoeken krijgen daarom dezelfde gemiddelde
 * normaal, anders breekt het facet in twee tinten.
 */
function vlak(mesh, p0, p1, p2, p3, uv) {
  const a = kruis(trek(p1, p0), trek(p3, p0));
  const b = kruis(trek(p2, p1), trek(p0, p1));
  const n = normeer([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  driehoek(mesh, p0, p1, p2, uv, n);
  driehoek(mesh, p0, p2, p3, uv, n);
}

/** Rechthoekige doos van hoek `a` tot hoek `b`, met per zijde dezelfde cel. */
function doos(mesh, a, b, uv, uvBoven = uv, uvOnder = uv) {
  const [x0, y0, z0] = min3(a, b);
  const [x1, y1, z1] = max3(a, b);
  vlak(mesh, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv); // +z
  vlak(mesh, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uv); // -z
  vlak(mesh, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uv); // +x
  vlak(mesh, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uv); // -x
  vlak(mesh, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uvBoven);
  vlak(mesh, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uvOnder);
}

/** Balk met vierkante doorsnede van punt `a` naar punt `b` — de kabels. */
function balk(mesh, a, b, halveDikte, uv) {
  const as = normeer(trek(b, a));
  const hulp = Math.abs(as[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normeer(kruis(hulp, as));
  const v = normeer(kruis(as, u));
  const hoek = (p, su, sv) => [
    p[0] + u[0] * su * halveDikte + v[0] * sv * halveDikte,
    p[1] + u[1] * su * halveDikte + v[1] * sv * halveDikte,
    p[2] + u[2] * su * halveDikte + v[2] * sv * halveDikte,
  ];
  const tekens = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const onder = tekens.map(([su, sv]) => hoek(a, su, sv));
  const boven = tekens.map(([su, sv]) => hoek(b, su, sv));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    vlak(mesh, onder[i], onder[j], boven[j], boven[i], uv);
  }
  vlak(mesh, boven[0], boven[1], boven[2], boven[3], uv);
  vlak(mesh, onder[3], onder[2], onder[1], onder[0], uv);
}

/** Horizontale ring tussen twee vierkanten, bijv. de bovenkant van de mandrand. */
function ring(mesh, y, halfBinnen, halfBuiten, uv, omhoog = true) {
  const b = halfBinnen;
  const B = halfBuiten;
  const paren = [
    [[-b, y, B], [b, y, B], [b, y, b], [-b, y, b]],
    [[-b, y, -b], [b, y, -b], [b, y, -B], [-b, y, -B]],
    [[b, y, B], [B, y, B], [B, y, -B], [b, y, -B]],
    [[-B, y, B], [-b, y, B], [-b, y, -B], [-B, y, -B]],
  ];
  for (const [p0, p1, p2, p3] of paren) {
    if (omhoog) vlak(mesh, p3, p2, p1, p0, uv);
    else vlak(mesh, p0, p1, p2, p3, uv);
  }
}

/* -- de mand --------------------------------------------------------------
 * Rieten mand met een dikke rand, een verzonken binnenvloer en vier staanders
 * naar het brandersframe. Vierkant, want de kits kennen geen ronde manden en
 * een blokje riet leest op deze schaal beter dan een veertienhoek.
 */
const mand = nieuweMesh('mand');

/** De vier zijden van een vierkant, als (langs, naar buiten) → wereldpunt. */
const zijden = [[1, 0], [0, -1], [-1, 0], [0, 1]].map(([sx, sz]) => {
  const t = [sz, -sx];
  return (langs, uit, y) => [sx * uit + t[0] * langs, y, sz * uit + t[1] * langs];
});

// Schuine wand, dan de rand: buitenkant, onderkant, bovenkant, binnenkant.
for (const punt of zijden) {
  vlak(
    mand,
    punt(-MAND_ONDER, MAND_ONDER, 0),
    punt(MAND_ONDER, MAND_ONDER, 0),
    punt(MAND_BOVEN, MAND_BOVEN, MAND_HOOG),
    punt(-MAND_BOVEN, MAND_BOVEN, MAND_HOOG),
    KLEUR.riet,
  );
  vlak(
    mand,
    punt(-RAND_BUITEN, RAND_BUITEN, MAND_HOOG),
    punt(RAND_BUITEN, RAND_BUITEN, MAND_HOOG),
    punt(RAND_BUITEN, RAND_BUITEN, RAND_TOP),
    punt(-RAND_BUITEN, RAND_BUITEN, RAND_TOP),
    KLEUR.rietRand,
  );
  vlak(
    mand,
    punt(RAND_BUITEN, MAND_BOVEN, RAND_TOP),
    punt(-RAND_BUITEN, MAND_BOVEN, RAND_TOP),
    punt(-RAND_BUITEN, MAND_BOVEN, MAND_VLOER),
    punt(RAND_BUITEN, MAND_BOVEN, MAND_VLOER),
    KLEUR.rietDiep,
  );
}
ring(mand, MAND_HOOG, MAND_BOVEN, RAND_BUITEN, KLEUR.rietDiep, false);
ring(mand, RAND_TOP, MAND_BOVEN, RAND_BUITEN, KLEUR.rietRand, true);
vlak(
  mand,
  [-MAND_BOVEN, MAND_VLOER, MAND_BOVEN],
  [MAND_BOVEN, MAND_VLOER, MAND_BOVEN],
  [MAND_BOVEN, MAND_VLOER, -MAND_BOVEN],
  [-MAND_BOVEN, MAND_VLOER, -MAND_BOVEN],
  KLEUR.rietDiep,
);
vlak(
  mand,
  [-MAND_ONDER, 0, -MAND_ONDER],
  [MAND_ONDER, 0, -MAND_ONDER],
  [MAND_ONDER, 0, MAND_ONDER],
  [-MAND_ONDER, 0, MAND_ONDER],
  KLEUR.rietDiep,
);

/**
 * Vier staanders op de hoeken, met bovenin vier balkjes ertussen. Een dicht
 * frame zoals een echte ballon dat heeft werd op deze schaal een zwarte tafel
 * boven de mand; vier losse balkjes houden de silhouet open.
 */
const HOEKEN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
for (const [sx, sz] of HOEKEN) {
  doos(
    mand,
    [sx * STAANDER_X - STAANDER, MAND_HOOG - 0.02, sz * STAANDER_X - STAANDER],
    [sx * STAANDER_X + STAANDER, STAANDER_TOP, sz * STAANDER_X + STAANDER],
    KLEUR.donker,
  );
}
for (let i = 0; i < 4; i++) {
  const [ax, az] = HOEKEN[i];
  const [bx, bz] = HOEKEN[(i + 1) % 4];
  balk(
    mand,
    [ax * STAANDER_X, FRAME_Y, az * STAANDER_X],
    [bx * STAANDER_X, FRAME_Y, bz * STAANDER_X],
    FRAME,
    KLEUR.donker,
  );
}

// De brander: een achthoekige trommel op een steel, kleiner dan 0.5 x 0.5 x 0.5.
doos(
  mand,
  [-STEEL, MAND_VLOER, -STEEL],
  [STEEL, BRANDER_ONDER + 0.02, STEEL],
  KLEUR.donker,
);
{
  const N = 8;
  const punt = (i, y) => {
    const a = ((i + 0.5) * 2 * Math.PI) / N;
    return [Math.sin(a) * BRANDER_R, y, Math.cos(a) * BRANDER_R];
  };
  for (let i = 0; i < N; i++) {
    vlak(
      mand,
      punt(i, BRANDER_ONDER),
      punt(i + 1, BRANDER_ONDER),
      punt(i + 1, BRANDER_BOVEN),
      punt(i, BRANDER_BOVEN),
      KLEUR.goud,
    );
  }
  for (let i = 0; i < N; i++) {
    driehoek(mand, [0, BRANDER_BOVEN, 0], punt(i, BRANDER_BOVEN), punt(i + 1, BRANDER_BOVEN), KLEUR.goud);
    driehoek(mand, [0, BRANDER_ONDER, 0], punt(i + 1, BRANDER_ONDER), punt(i, BRANDER_ONDER), KLEUR.schaduw);
  }
}

/* -- de ballon ------------------------------------------------------------
 * Eigen node met zijn oorsprong op het frame; alles hieronder staat dus in
 * coördinaten ten opzichte van dat scharnier.
 */
const ballon = nieuweMesh('ballon');
const y0 = SCHARNIER;

const opRing = (r, i) => {
  const a = (i * 2 * Math.PI) / BANEN;
  return [Math.sin(a) * RINGEN[r][1], RINGEN[r][0] - y0, Math.cos(a) * RINGEN[r][1]];
};

for (let r = 0; r < RINGEN.length - 1; r++) {
  const rand = r === 0 || r === RINGEN.length - 2; // gouden band onderaan en onder de kroon
  for (let i = 0; i < BANEN; i++) {
    const uv = rand ? KLEUR.goud : (i % 2 === 0 ? KLEUR.rood : KLEUR.room);
    vlak(ballon, opRing(r, i), opRing(r, i + 1), opRing(r + 1, i + 1), opRing(r + 1, i), uv);
  }
}

// Kroon bovenop en het donkere gat onderin, zodat je er niet doorheen kijkt.
const top = RINGEN.length - 1;
for (let i = 0; i < BANEN; i++) {
  driehoek(ballon, [0, RINGEN[top][0] - y0, 0], opRing(top, i), opRing(top, i + 1), KLEUR.goud);
}
for (let i = 0; i < BANEN; i++) {
  const a0 = (i * 2 * Math.PI) / BANEN;
  const a1 = ((i + 1) * 2 * Math.PI) / BANEN;
  const y = MOND_Y - y0 + 0.03;
  const r = MOND_R - 0.02;
  driehoek(
    ballon,
    [0, y, 0],
    [Math.sin(a1) * r, y, Math.cos(a1) * r],
    [Math.sin(a0) * r, y, Math.cos(a0) * r],
    KLEUR.schaduw,
  );
}

// Vier kabels van de staanders naar de mond.
for (const [sx, sz] of HOEKEN) {
  const a = [sx * STAANDER_X, FRAME_Y - y0 - 0.03, sz * STAANDER_X];
  const hoek = Math.atan2(sx, sz);
  const b = [Math.sin(hoek) * MOND_R, MOND_Y - y0 + 0.01, Math.cos(hoek) * MOND_R];
  balk(ballon, a, b, KABEL, KLEUR.donker);
}

/* -- glb schrijven --------------------------------------------------------
 * Eén buffer met per mesh POSITION, NORMAL, TEXCOORD_0 en een index-array.
 * De accessors krijgen min/max mee: tools/build-catalog.mjs leest daaruit de
 * afmetingen, zonder de vertexdata aan te raken.
 */
const brokken = [];
let lengte = 0;

function voegToe(data, doel) {
  while (lengte % 4 !== 0) { brokken.push(Buffer.alloc(1)); lengte += 1; }
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const view = { buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) };
  brokken.push(buf);
  lengte += buf.length;
  return view;
}

const bufferViews = [];
const accessors = [];
const meshes = [];

for (const mesh of [mand, ballon]) {
  const pos = new Float32Array(mesh.pos);
  const nrm = new Float32Array(mesh.nrm);
  const uv = new Float32Array(mesh.uv);
  const idx = new Uint16Array(mesh.idx);
  if (mesh.pos.length / 3 > 65535) throw new Error(`${mesh.naam}: te veel hoekpunten voor uint16`);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let as = 0; as < 3; as++) {
      if (pos[i + as] < min[as]) min[as] = pos[i + as];
      if (pos[i + as] > max[as]) max[as] = pos[i + as];
    }
  }

  const vPos = bufferViews.push(voegToe(pos, 34962)) - 1;
  const vNrm = bufferViews.push(voegToe(nrm, 34962)) - 1;
  const vUv = bufferViews.push(voegToe(uv, 34962)) - 1;
  const vIdx = bufferViews.push(voegToe(idx, 34963)) - 1;

  const aPos = accessors.push({
    bufferView: vPos, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max,
  }) - 1;
  const aNrm = accessors.push({
    bufferView: vNrm, componentType: 5126, count: nrm.length / 3, type: 'VEC3',
  }) - 1;
  const aUv = accessors.push({
    bufferView: vUv, componentType: 5126, count: uv.length / 2, type: 'VEC2',
  }) - 1;
  const aIdx = accessors.push({
    bufferView: vIdx, componentType: 5123, count: idx.length, type: 'SCALAR',
  }) - 1;

  meshes.push({
    name: mesh.naam,
    primitives: [{
      attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv },
      indices: aIdx,
      material: 0,
    }],
  });
}

const gltf = {
  asset: {
    generator: 'taaleiland/bouw-luchtballon.mjs',
    version: '2.0',
    extras: { taaleiland: { versie: 1, bron: 'procedureel', palet: 1 } },
  },
  scene: 0,
  scenes: [{ nodes: [0], name: 'hot-air-balloon' }],
  nodes: [
    { name: 'hot-air-balloon', children: [1, 2] },
    { name: 'mand', mesh: 0 },
    // Oorsprong op het scharnier: de ballon wiegt om het brandersframe.
    { name: 'ballon', mesh: 1, translation: [0, SCHARNIER, 0] },
  ],
  meshes,
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
  buffers: [{ byteLength: lengte }],
};

const bin = Buffer.concat(brokken);
const json = Buffer.from(JSON.stringify(gltf), 'utf8');
const vulJson = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
const vulBin = Buffer.alloc((4 - (bin.length % 4)) % 4, 0x00);

const kop = (lengte2, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(lengte2, 0);
  b.writeUInt32LE(type, 4);
  return b;
};

const jsonChunk = Buffer.concat([kop(json.length + vulJson.length, 0x4e4f534a), json, vulJson]);
const binChunk = Buffer.concat([kop(bin.length + vulBin.length, 0x004e4942), bin, vulBin]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + jsonChunk.length + binChunk.length, 8);

writeFileSync(UIT, Buffer.concat([header, jsonChunk, binChunk]));

const driehoeken = (mand.idx.length + ballon.idx.length) / 3;
const hoekpunten = (mand.pos.length + ballon.pos.length) / 3;
console.log(
  `hot-air-balloon.glb — ${driehoeken} driehoeken, ${hoekpunten} hoekpunten, 2 draws, ` +
  `${(12 + jsonChunk.length + binChunk.length) / 1024 | 0} kB`,
);
