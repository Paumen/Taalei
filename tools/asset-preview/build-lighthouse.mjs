// Bouwt kits/pirate-kit/lighthouse.glb: variant A uit de blockout-verkenning.
//
// 8-zijdige gefacetteerde toren volgens asset_style_guide.md: platte stukken
// (max 16 per cirkel), basis op Y=0, pivot in het midden van de voetafdruk,
// dak zonder overstek. Kleuren komen uit de gedeelde colormap; elke cel is
// 32px breed en 128px hoog met een verticale gradiënt (16 kolommen x 4 rijen).
//
// Gebruik:  node build-lighthouse.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const UIT = join(HERE, '..', '..', 'kits', 'pirate-kit', 'lighthouse.glb');

// Celkolommen in de gedeelde colormap (zie kits/palet.json, palet 'gedeeld').
const KLEUR = {
  wit:   { cel: [5, 2] },  // #dcdce9 — zeilwit
  rood:  { cel: [7, 0] },  // #e76047 — vlagrood
  donker:{ cel: [10, 0] }, // #3e3e44 — kanonzwart
  rots:  { cel: [3, 2] },  // #9da4c4 — rotsgrijs
  geel:  { cel: [6, 0] },  // #ffb349 — lantaarngeel
  hout:  { cel: [12, 0] }, // #995a41 — deurhout
};

// UV binnen een cel: u in het midden van de kolom, v op fractie f (0=licht
// bovenin de gradiënt, 1=donker onderin). Marge houdt samples uit buurcellen.
function uv(kleur, f = 0.35) {
  const [kol, rij] = KLEUR[kleur].cel;
  return [(kol + 0.5) / 16, (rij + 0.06 + 0.88 * Math.min(1, Math.max(0, f))) / 4];
}

// ---- mesh-opbouw: platte driehoeken met vaste UV per hoekpunt --------------
const pos = [], nrm = [], tex = [], idx = [];

function tri(a, b, c, uvA, uvB, uvC) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  n = n.map((x) => x / l);
  for (const [p, t] of [[a, uvA], [b, uvB], [c, uvC]]) {
    idx.push(pos.length / 3);
    pos.push(...p);
    nrm.push(...n);
    tex.push(...t);
  }
}
function quad(a, b, c, d, uvAB, uvCD) {
  // a-b onder, d-c boven; uvAB/uvCD zijn de uv's voor onder- en bovenrand
  tri(a, b, c, uvAB, uvAB, uvCD);
  tri(a, c, d, uvAB, uvCD, uvCD);
}

// Achthoek met facetvlak richting +Z (hoekpunten om 22.5 graden verschoven).
const N = 8;
function ring(r, y) {
  const punten = [];
  for (let i = 0; i < N; i++) {
    const hoek = ((i + 0.5) / N) * Math.PI * 2;
    punten.push([r * Math.sin(hoek), y, r * Math.cos(hoek)]);
  }
  return punten;
}

// Zijkant tussen twee ringen; kleur met gradiënt van fBoven naar fOnder.
function mantel(rOnder, yOnder, rBoven, yBoven, kleur, fOnder = 0.7, fBoven = 0.15) {
  const o = ring(rOnder, yOnder), b = ring(rBoven, yBoven);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    quad(o[i], o[j], b[j], b[i], uv(kleur, fOnder), uv(kleur, fBoven));
  }
}
// Horizontale achthoekige deksel (waaier); omlaag = onderkant.
function deksel(r, y, kleur, f, omlaag = false) {
  const p = ring(r, y);
  for (let i = 1; i < N - 1; i++) {
    const [a, b, c] = omlaag ? [p[0], p[i + 1], p[i]] : [p[0], p[i], p[i + 1]];
    tri(a, b, c, uv(kleur, f), uv(kleur, f), uv(kleur, f));
  }
}
// Kegel van ring naar top.
function kegel(r, yBasis, yTop, kleur, fBasis = 0.75, fTop = 0.2) {
  const p = ring(r, yBasis);
  const top = [0, yTop, 0];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tri(p[i], p[j], top, uv(kleur, fBasis), uv(kleur, fBasis), uv(kleur, fTop));
  }
}
// Blok (voor deur en raampje), gecentreerd op x, van y0 tot y1, z0 tot z1.
function blok(x, breedte, y0, y1, z0, z1, kleur, f = 0.4) {
  const w = breedte / 2, u0 = uv(kleur, f + 0.2), u1 = uv(kleur, f);
  const A = [x - w, y0, z1], B = [x + w, y0, z1], C = [x + w, y1, z1], D = [x - w, y1, z1];
  const E = [x - w, y0, z0], F = [x + w, y0, z0], G = [x + w, y1, z0], H = [x - w, y1, z0];
  quad(A, B, C, D, u0, u1);          // voor
  quad(F, E, H, G, u0, u1);          // achter
  quad(E, A, D, H, u0, u1);          // links
  quad(B, F, G, C, u0, u1);          // rechts
  quad(D, C, G, H, u1, u1);          // boven
}

// ---- de vuurtoren ----------------------------------------------------------
// Sokkel van rots
mantel(0.85, 0, 0.72, 0.4, 'rots', 0.75, 0.2);
deksel(0.72, 0.4, 'rots', 0.15);
deksel(0.85, 0, 'rots', 0.85, true);

// Schacht: vijf banden, wit/rood om en om, taps van r=0.62 naar r=0.42
const banden = ['wit', 'rood', 'wit', 'rood', 'wit'];
const y0 = 0.4, y1 = 3.3, r0 = 0.62, r1 = 0.42;
for (let i = 0; i < banden.length; i++) {
  const ta = i / banden.length, tb = (i + 1) / banden.length;
  mantel(
    r0 + (r1 - r0) * ta, y0 + (y1 - y0) * ta,
    r0 + (r1 - r0) * tb, y0 + (y1 - y0) * tb,
    banden[i], 0.55, 0.2,
  );
}

// Omloop (galerij): duidelijk breder dan de schachttop
deksel(0.62, 3.3, 'donker', 0.6, true);
mantel(0.62, 3.3, 0.62, 3.46, 'donker', 0.5, 0.3);
deksel(0.62, 3.46, 'donker', 0.25);

// Lantaarn: warm geel licht
mantel(0.4, 3.46, 0.4, 4.01, 'geel', 0.55, 0.1);

// Dak: rand plus kegel, zonder overstek (zelfde straal als de lantaarnwand)
mantel(0.4, 4.01, 0.4, 4.11, 'donker', 0.5, 0.3);
kegel(0.4, 4.11, 4.53, 'donker');

// Deur op de sokkel tegen het voorfacet van de schacht
blok(0, 0.34, 0.4, 0.95, 0.42, 0.63, 'hout');
// Raampje hoger in de toren
blok(0, 0.16, 2.5, 2.72, 0.3, 0.46, 'donker', 0.3);

// ---- GLB schrijven ---------------------------------------------------------
function schrijfGlb(pad) {
  const posF = new Float32Array(pos), nrmF = new Float32Array(nrm), texF = new Float32Array(tex);
  const idxU = new Uint16Array(idx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posF.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], posF[i + k]);
      max[k] = Math.max(max[k], posF[i + k]);
    }
  }

  const pad4 = (n) => (4 - (n % 4)) % 4;
  const delen = [posF, nrmF, texF, idxU].map((a) => Buffer.from(a.buffer));
  const offsets = [];
  let cursor = 0;
  for (const d of delen) {
    offsets.push(cursor);
    cursor += d.length + pad4(d.length);
  }
  const bin = Buffer.alloc(cursor);
  delen.forEach((d, i) => d.copy(bin, offsets[i]));

  const aantal = posF.length / 3;
  const gltf = {
    asset: { version: '2.0', generator: 'tools/asset-preview/build-lighthouse.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'lighthouse' }],
    meshes: [{ name: 'lighthouse', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'colormap', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 }, doubleSided: true }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: aantal, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: aantal, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: aantal, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: idxU.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: posF.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: nrmF.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: texF.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[3], byteLength: idxU.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc(pad4(json.length), 0x20)]);
  const kop = Buffer.alloc(12), jsonKop = Buffer.alloc(8), binKop = Buffer.alloc(8);
  kop.writeUInt32LE(0x46546c67, 0); kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  jsonKop.writeUInt32LE(json.length, 0); jsonKop.writeUInt32LE(0x4e4f534a, 4);
  binKop.writeUInt32LE(bin.length, 0); binKop.writeUInt32LE(0x004e4942, 4);
  writeFileSync(pad, Buffer.concat([kop, jsonKop, json, binKop, bin]));
  console.log(`geschreven: ${pad} (${idx.length / 3} driehoeken, hoogte ${max[1].toFixed(2)})`);
}

schrijfGlb(UIT);
