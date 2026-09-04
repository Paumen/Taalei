// Verplaatst UV's naar één colormap-baan, maar naar een gekozen déél van het
// verloop in plaats van naar de hele baan. De ingebakken schaduw blijft: de
// lichtste geraakte vertex komt boven in het bereik, de donkerste onderin, de
// rest naar verhouding daartussen.
//
//   node tools/herkleur-baandeel.mjs --naar 5,0 --deel 0.55-1.0 --van 8,0 --van 13,0 <glb...>
//
// Anders dan herkleur-baan.mjs, dat de positie in het verloop één op één
// overneemt: hier worden meerdere bronbanen samen op één schaal gelegd, zodat
// een model dat zijn vlees over twee banen verdeeld had (romp licht, snijvlak
// donker) die volgorde houdt binnen de nieuwe baan.
//
// De schaal is lichtheid uit de colormap zelf, niet de v-positie: banen lopen
// niet allemaal dezelfde kant op, en lichtheid is wat je ziet.
//
// In een samenstelling zit alles in één mesh en deelt een baan meerdere
// voorwerpen: in table-long-decorated-a ligt op 13,0 zowel het lapje vlees als
// de kurk van de fles. --stuk beperkt het werk dan tot losse samenhangende
// delen, aangewezen op het midden van hun omhullende doos:
//
//   node tools/herkleur-baandeel.mjs --lijst kits/workfiles/dungeon/table-long-decorated-a.glb
//   node tools/herkleur-baandeel.mjs --van 13,0 --naar 5,0 --deel 0.55-1.0 \
//     --stuk 0.54,1.12,-1.23 --stuk 0.44,1.10,1.07 <glb>
//
// Een stuk is een echt losstaand deel van de mesh, geen drempel op afstand of
// normaal: welke driehoek licht of donker is blijft uit de banen komen.
import { writeFileSync } from 'node:fs';
import { readGlb, readAccessor, writeGlb } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const COLORMAP = new URL('../kits/colormap.png', import.meta.url).pathname;

const argumenten = process.argv.slice(2);
const van = [];
const stukken = [];
let naar = null;
let deel = '0-1';
let lijst = false;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--van') van.push(argumenten[++i]);
  else if (argumenten[i] === '--naar') naar = argumenten[++i];
  else if (argumenten[i] === '--deel') deel = argumenten[++i];
  else if (argumenten[i] === '--stuk') stukken.push(argumenten[++i]);
  else if (argumenten[i] === '--lijst') lijst = true;
  else bestanden.push(argumenten[i]);
}
if (bestanden.length === 0 || (!lijst && (van.length === 0 || !naar))) {
  console.error('gebruik: node tools/herkleur-baandeel.mjs --van k,r [--van k,r] --naar k,r [--deel 0.55-1.0] [--stuk x,y,z] <glb...>');
  console.error('         node tools/herkleur-baandeel.mjs --lijst <glb...>');
  process.exit(1);
}

const [boven, onder] = deel.split('-').map(Number);
if (!lijst && !(boven >= 0 && onder <= 1 && boven < onder)) {
  throw new Error(`--deel ${deel} valt buiten 0-1 of loopt achteruit`);
}

const atlas = readPng(COLORMAP);
const celBreed = atlas.width / KOLOMMEN;
const celHoog = atlas.height / RIJEN;

function lichtheid(kolom, rij, vDeel) {
  const x = Math.floor((kolom + 0.5) * celBreed);
  const y = Math.min(Math.floor((rij + vDeel) * celHoog), atlas.height - 1);
  const i4 = (y * atlas.width + x) * 4;
  return 0.2126 * atlas.pixels[i4] + 0.7152 * atlas.pixels[i4 + 1] + 0.0722 * atlas.pixels[i4 + 2];
}

const baanVan = (uv) => {
  const x = Math.min(Math.max(uv[0] * atlas.width, 0), atlas.width - 1e-6);
  const y = Math.min(Math.max(uv[1] * atlas.height, 0), atlas.height - 1e-6);
  const kolom = Math.floor(x / celBreed);
  const rij = Math.floor(y / celHoog);
  return { cel: `${kolom},${rij}`, uDeel: x / celBreed - kolom, licht: lichtheid(kolom, rij, y / celHoog - rij) };
};

const rond = (v) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));
const stukSleutel = (min, max) => min.map((v, i) => rond((v + max[i]) / 2)).join(',');

// Samenhangende delen: vertices gelast op hun positie, zodat een mesh die per
// vlak eigen vertices heeft toch als één stuk telt.
function verdeelInStukken(glb, prim) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const idx = readAccessor(glb, prim.indices).data;
  const aantal = pos.length / 3;

  const zelfde = new Map();
  const las = new Int32Array(aantal);
  for (let i = 0; i < aantal; i++) {
    const sleutel = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    if (!zelfde.has(sleutel)) zelfde.set(sleutel, i);
    las[i] = zelfde.get(sleutel);
  }

  const ouder = new Int32Array(aantal);
  for (let i = 0; i < aantal; i++) ouder[i] = i;
  const wortel = (x) => {
    while (ouder[x] !== x) x = ouder[x] = ouder[ouder[x]];
    return x;
  };
  const verbind = (a, b) => {
    const wa = wortel(a);
    const wb = wortel(b);
    if (wa !== wb) ouder[wb] = wa;
  };
  for (let t = 0; t < idx.length; t += 3) {
    verbind(las[idx[t]], las[idx[t + 1]]);
    verbind(las[idx[t]], las[idx[t + 2]]);
  }

  // Doos per stuk, en per vertex het stuk waar hij in zit.
  const doos = new Map();
  const vanVertex = new Int32Array(aantal).fill(-1);
  for (let t = 0; t < idx.length; t += 3) {
    const stuk = wortel(las[idx[t]]);
    let d = doos.get(stuk);
    if (!d) doos.set(stuk, (d = { tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    d.tris++;
    for (const v of [idx[t], idx[t + 1], idx[t + 2]]) {
      vanVertex[v] = stuk;
      for (let a = 0; a < 3; a++) {
        d.min[a] = Math.min(d.min[a], pos[v * 3 + a]);
        d.max[a] = Math.max(d.max[a], pos[v * 3 + a]);
      }
    }
  }

  const sleutelVan = new Map();
  for (const [stuk, d] of doos) sleutelVan.set(stuk, stukSleutel(d.min, d.max));
  return { vanVertex, sleutelVan, doos };
}

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const { json, bin } = glb;

  // --stuk en --lijst gaan uit van één mesh met één primitive; dat is wat de
  // samenstellingen in deze kits zijn. Losse modellen hebben ze niet nodig.
  let stukInfo = null;
  if (lijst || stukken.length > 0) {
    const prims = (json.meshes ?? []).flatMap((m) => m.primitives ?? []);
    if (prims.length !== 1) throw new Error(`${pad}: --stuk/--lijst verwacht één primitive, niet ${prims.length}`);
    stukInfo = verdeelInStukken(glb, prims[0]);
  }

  if (lijst) {
    console.log(`== ${pad}: ${stukInfo.doos.size} stukken`);
    const uv = readAccessor(glb, json.meshes[0].primitives[0].attributes.TEXCOORD_0).data;
    const banenPer = new Map();
    for (let v = 0; v < uv.length / 2; v++) {
      const stuk = stukInfo.vanVertex[v];
      if (stuk < 0) continue;
      const per = banenPer.get(stuk) ?? new Map();
      const { cel } = baanVan(uv.subarray(v * 2, v * 2 + 2));
      per.set(cel, (per.get(cel) ?? 0) + 1);
      banenPer.set(stuk, per);
    }
    for (const [stuk, d] of [...stukInfo.doos].sort((a, b) => b[1].tris - a[1].tris)) {
      const maat = d.max.map((v, i) => (v - d.min[i]).toFixed(2)).join('×');
      const banen = [...(banenPer.get(stuk) ?? [])].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(' ');
      console.log(`   --stuk ${stukInfo.sleutelVan.get(stuk).padEnd(18)} ${String(d.tris).padStart(5)} tri  ${maat}  ${banen}`);
    }
    continue;
  }

  const gevraagd = new Set(stukken);
  const gezien = new Set();
  const vanCellen = new Set(van);
  const [naarK, naarR] = naar.split(',').map(Number);

  const geraakt = [];
  const gedaan = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const index = prim.attributes?.TEXCOORD_0;
      if (index === undefined || gedaan.has(index)) continue;
      gedaan.add(index);

      const accessor = json.accessors[index];
      if (accessor.componentType !== 5126) throw new Error(`${pad}: TEXCOORD_0 is geen float`);
      const bufferView = json.bufferViews[accessor.bufferView];
      const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stap = bufferView.byteStride ?? 8;

      for (let i = 0; i < accessor.count; i++) {
        if (stukInfo) {
          const stuk = stukInfo.vanVertex[i];
          const sleutel = stuk < 0 ? null : stukInfo.sleutelVan.get(stuk);
          if (!sleutel || !gevraagd.has(sleutel)) continue;
          gezien.add(sleutel);
        }
        const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const { cel, uDeel, licht } = baanVan(uv);
        if (!vanCellen.has(cel)) continue;
        geraakt.push({ uv, uDeel, licht });
      }
    }
  }

  const kwijt = [...gevraagd].filter((s) => !gezien.has(s));
  if (kwijt.length) throw new Error(`${pad}: geen stuk op ${kwijt.join(' / ')} — draai --lijst voor de sleutels`);

  if (geraakt.length === 0) {
    console.log(`${pad}: geen uv's in ${van.join('+')}`);
    continue;
  }

  const licht = geraakt.map((p) => p.licht);
  const hoogste = Math.max(...licht);
  const laagste = Math.min(...licht);
  // Een model zonder spreiding (alle vlees op één tint) krijgt het midden van het
  // bereik: uitrekken zou een verloop verzinnen dat het origineel niet had.
  const vlak = hoogste - laagste < 1;

  for (const p of geraakt) {
    const t = vlak ? 0.5 : (hoogste - p.licht) / (hoogste - laagste);
    const v = Math.min(Math.max(boven + t * (onder - boven), 0.001), 0.999);
    p.uv[0] = ((naarK + p.uDeel) * celBreed) / atlas.width;
    p.uv[1] = ((naarR + v) * celHoog) / atlas.height;
  }

  writeGlb(pad, json, bin, writeFileSync);
  const waar = stukken.length ? ` in ${stukken.length} stuk(ken)` : '';
  console.log(`${pad}: ${geraakt.length} uv's van ${van.join('+')} naar ${naar} deel ${deel}${waar}`);
}
