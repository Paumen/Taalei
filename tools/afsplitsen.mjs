// Splitst losse onderdelen van een mesh af naar een eigen knoop, zodat ze een
// eigen animatie kunnen dragen. De selectie gaat per samenhangend onderdeel —
// hoekpunten eerst gelast op positie — en een onderdeel gaat alleen mee als het
// hélemaal binnen de doos valt. Zo loopt de grens nooit dwars door een driehoek
// of door een onderdeel heen, en is de keuze exact in plaats van een drempel.
//
// Met --oorsprong komt de nieuwe knoop op dat punt te staan en gaan de
// hoekpunten er relatief in. Het model blijft dus precies waar het stond, maar
// een draaiing op die knoop draait nu om dát punt — de as van het onderdeel —
// in plaats van om de oorsprong van het model.
//
//   node tools/afsplitsen.mjs <glb> --knoop well-a --naam well-a_slinger \
//     --doos -0.80:0.55,0.65:1.00,-0.10:0.10 --oorsprong 0,0.9285,0 [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const a = process.argv.slice(2);
let pad = null, knoopnaam = null, naam = null, doos = null, oorsprong = [0, 0, 0], proef = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--knoop') knoopnaam = a[++i];
  else if (a[i] === '--naam') naam = a[++i];
  else if (a[i] === '--doos') doos = a[++i].split(',').map((s) => s.split(':').map(Number));
  else if (a[i] === '--oorsprong') oorsprong = a[++i].split(',').map(Number);
  else if (a[i] === '--proef') proef = true;
  else pad = a[i];
}
if (!pad || !knoopnaam || !naam || !doos) {
  throw new Error('gebruik: <glb> --knoop <naam> --naam <nieuwe knoop> --doos x:x,y:y,z:z [--oorsprong x,y,z]');
}

const glb = readGlb(pad);
const knopen = glb.json.nodes ?? [];
const doel = knopen.findIndex((k) => k.name === knoopnaam && k.mesh !== undefined);
if (doel < 0) throw new Error(`geen knoop ${knoopnaam} met mesh in ${pad}`);
const mesh = glb.json.meshes[knopen[doel].mesh];
if (mesh.primitives.length !== 1) throw new Error(`${knoopnaam} heeft ${mesh.primitives.length} primitives; verwacht één`);
const prim = mesh.primitives[0];
if (prim.indices === undefined) throw new Error('primitive zonder indices');

const attrs = {};
for (const [k, i] of Object.entries(prim.attributes)) attrs[k] = readAccessor(glb, i);
const idx = readAccessor(glb, prim.indices);
const pos = attrs.POSITION;

// Samenhangende onderdelen: eerst lassen op positie, dan driehoek voor driehoek verenigen.
const sleutel = new Map();
const ouder = new Int32Array(pos.count);
for (let i = 0; i < pos.count; i++) ouder[i] = i;
const vind = (x) => { while (ouder[x] !== x) { ouder[x] = ouder[ouder[x]]; x = ouder[x]; } return x; };
const unie = (x, y) => { x = vind(x); y = vind(y); if (x !== y) ouder[y] = x; };
for (let i = 0; i < pos.count; i++) {
  const k = [0, 1, 2].map((c) => pos.data[i * 3 + c].toFixed(4)).join(',');
  if (sleutel.has(k)) unie(sleutel.get(k), i); else sleutel.set(k, i);
}
for (let t = 0; t + 2 < idx.count; t += 3) {
  unie(idx.data[t], idx.data[t + 1]);
  unie(idx.data[t + 1], idx.data[t + 2]);
}

// Grenzen per onderdeel, zodat we op hele onderdelen kunnen kiezen.
const grens = new Map();
for (let t = 0; t + 2 < idx.count; t += 3) {
  const g = vind(idx.data[t]);
  const e = grens.get(g) ?? { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  for (let k = 0; k < 3; k++) {
    const v = idx.data[t + k];
    for (let c = 0; c < 3; c++) {
      const w = pos.data[v * 3 + c];
      if (w < e.lo[c]) e.lo[c] = w;
      if (w > e.hi[c]) e.hi[c] = w;
    }
  }
  grens.set(g, e);
}
const mee = new Set();
for (const [g, e] of grens) {
  if (e.lo.every((l, c) => l >= doos[c][0] && e.hi[c] <= doos[c][1])) mee.add(g);
}
if (mee.size === 0) throw new Error('geen enkel onderdeel valt helemaal binnen de doos');

const kies = [], rest = [];
for (let t = 0; t + 2 < idx.count; t += 3) (mee.has(vind(idx.data[t])) ? kies : rest).push(t);

if (proef) {
  console.log(`${pad}: ${mee.size} onderdelen, ${kies.length} van ${kies.length + rest.length} driehoeken naar ${naam}`);
  process.exit(0);
}

const stukken = [glb.bin];
let lengte = glb.bin.length;
const nieuweView = (buf) => {
  const vul = (4 - (lengte % 4)) % 4;
  if (vul) { stukken.push(Buffer.alloc(vul, 0)); lengte += vul; }
  const v = glb.json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length }) - 1;
  stukken.push(buf); lengte += buf.length; return v;
};

// Bouwt uit een lijst driehoeken een eigen primitive met eigen hoekpunten.
function bouw(driehoeken, verschuif) {
  const kaart = new Map(), bron = [], nieuw = [];
  for (const t of driehoeken) for (let k = 0; k < 3; k++) {
    const i = idx.data[t + k];
    let n = kaart.get(i);
    if (n === undefined) { n = bron.length; kaart.set(i, n); bron.push(i); }
    nieuw.push(n);
  }
  const attributen = {};
  for (const [naamAttr, acc] of Object.entries(attrs)) {
    const b = acc.width;
    const uit = new Float32Array(bron.length * b);
    for (let n = 0; n < bron.length; n++) for (let j = 0; j < b; j++) {
      let w = acc.data[bron[n] * b + j];
      if (naamAttr === 'POSITION' && j < 3) w -= verschuif[j];
      uit[n * b + j] = w;
    }
    const min = Array.from({ length: b }, (_, j) => Math.min(...uit.filter((_, q) => q % b === j)));
    const max = Array.from({ length: b }, (_, j) => Math.max(...uit.filter((_, q) => q % b === j)));
    attributen[naamAttr] = glb.json.accessors.push({
      bufferView: nieuweView(Buffer.from(uit.buffer)),
      componentType: 5126, count: bron.length, type: { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' }[b],
      min, max,
    }) - 1;
  }
  const groot = bron.length > 65535;
  const data = groot ? new Uint32Array(nieuw) : new Uint16Array(nieuw);
  const indices = glb.json.accessors.push({
    bufferView: nieuweView(Buffer.from(data.buffer)),
    componentType: groot ? 5125 : 5123, count: nieuw.length, type: 'SCALAR',
  }) - 1;
  return { attributes: attributen, indices, material: prim.material };
}

const deelPrim = bouw(kies, oorsprong);
const restPrim = bouw(rest, [0, 0, 0]);

mesh.primitives = [restPrim];
const nieuweMesh = glb.json.meshes.push({ name: naam, primitives: [deelPrim] }) - 1;
const nieuweKnoop = knopen.push({
  name: naam,
  mesh: nieuweMesh,
  ...(oorsprong.some((v) => v !== 0) ? { translation: oorsprong } : {}),
}) - 1;
knopen[doel].children = [...(knopen[doel].children ?? []), nieuweKnoop];

const bin = Buffer.concat(stukken);
glb.json.buffers[0].byteLength = bin.length;
writeGlb(pad, glb.json, bin, writeFileSync);
console.log(`${pad}: ${mee.size} onderdelen (${kies.length} driehoeken) → knoop ${naam} op ${oorsprong.join(',')}`);
