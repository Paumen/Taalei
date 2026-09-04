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

const buffers = new Map([
  [prim.attributes.POSITION, Buffer.from(new Float32Array(nieuwePos).buffer)],
  [prim.attributes.NORMAL, Buffer.from(new Float32Array(nieuweNor).buffer)],
  [prim.attributes.TEXCOORD_0, Buffer.from(new Float32Array(nieuweUv).buffer)],
  [prim.indices, Buffer.from(new Uint16Array(nieuweIdx).buffer)],
]);
const tellingen = new Map([
  [prim.attributes.POSITION, hernummer.size],
  [prim.attributes.NORMAL, hernummer.size],
  [prim.attributes.TEXCOORD_0, hernummer.size],
  [prim.indices, nieuweIdx.length],
]);

// Elke accessor heeft hier zijn eigen bufferView, dus de bin kan er in dezelfde
// volgorde opnieuw uit worden opgebouwd.
const stukken = [];
let lengte = 0;
for (let i = 0; i < glb.json.bufferViews.length; i++) {
  const view = glb.json.bufferViews[i];
  const accessorIndex = glb.json.accessors.findIndex((a) => a.bufferView === i);
  const data = buffers.get(accessorIndex)
    ?? glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const vul = (4 - (lengte % 4)) % 4;
  if (vul) { stukken.push(Buffer.alloc(vul, 0)); lengte += vul; }
  view.byteOffset = lengte;
  view.byteLength = data.length;
  stukken.push(Buffer.from(data));
  lengte += data.length;
}
const bronnen = new Map([
  [prim.attributes.POSITION, [nieuwePos, 3]],
  [prim.attributes.NORMAL, [nieuweNor, 3]],
  [prim.attributes.TEXCOORD_0, [nieuweUv, 2]],
  [prim.indices, [nieuweIdx, 1]],
]);
for (const [accessorIndex, telling] of tellingen) {
  const accessor = glb.json.accessors[accessorIndex];
  accessor.count = telling;
  if (!accessor.min) continue;
  const [bron, breedte] = bronnen.get(accessorIndex);
  const kolom = (j) => bron.filter((_, i) => i % breedte === j);
  accessor.min = Array.from({ length: breedte }, (_, j) => Math.min(...kolom(j)));
  accessor.max = Array.from({ length: breedte }, (_, j) => Math.max(...kolom(j)));
}

const bin = Buffer.concat(stukken);
glb.json.buffers[0].byteLength = bin.length;
writeGlb(pad, glb.json, bin, writeFileSync);
console.log(`${weg} driehoeken weg, gat van ${contour.length} hoekpunten gedicht met ${contour.length - 2} driehoeken`);
