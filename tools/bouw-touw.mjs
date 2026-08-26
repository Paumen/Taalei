// Vervangt een recht touw in een model door een gedraaid koord met een eigen
// knoop, zodat het kan draaien.
//
// Waarom gedraaid: een lus kan een touw niet blijven optrekken — het zou elke
// ronde terugspringen. Een schroeflijn wél. Een helix die om zijn eigen as
// draait is hetzelfde als diezelfde helix die langs die as opschuift, dus een
// gedraaid koord dat ronddraait leest als touw dat omhoog loopt, en na een hele
// slag staat de meetkunde weer precies zoals ze stond.
//
// Het touw is gevlochten uit losse strengen, niet één gedraaide staaf. Dat is
// nodig, niet alleen mooier: een gedraaide vierkante staaf heeft op elke hoogte
// dezelfde vierkantssymmetrie, dus een kwartslag legt hem exact op zichzelf terug
// en je ziet niets bewegen. Drie strengen breken die symmetrie — pas na een derde
// slag valt de vorm weer samen, en daartussen leest de draaiing als opschuiven.
//
// Het oude touw wordt herkend als samenhangend onderdeel binnen --doos, met de
// hoekpunten eerst gelast op positie: de grens loopt dus nooit dwars door een
// driehoek. Het nieuwe koord neemt de plek, de dikte en de baan van het oude over.
//
//   node tools/bouw-touw.mjs <glb> --knoop well-a --naam well-a_touw \
//     --doos 0.03:0.09,-0.01:0.95,-0.07:-0.02 --strengen 3 --segmenten 14 \
//     --slagen 3 --schaduw 0.34 [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const RIJEN = 4, KOLOMMEN = 16;

const a = process.argv.slice(2);
let pad = null, knoopnaam = null, naam = null, doos = null;
let segmenten = 14, slagen = 3, strengen = 3, schaduw = [0.34], proef = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--knoop') knoopnaam = a[++i];
  else if (a[i] === '--naam') naam = a[++i];
  else if (a[i] === '--doos') doos = a[++i].split(',').map((s) => s.split(':').map(Number));
  else if (a[i] === '--segmenten') segmenten = Number(a[++i]);
  else if (a[i] === '--strengen') strengen = Number(a[++i]);
  else if (a[i] === '--slagen') slagen = Number(a[++i]);
  else if (a[i] === '--schaduw') schaduw = a[++i].split(',').map(Number);
  else if (a[i] === '--proef') proef = true;
  else pad = a[i];
}
if (!pad || !knoopnaam || !naam || !doos) {
  throw new Error('gebruik: <glb> --knoop <naam> --naam <nieuwe knoop> --doos x:x,y:y,z:z');
}

const glb = readGlb(pad);
const knopen = glb.json.nodes ?? [];
const doel = knopen.findIndex((k) => k.name === knoopnaam && k.mesh !== undefined);
if (doel < 0) throw new Error(`geen knoop ${knoopnaam} met mesh in ${pad}`);
const mesh = glb.json.meshes[knopen[doel].mesh];
const prim = mesh.primitives[0];
const attrs = {};
for (const [k, i] of Object.entries(prim.attributes)) attrs[k] = readAccessor(glb, i);
const idx = readAccessor(glb, prim.indices);
const pos = attrs.POSITION, uv = attrs.TEXCOORD_0;

// Samenhangende onderdelen, gelast op positie.
const sleutel = new Map(), ouder = new Int32Array(pos.count);
for (let i = 0; i < pos.count; i++) ouder[i] = i;
const vind = (x) => { while (ouder[x] !== x) { ouder[x] = ouder[ouder[x]]; x = ouder[x]; } return x; };
const unie = (x, y) => { x = vind(x); y = vind(y); if (x !== y) ouder[y] = x; };
for (let i = 0; i < pos.count; i++) {
  const k = [0, 1, 2].map((c) => pos.data[i * 3 + c].toFixed(4)).join(',');
  if (sleutel.has(k)) unie(sleutel.get(k), i); else sleutel.set(k, i);
}
for (let t = 0; t + 2 < idx.count; t += 3) { unie(idx.data[t], idx.data[t + 1]); unie(idx.data[t + 1], idx.data[t + 2]); }

const grens = new Map();
for (let t = 0; t + 2 < idx.count; t += 3) {
  const g = vind(idx.data[t]);
  const e = grens.get(g) ?? { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], vtx: new Set() };
  for (let k = 0; k < 3; k++) {
    const i = idx.data[t + k]; e.vtx.add(i);
    for (let c = 0; c < 3; c++) {
      const w = pos.data[i * 3 + c];
      if (w < e.lo[c]) e.lo[c] = w;
      if (w > e.hi[c]) e.hi[c] = w;
    }
  }
  grens.set(g, e);
}
const mee = [...grens].filter(([, e]) => e.lo.every((l, c) => l >= doos[c][0] && e.hi[c] <= doos[c][1]));
if (mee.length !== 1) throw new Error(`${mee.length} onderdelen binnen de doos; verwacht er precies één`);
const [groep, touw] = mee[0];

// Maat en baan van het oude touw overnemen.
const midX = (touw.lo[0] + touw.hi[0]) / 2, midZ = (touw.lo[2] + touw.hi[2]) / 2;
const half = Math.max(touw.hi[0] - touw.lo[0], touw.hi[2] - touw.lo[2]) / 2;
const onder = touw.lo[1], boven = touw.hi[1];
const eersteVtx = [...touw.vtx][0];
const uMidden = uv.data[eersteVtx * 2];
const rij = Math.min(Math.floor(uv.data[eersteVtx * 2 + 1] * RIJEN), RIJEN - 1);

if (proef) {
  console.log(`${pad}: touw op (${midX.toFixed(4)}, ${midZ.toFixed(4)}), dikte ${(half * 2).toFixed(4)}, ` +
    `y ${onder.toFixed(4)}..${boven.toFixed(4)}, baan-u ${uMidden.toFixed(4)} rij ${rij}`);
  process.exit(0);
}

// Het gevlochten koord: elke streng loopt als schroeflijn om de as.
const P = [], N = [], T = [], I = [];
const straal = half * 0.55;          // hart van een streng
const dik = half * 0.45;             // halve dikte van een streng; samen weer de oude dikte
const voegToe = (p, n, v) => {
  const k = P.length / 3;
  P.push(...p); N.push(...n); T.push(uMidden, (rij + v) / RIJEN);
  return k;
};
// Vier hoekpunten rond het hart van streng k op hoogte y.
const ring = (k, y) => {
  const hoek = (k * 2 * Math.PI) / strengen + ((y - onder) / (boven - onder)) * slagen * 2 * Math.PI;
  const cx = straal * Math.cos(hoek), cz = straal * Math.sin(hoek);
  // de streng ligt plat tegen de as aan: eigen assen radiaal en tangentiaal
  const rx = Math.cos(hoek), rz = Math.sin(hoek);
  const tx = -Math.sin(hoek), tz = Math.cos(hoek);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => [
    cx + dik * (u * rx + w * tx), y - onder, cz + dik * (u * rz + w * tz),
  ]);
};
const stap = (boven - onder) / segmenten;
const v = schaduw[0];
for (let k = 0; k < strengen; k++) {
  for (let s2 = 0; s2 < segmenten; s2++) {
    const onderRing = ring(k, onder + s2 * stap);
    const bovenRing = ring(k, onder + (s2 + 1) * stap);
    for (let z = 0; z < 4; z++) {
      const a0 = onderRing[z], b0 = onderRing[(z + 1) % 4];
      const a1 = bovenRing[z], b1 = bovenRing[(z + 1) % 4];
      const u1 = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]];
      const u2 = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
      const n = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
      const len = Math.hypot(...n) || 1;
      const nn = n.map((w) => w / len);
      const iA0 = voegToe(a0, nn, v), iB0 = voegToe(b0, nn, v);
      const iA1 = voegToe(a1, nn, v), iB1 = voegToe(b1, nn, v);
      I.push(iA0, iB0, iB1, iA0, iB1, iA1);
    }
  }
  // deksels op beide uiteinden van de streng
  for (const [y, omhoog] of [[onder, false], [boven, true]]) {
    const n = [0, omhoog ? 1 : -1, 0];
    const h = ring(k, y).map((p) => voegToe(p, n, v));
    if (omhoog) I.push(h[0], h[1], h[2], h[0], h[2], h[3]);
    else I.push(h[0], h[2], h[1], h[0], h[3], h[2]);
  }
}

// Het oude touw uit de mesh halen, de rest opnieuw opbouwen.
const rest = [];
for (let t = 0; t + 2 < idx.count; t += 3) if (vind(idx.data[t]) !== groep) rest.push(t);

const stukken = [glb.bin];
let lengte = glb.bin.length;
const nieuweView = (buf) => {
  const vul = (4 - (lengte % 4)) % 4;
  if (vul) { stukken.push(Buffer.alloc(vul, 0)); lengte += vul; }
  const v = glb.json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length }) - 1;
  stukken.push(buf); lengte += buf.length; return v;
};
const accessorVan = (getallen, breedte, type) => {
  const uitData = new Float32Array(getallen);
  const kolom = (k) => getallen.filter((_, i) => i % breedte === k);
  return glb.json.accessors.push({
    bufferView: nieuweView(Buffer.from(uitData.buffer)), componentType: 5126,
    count: getallen.length / breedte, type,
    min: Array.from({ length: breedte }, (_, k) => Math.min(...kolom(k))),
    max: Array.from({ length: breedte }, (_, k) => Math.max(...kolom(k))),
  }) - 1;
};
const indexAccessor = (lijst) => {
  const groot = lijst.length > 65535 || Math.max(...lijst) > 65535;
  const data = groot ? new Uint32Array(lijst) : new Uint16Array(lijst);
  return glb.json.accessors.push({
    bufferView: nieuweView(Buffer.from(data.buffer)),
    componentType: groot ? 5125 : 5123, count: lijst.length, type: 'SCALAR',
  }) - 1;
};

function herbouw(driehoeken) {
  const kaart = new Map(), bron = [], nieuw = [];
  for (const t of driehoeken) for (let k = 0; k < 3; k++) {
    const i = idx.data[t + k];
    let n = kaart.get(i);
    if (n === undefined) { n = bron.length; kaart.set(i, n); bron.push(i); }
    nieuw.push(n);
  }
  const attributen = {};
  for (const [naamAttr, acc] of Object.entries(attrs)) {
    const b = acc.width, uitData = [];
    for (const i of bron) for (let j = 0; j < b; j++) uitData.push(acc.data[i * b + j]);
    attributen[naamAttr] = accessorVan(uitData, b, { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' }[b]);
  }
  return { attributes: attributen, indices: indexAccessor(nieuw), material: prim.material };
}

mesh.primitives = [herbouw(rest)];
const koordPrim = {
  attributes: { POSITION: accessorVan(P, 3, 'VEC3'), NORMAL: accessorVan(N, 3, 'VEC3'), TEXCOORD_0: accessorVan(T, 2, 'VEC2') },
  indices: indexAccessor(I), material: prim.material,
};
const koordMesh = glb.json.meshes.push({ name: naam, primitives: [koordPrim] }) - 1;
const koordKnoop = knopen.push({ name: naam, mesh: koordMesh, translation: [midX, onder, midZ] }) - 1;
knopen[doel].children = [...(knopen[doel].children ?? []), koordKnoop];

const bin = Buffer.concat(stukken);
glb.json.buffers[0].byteLength = bin.length;
writeGlb(pad, glb.json, bin, writeFileSync);
console.log(`${pad}: touw vervangen door ${naam} — ${strengen} strengen, ${segmenten} segmenten, ${slagen} slagen, ${I.length / 3} driehoeken`);
