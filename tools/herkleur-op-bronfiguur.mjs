// Herkleurt de driehoeken van één kleurcel van het BRONMODEL van een KayKit-figuur
// naar een baan van de colormap, met behoud van hun stand in het verloop.
//
// Waarom naast herkleur-op-bron.mjs: dat gereedschap leest een .obj met benoemde
// materialen of een atlas met vlakke kleuren, en koppelt bron en werkbestand op het
// zwaartepunt van de driehoek. De figuren van KayKit hebben geen van beide. Ze komen
// als .glb met een skelet, hun textuur is zelf een verloopkaart (acht bij vier cellen
// waarin elke cel van licht naar donker loopt), en het werkbestand is geschaald en
// op de grond gezet, dus de zwaartepunten staan niet meer waar de bron ze had.
//
// Wat wel klopt is de volgorde: herkleurGeanimeerd loopt de meshes en hun driehoeken
// in bronvolgorde af en geeft elke driehoek eigen hoekpunten. Driehoek n van een mesh
// in het werkbestand is dus driehoek n van de mesh met dezelfde naam in de bron. Dat
// is de koppeling die dit gereedschap gebruikt, en het controleert hem: even veel
// driehoeken per mesh, en geen hoekpunt dat twee driehoeken deelt.
//
// Waarvoor: de import legt twee kleurcellen van de maker op dezelfde baan zodra ze op
// dezelfde kleur uitkomen, en splitst één cel over twee banen zodra zijn verloop over
// de grens tussen twee banen valt. Beide keren is de grens die de maker legde in het
// werkbestand weg. De riem van de ranger is daar een voorbeeld van: leer en tuniek
// liggen allebei op taupe, en er is geen doos of drempel die ze scheidt zonder dwars
// door de rok te lopen. In de bron staan ze in eigen cellen.
//
//   node tools/herkleur-op-bronfiguur.mjs werk.glb --bron bron.glb --atlas tex.png --lijst
//   node tools/herkleur-op-bronfiguur.mjs werk.glb --bron bron.glb --atlas tex.png \
//     --cel 7,0 --naar 2,0 [--mesh Body]
//
// --raster kxr zet de indeling van de bronatlas (standaard 8x4, die van de
// Adventurers). --mesh beperkt het werk tot meshes waarvan de naam matcht.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const COLORMAP = new URL('../kits/colormap.png', import.meta.url).pathname;

const arg = process.argv.slice(2);
let bronPad = null, atlasPad = null, cel = null, naar = null, pad = null, lijst = false;
let raster = '8x4';
const meshPatronen = [];
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--bron') bronPad = arg[++i];
  else if (arg[i] === '--atlas') atlasPad = arg[++i];
  else if (arg[i] === '--cel') cel = arg[++i];
  else if (arg[i] === '--naar') naar = arg[++i];
  else if (arg[i] === '--mesh') meshPatronen.push(arg[++i]);
  else if (arg[i] === '--raster') raster = arg[++i];
  else if (arg[i] === '--lijst') lijst = true;
  else pad = arg[i];
}
if (!pad || !bronPad || !atlasPad || (!lijst && (!cel || !naar))) {
  console.error('gebruik: node tools/herkleur-op-bronfiguur.mjs <werk.glb> --bron <bron.glb> --atlas <png> --cel k,r --naar k,r [--mesh naam] [--raster 8x4]');
  console.error('         node tools/herkleur-op-bronfiguur.mjs <werk.glb> --bron <bron.glb> --atlas <png> --lijst');
  process.exit(1);
}

const [bronK, bronR] = raster.split('x').map(Number);
const werk = readGlb(pad);
const bron = readGlb(bronPad);
const tex = readPng(atlasPad);
const texBreed = tex.width / bronK;
const texHoog = tex.height / bronR;

const bronMeshes = new Map((bron.json.meshes ?? []).map((m) => [m.name, m]));
const meshFilter = meshPatronen.length ? new RegExp(meshPatronen.join('|')) : null;

// De cel van de bronatlas die een driehoek aanwijst, plus de kleur op dat punt.
// De uv van glTF telt v naar beneden: v = 0 is de bovenrand van de afbeelding.
function bronCel(uv, hoek) {
  const u = (uv[hoek[0] * 2] + uv[hoek[1] * 2] + uv[hoek[2] * 2]) / 3;
  const v = (uv[hoek[0] * 2 + 1] + uv[hoek[1] * 2 + 1] + uv[hoek[2] * 2 + 1]) / 3;
  const x = Math.min(Math.max(u * tex.width, 0), tex.width - 1e-6);
  const y = Math.min(Math.max(v * tex.height, 0), tex.height - 1e-6);
  const i = (Math.floor(y) * tex.width + Math.floor(x)) * 4;
  return {
    cel: `${Math.floor(x / texBreed)},${Math.floor(y / texHoog)}`,
    hex: '#' + [0, 1, 2].map((k) => tex.pixels[i + k].toString(16).padStart(2, '0')).join(''),
  };
}

const kaart = readPng(COLORMAP);
const celBreed = kaart.width / KOLOMMEN;
const celHoog = kaart.height / RIJEN;

// Lichtheid boven- en onderin een cel, om te zien of het verloop andersom loopt.
const lichtheid = (kolom, rij, vDeel) => {
  const x = Math.floor((kolom + 0.5) * celBreed);
  const y = Math.min(Math.floor((rij + vDeel) * celHoog), kaart.height - 1);
  const i = (y * kaart.width + x) * 4;
  return kaart.pixels[i] + kaart.pixels[i + 1] + kaart.pixels[i + 2];
};
const richting = (kolom, rij) => Math.sign(lichtheid(kolom, rij, 0.9) - lichtheid(kolom, rij, 0.1));

// De meshes van het werkbestand naast die van de bron, met de controle erbij: even
// veel driehoeken, en elk hoekpunt van precies één driehoek. Valt een van beide weg,
// dan staat driehoek n niet meer voor hetzelfde stuk model en klopt de koppeling niet.
function koppel() {
  const paren = [];
  for (const mesh of werk.json.meshes ?? []) {
    if (meshFilter && !meshFilter.test(mesh.name ?? '')) continue;
    const bm = bronMeshes.get(mesh.name);
    if (!bm) throw new Error(`${pad}: mesh ${mesh.name} staat niet in ${bronPad}`);
    for (const [pi, prim] of mesh.primitives.entries()) {
      const bp = bm.primitives[pi];
      if (!bp) throw new Error(`${pad}: mesh ${mesh.name} heeft meer primitieven dan de bron`);
      const wIdx = readAccessor(werk, prim.indices);
      const bIdx = readAccessor(bron, bp.indices);
      if (wIdx.count !== bIdx.count) {
        throw new Error(`${pad}: mesh ${mesh.name} heeft ${wIdx.count / 3} driehoeken, de bron ${bIdx.count / 3}`);
      }
      const perVertex = new Map();
      for (let i = 0; i < wIdx.count; i++) {
        const v = wIdx.data[i];
        const d = (i / 3) | 0;
        if (perVertex.has(v) && perVertex.get(v) !== d) {
          throw new Error(`${pad}: mesh ${mesh.name} deelt hoekpunt ${v} tussen driehoeken — herkleuren zou de buurdriehoek meenemen`);
        }
        perVertex.set(v, d);
      }
      paren.push({ mesh, prim, wIdx, bIdx, bUv: readAccessor(bron, bp.attributes.TEXCOORD_0).data });
    }
  }
  return paren;
}

const paren = koppel();

if (lijst) {
  console.log(`== ${pad} naast ${bronPad}`);
  for (const p of paren) {
    const telling = new Map();
    for (let d = 0; d * 3 < p.wIdx.count; d++) {
      const b = bronCel(p.bUv, [p.bIdx.data[d * 3], p.bIdx.data[d * 3 + 1], p.bIdx.data[d * 3 + 2]]);
      let e = telling.get(b.cel);
      if (!e) telling.set(b.cel, (e = { n: 0, hex: b.hex, banen: new Map() }));
      e.n++;
      const wUv = readAccessor(werk, p.prim.attributes.TEXCOORD_0).data;
      const v = p.wIdx.data[d * 3];
      const x = Math.min(Math.max(wUv[v * 2] * kaart.width, 0), kaart.width - 1e-6);
      const y = Math.min(Math.max(wUv[v * 2 + 1] * kaart.height, 0), kaart.height - 1e-6);
      const baan = `${Math.floor(x / celBreed)},${Math.floor(y / celHoog)}`;
      e.banen.set(baan, (e.banen.get(baan) ?? 0) + 1);
    }
    console.log(`   ${p.mesh.name}: ${p.wIdx.count / 3} driehoeken`);
    for (const [c, e] of [...telling].sort((a, b) => b[1].n - a[1].n)) {
      const banen = [...e.banen].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b}×${n}`).join(' ');
      console.log(`     broncel ${c.padEnd(4)} ${e.hex} ${String(e.n).padStart(5)} → ${banen}`);
    }
  }
  process.exit(0);
}

const [naarK, naarR] = naar.split(',').map(Number);
const naarRichting = richting(naarK, naarR);
let geraakt = 0;
let gevonden = false;

for (const p of paren) {
  const acc = werk.json.accessors[p.prim.attributes.TEXCOORD_0];
  if (acc.componentType !== 5126) throw new Error(`${pad}: TEXCOORD_0 is geen float`);
  const bv = werk.json.bufferViews[acc.bufferView];
  const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stap = bv.byteStride ?? 8;

  for (let d = 0; d * 3 < p.wIdx.count; d++) {
    const b = bronCel(p.bUv, [p.bIdx.data[d * 3], p.bIdx.data[d * 3 + 1], p.bIdx.data[d * 3 + 2]]);
    if (b.cel !== cel) continue;
    gevonden = true;
    for (let h = 0; h < 3; h++) {
      const v = p.wIdx.data[d * 3 + h];
      const uv = new Float32Array(werk.bin.buffer, werk.bin.byteOffset + start + v * stap, 2);
      const y = Math.min(Math.max(uv[1] * kaart.height, 0), kaart.height - 1e-6);
      const vanR = Math.floor(y / celHoog);
      let stand = y / celHoog - vanR;
      const vanK = Math.floor(Math.min(Math.max(uv[0] * kaart.width, 0), kaart.width - 1e-6) / celBreed);
      if (richting(vanK, vanR) !== naarRichting) stand = 1 - stand;
      uv[0] = (naarK * celBreed + celBreed / 2) / kaart.width;
      uv[1] = ((naarR + stand) * celHoog) / kaart.height;
      geraakt++;
    }
  }
}

if (!gevonden) throw new Error(`${pad}: geen driehoek in broncel ${cel} — draai --lijst voor de cellen`);

writeGlb(pad, werk.json, werk.bin, writeFileSync);
console.log(`${pad}: ${geraakt} uv's van broncel ${cel} naar ${naar}`);
