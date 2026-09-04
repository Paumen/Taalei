// Haalt een opbouw van het dek weg en legt het dek er weer dicht overheen.
//
// Bedoeld voor een luik: een verhoogde rand rond een gat in het dek met daaronder
// een donkere put. Zulke geometrie zit los in het dek — het dek zelf heeft er een
// gat op maat omheen — dus weghalen alleen laat een gat achter. Deze tool verwijdert
// eerst elke driehoek die volledig in --vak valt en dicht daarna het gat dat in het
// dekvlak overblijft.
//
// Het gat wordt niet uit het vak afgeleid maar uit de mazen zelf: van de driehoeken
// die in hetzelfde horizontale vlak liggen als de rand van het vak zijn de randkanten
// (kanten die maar in één driehoek voorkomen) de contour, en de contour die het vak
// omsluit is het gat. De hoekpunten van die contour bestaan al en dragen de kleur en
// normaal van het dek, dus de vulling erft die zonder dat er iets gekozen hoeft te
// worden.
//
//   node tools/verwijder-luik.mjs kits/workfiles/pirate-kit/ship-pirate-large.glb \
//     --vak -0.30,0.64,-1.105,0.30,0.92,-0.505 --mesh 0
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { herbouwGlb } from './glb-herbouw.mjs';

const EPS = 1e-5;
const arg = process.argv.slice(2);
let pad = null, vak = null, meshIndex = 0;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--vak') vak = arg[++i].split(',').map(Number);
  else if (arg[i] === '--mesh') meshIndex = Number(arg[++i]);
  else pad = arg[i];
}
if (!pad || !vak || vak.length !== 6) { console.error('zie kop'); process.exit(1); }

const glb = readGlb(pad);
const prim = glb.json.meshes[meshIndex].primitives[0];
const pos = readAccessor(glb, prim.attributes.POSITION).data;
const nor = readAccessor(glb, prim.attributes.NORMAL).data;
const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
const idx = readAccessor(glb, prim.indices).data;

const inVak = (v) => [0, 1, 2].every((j) => pos[v * 3 + j] >= vak[j] - EPS && pos[v * 3 + j] <= vak[j + 3] + EPS);

const houd = [];
let weg = 0;
for (let t = 0; t < idx.length / 3; t++) {
  const d = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
  if (d.every(inVak)) { weg++; continue; }
  houd.push(d);
}
if (!weg) { console.error('geen driehoek in het vak'); process.exit(1); }

const midden = [0, 2].map((j) => (vak[j] + vak[j + 3]) / 2);
const omsluit = (lus) => {
  let binnen = false;
  for (let i = 0, j = lus.length - 1; i < lus.length; j = i++) {
    const [xi, zi] = [pos[lus[i] * 3], pos[lus[i] * 3 + 2]];
    const [xj, zj] = [pos[lus[j] * 3], pos[lus[j] * 3 + 2]];
    if ((zi > midden[1]) !== (zj > midden[1]) && midden[0] < ((xj - xi) * (midden[1] - zi)) / (zj - zi) + xi) binnen = !binnen;
  }
  return binnen;
};

// Op welke hoogte het dek ligt zegt het vak niet: de rand van een luik steekt erboven
// uit en de put eronder. Het dek is het horizontale vlak binnen het vak waarin na het
// weghalen een contour om het vak heen ligt.
function zoekGat(dekY) {
  const opDek = (d) => d.every((v) => Math.abs(pos[v * 3 + 1] - dekY) < EPS && nor[v * 3 + 1] > 0.99);
  const kanten = new Map();
  for (const d of houd) {
    if (!opDek(d)) continue;
    for (let k = 0; k < 3; k++) {
      const a = d[k], b = d[(k + 1) % 3];
      const sleutel = a < b ? `${a}|${b}` : `${b}|${a}`;
      const rij = kanten.get(sleutel);
      if (rij) rij.push([a, b]); else kanten.set(sleutel, [[a, b]]);
    }
  }
  // Een randkant hoort bij één driehoek; hij loopt zo dat het vlak links ligt.
  const volgend = new Map();
  for (const rij of kanten.values()) if (rij.length === 1) volgend.set(rij[0][0], rij[0][1]);

  const gezien = new Set();
  for (const start of volgend.keys()) {
    if (gezien.has(start)) continue;
    const lus = [];
    let v = start;
    while (v !== undefined && !gezien.has(v)) { gezien.add(v); lus.push(v); v = volgend.get(v); }
    if (v === start && lus.length >= 3 && omsluit(lus)) return lus;
  }
  return null;
}

const hoogtes = new Set();
for (const d of houd) for (const v of d) {
  const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  if (nor[v * 3 + 1] > 0.99 && y >= vak[1] - EPS && y <= vak[4] + EPS
    && x >= vak[0] - EPS && x <= vak[3] + EPS && z >= vak[2] - EPS && z <= vak[5] + EPS) hoogtes.add(y);
}
let gat = null;
for (const y of [...hoogtes].sort((a, b) => b - a)) { gat = zoekGat(y); if (gat) break; }
if (!gat) { console.error('geen contour om het vak gevonden'); process.exit(1); }

// Waaier vanaf het eerste hoekpunt; de winding volgt die van het dek (normaal +Y).
const oppervlak = gat.reduce((s, v, i) => {
  const w = gat[(i + 1) % gat.length];
  return s + (pos[v * 3 + 2] * pos[w * 3] - pos[w * 3 + 2] * pos[v * 3]);
}, 0);
const contour = oppervlak > 0 ? gat : [...gat].reverse();
for (let k = 1; k < contour.length - 1; k++) houd.push([contour[0], contour[k], contour[k + 1]]);

// Opnieuw opbouwen: hoekpunten die alleen bij het luik hoorden vallen weg.
const hernummer = new Map();
const nieuwePos = [], nieuweNor = [], nieuweUv = [];
const nieuweIdx = [];
for (const d of houd) for (const v of d) {
  let n = hernummer.get(v);
  if (n === undefined) {
    n = hernummer.size;
    hernummer.set(v, n);
    nieuwePos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    nieuweNor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
    nieuweUv.push(uv[v * 2], uv[v * 2 + 1]);
  }
  nieuweIdx.push(n);
}

const vervangen = new Map([
  [prim.attributes.POSITION, { waarden: nieuwePos, breedte: 3, Type: Float32Array }],
  [prim.attributes.NORMAL, { waarden: nieuweNor, breedte: 3, Type: Float32Array }],
  [prim.attributes.TEXCOORD_0, { waarden: nieuweUv, breedte: 2, Type: Float32Array }],
  [prim.indices, { waarden: nieuweIdx, breedte: 1, Type: Uint16Array }],
]);

// Wat in het luik stond staat straks onder een dicht dek: onzichtbaar, maar het telt
// wel mee in het bestand. Elk kindknooppunt dat helemaal in het vak past gaat mee weg.
const luikNode = glb.json.nodes.findIndex((n) => n.mesh === meshIndex);
const matrixVan = (n) => {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1];
};
const maalMatrix = (a, b) => {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let ro = 0; ro < 4; ro++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + ro] * b[c * 4 + k];
    r[c * 4 + ro] = s;
  }
  return r;
};
const maalPunt = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const wegNodes = new Set();
const doorloop = (i, ouder) => {
  const node = glb.json.nodes[i];
  const m = maalMatrix(ouder, matrixVan(node));
  if (node.mesh !== undefined && node.mesh !== meshIndex) {
    const kind = readAccessor(glb, glb.json.meshes[node.mesh].primitives[0].attributes.POSITION).data;
    let binnen = true;
    for (let v = 0; v < kind.length / 3 && binnen; v++) {
      const w = maalPunt(m, kind[v * 3], kind[v * 3 + 1], kind[v * 3 + 2]);
      binnen = w.every((c, j) => c >= vak[j] - EPS && c <= vak[j + 3] + EPS);
    }
    if (binnen) { wegNodes.add(i); return; }
  }
  for (const c of node.children ?? []) doorloop(c, m);
};
if (luikNode >= 0) for (const c of glb.json.nodes[luikNode].children ?? []) {
  doorloop(c, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

const bin = herbouwGlb(glb, { vervangen, wegNodes });
writeGlb(pad, glb.json, bin, writeFileSync);
const erbij = wegNodes.size ? `, ${wegNodes.size} knooppunt(en) uit het luik weg` : '';
console.log(`${weg} driehoeken weg, gat van ${contour.length} hoekpunten gedicht met ${contour.length - 2} driehoeken${erbij}`);
