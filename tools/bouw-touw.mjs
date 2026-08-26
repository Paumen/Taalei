// Vervangt een recht touw in een model door een gedraaid koord met een eigen
// knoop, zodat het kan draaien.
//
// Waarom gedraaid: een lus kan een touw niet blijven optrekken — het zou elke
// ronde terugspringen. Een schroeflijn wél. Een helix die om zijn eigen as
// draait is hetzelfde als diezelfde helix die langs die as opschuift, dus een
// gedraaid koord dat ronddraait leest als touw dat omhoog loopt, en na een hele
// slag staat de meetkunde weer precies zoals ze stond.
//
// Het touw is een rechte staaf met een geschilderde streep die als schroeflijn
// omhoog loopt — een barberpaal, geen gevlochten koord.
//
// Waarom zo: een barberpaal leest als opschuiven omdat zijn omtrek niet
// verandert. Er is dan niets aan te zien dát hij draait, dus houdt het oog de
// enige beweging die er te zien is: de streep die klimt. Zodra de vorm zelf
// dikker en dunner wordt — zoals bij een gevlochten koord dat inknijpt — ziet
// het oog draaiing, en die lezing wint het van het opschuiven. Vandaar een
// gladde staaf met constante straal: een regelmatige veelhoek valt na één
// zijde-stap precies op zichzelf terug, met dezelfde normalen en dus dezelfde
// belichting, zodat alleen de streep beweegt.
//
// Het oude touw wordt herkend als samenhangend onderdeel binnen --doos, met de
// hoekpunten eerst gelast op positie: de grens loopt dus nooit dwars door een
// driehoek. Het nieuwe koord neemt de plek, de dikte en de baan van het oude over.
//
// --dikte rekent vanaf de dikte die er nu staat, dus een tweede pas met dezelfde
// factor maakt hem opnieuw dikker; geef bij herbouwen de totale factor mee.
//
//   node tools/bouw-touw.mjs <glb> --knoop well-a --naam well-a_touw \
//     --doos 0.03:0.09,-0.01:0.95,-0.07:-0.02 --zijden 6 --segmenten 18 \
//     --streep 3 --schaduw 0.14,0.52 [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const RIJEN = 4, KOLOMMEN = 16;

const a = process.argv.slice(2);
let pad = null, knoopnaam = null, naam = null, doos = null;
let segmenten = 18, zijden = 6, streep = 3, dikte = 1, schaduw = [0.14, 0.52], proef = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--knoop') knoopnaam = a[++i];
  else if (a[i] === '--naam') naam = a[++i];
  else if (a[i] === '--doos') doos = a[++i].split(',').map((s) => s.split(':').map(Number));
  else if (a[i] === '--segmenten') segmenten = Number(a[++i]);
  else if (a[i] === '--zijden') zijden = Number(a[++i]);
  else if (a[i] === '--streep') streep = Number(a[++i]);
  else if (a[i] === '--dikte') dikte = Number(a[++i]);
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
// Staat het koord er al, dan bouwen we dát opnieuw op en laten we de knoop en
// zijn animatiekanaal staan. Maat en baan komen dan uit het koord zelf, zodat
// een tweede pas met andere instellingen op dezelfde plek en dikte uitkomt.
const bestaandeKnoop = knopen.findIndex((k) => k.name === naam && k.mesh !== undefined);
let groep = null, midX, midZ, half, onder, boven, uMidden, rij;

if (bestaandeKnoop >= 0) {
  const oud = glb.json.meshes[knopen[bestaandeKnoop].mesh].primitives[0];
  const oudPos = readAccessor(glb, oud.attributes.POSITION);
  const oudUv = readAccessor(glb, oud.attributes.TEXCOORD_0);
  [midX, onder, midZ] = knopen[bestaandeKnoop].translation ?? [0, 0, 0];
  half = 0; boven = onder;
  for (let i = 0; i < oudPos.count; i++) {
    half = Math.max(half, Math.hypot(oudPos.data[i * 3], oudPos.data[i * 3 + 2]));
    boven = Math.max(boven, onder + oudPos.data[i * 3 + 1]);
  }
  uMidden = oudUv.data[0];
  rij = Math.min(Math.floor(oudUv.data[1] * RIJEN), RIJEN - 1);
} else {
  const mee = [...grens].filter(([, e]) => e.lo.every((l, c) => l >= doos[c][0] && e.hi[c] <= doos[c][1]));
  if (mee.length !== 1) throw new Error(`${mee.length} onderdelen binnen de doos; verwacht er precies één`);
  const touw = mee[0][1];
  groep = mee[0][0];
  midX = (touw.lo[0] + touw.hi[0]) / 2; midZ = (touw.lo[2] + touw.hi[2]) / 2;
  half = Math.max(touw.hi[0] - touw.lo[0], touw.hi[2] - touw.lo[2]) / 2;
  onder = touw.lo[1]; boven = touw.hi[1];
  const eersteVtx = [...touw.vtx][0];
  uMidden = uv.data[eersteVtx * 2];
  rij = Math.min(Math.floor(uv.data[eersteVtx * 2 + 1] * RIJEN), RIJEN - 1);
}

if (proef) {
  console.log(`${pad}: touw op (${midX.toFixed(4)}, ${midZ.toFixed(4)}), dikte ${(half * 2).toFixed(4)}, ` +
    `y ${onder.toFixed(4)}..${boven.toFixed(4)}, baan-u ${uMidden.toFixed(4)} rij ${rij}`);
  process.exit(0);
}

// De staaf: een regelmatige veelhoek, constante straal, geen draaiing in de vorm.
// De streep zit alleen in de kleur: vlak (z, r) pakt zijn verlooppositie uit
// (z + r) % streep, dus schuift het patroon per segment één zijde op en loopt het
// als schroeflijn omhoog. Eén zijde-stap draaien verschuift dat patroon precies
// één segment — dát is de beweging die je ziet.
const P = [], N = [], T = [], I = [];
const voegToe = (p, n, v) => {
  const k = P.length / 3;
  P.push(...p); N.push(...n); T.push(uMidden, (rij + v) / RIJEN);
  return k;
};
const straal = half * dikte;
const hoekpunt = (z, y) => {
  const h = (z * 2 * Math.PI) / zijden;
  return [straal * Math.cos(h), y - onder, straal * Math.sin(h)];
};
const stap = (boven - onder) / segmenten;
for (let r2 = 0; r2 < segmenten; r2++) {
  const y0 = onder + r2 * stap, y1 = onder + (r2 + 1) * stap;
  for (let z = 0; z < zijden; z++) {
    const a0 = hoekpunt(z, y0), b0 = hoekpunt(z + 1, y0);
    const a1 = hoekpunt(z, y1), b1 = hoekpunt(z + 1, y1);
    const h = ((z + r2) % zijden + zijden) % zijden;
    const v = schaduw[((h % streep) * schaduw.length / streep) | 0] ?? schaduw[0];
    const nx = Math.cos(((z + 0.5) * 2 * Math.PI) / zijden);
    const nz = Math.sin(((z + 0.5) * 2 * Math.PI) / zijden);
    const nn = [nx, 0, nz];
    const iA0 = voegToe(a0, nn, v), iB0 = voegToe(b0, nn, v);
    const iA1 = voegToe(a1, nn, v), iB1 = voegToe(b1, nn, v);
    I.push(iA0, iB0, iB1, iA0, iB1, iA1);
  }
}
// deksels; de onderste is in de put toch niet te zien, de bovenste zit tegen de trommel
for (const [y, omhoog] of [[onder, false], [boven, true]]) {
  const n = [0, omhoog ? 1 : -1, 0];
  const ring = [];
  for (let z = 0; z < zijden; z++) ring.push(voegToe(hoekpunt(z, y), n, schaduw.at(-1)));
  for (let z = 1; z + 1 < zijden; z++) {
    if (omhoog) I.push(ring[0], ring[z], ring[z + 1]);
    else I.push(ring[0], ring[z + 1], ring[z]);
  }
}

// Alleen bij een eerste pas moet het rechte touw nog uit de mesh gehaald worden.
const rest = [];
if (groep !== null) {
  for (let t = 0; t + 2 < idx.count; t += 3) if (vind(idx.data[t]) !== groep) rest.push(t);
}

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

if (groep !== null) mesh.primitives = [herbouw(rest)];
const koordPrim = {
  attributes: { POSITION: accessorVan(P, 3, 'VEC3'), NORMAL: accessorVan(N, 3, 'VEC3'), TEXCOORD_0: accessorVan(T, 2, 'VEC2') },
  indices: indexAccessor(I), material: prim.material,
};
if (bestaandeKnoop >= 0) {
  glb.json.meshes[knopen[bestaandeKnoop].mesh].primitives = [koordPrim];
} else {
  const koordMesh = glb.json.meshes.push({ name: naam, primitives: [koordPrim] }) - 1;
  const koordKnoop = knopen.push({ name: naam, mesh: koordMesh, translation: [midX, onder, midZ] }) - 1;
  knopen[doel].children = [...(knopen[doel].children ?? []), koordKnoop];
}

const bin = Buffer.concat(stukken);
glb.json.buffers[0].byteLength = bin.length;
writeGlb(pad, glb.json, bin, writeFileSync);
console.log(`${pad}: touw vervangen door ${naam} — ${zijden} zijden, ${segmenten} segmenten, streep ${streep}, dikte ×${dikte}, ${I.length / 3} driehoeken`);
