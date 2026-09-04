// Verplaatst UV's van één colormap-baan naar een andere, met behoud van de
// positie in het verloop. Alleen voor modellen op de gedeelde colormap.
//
//   node tools/herkleur-baan.mjs --van 5,0 --naar 1,1 kits/workfiles/halloween/tree-pine-orange-large.glb ...
//
// Meerdere --van mogen naar dezelfde --naar. Het bestand wordt in place herschreven.
//
// --stuk beperkt het werk tot losse samenhangende delen van de mesh, voor een
// samenstelling waarin één baan meerdere voorwerpen draagt (een riem en een laag
// stof allebei op 13,0). --lijst drukt die delen af met hun banen. Zie
// tools/stukken.mjs; herkleur-baandeel.mjs gebruikt dezelfde aanwijzers.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';
import { enigePrimitive, lijstRegels, verdeelInStukken } from './stukken.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const COLORMAP = new URL('../kits/colormap.png', import.meta.url).pathname;

const argumenten = process.argv.slice(2);
const van = [];
const stukken = [];
let naar = null;
let lijst = false;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--van') van.push(argumenten[++i]);
  else if (argumenten[i] === '--naar') naar = argumenten[++i];
  else if (argumenten[i] === '--stuk') stukken.push(argumenten[++i]);
  else if (argumenten[i] === '--lijst') lijst = true;
  else bestanden.push(argumenten[i]);
}
if (bestanden.length === 0 || (!lijst && (van.length === 0 || !naar))) {
  console.error('gebruik: node tools/herkleur-baan.mjs --van k,r [--van k,r] --naar k,r [--stuk x,y,z] <glb...>');
  console.error('         node tools/herkleur-baan.mjs --lijst <glb...>');
  process.exit(1);
}

const atlas = readPng(COLORMAP);
const celBreed = atlas.width / KOLOMMEN;
const celHoog = atlas.height / RIJEN;

// Lichtheid boven- en onderin een cel, om te zien of het verloop andersom loopt.
function lichtheid(kolom, rij, vDeel) {
  const x = Math.floor((kolom + 0.5) * celBreed);
  const y = Math.floor((rij + vDeel) * celHoog);
  const i4 = (Math.min(y, atlas.height - 1) * atlas.width + x) * 4;
  return atlas.pixels[i4] + atlas.pixels[i4 + 1] + atlas.pixels[i4 + 2];
}

function richting(kolom, rij) {
  return Math.sign(lichtheid(kolom, rij, 0.9) - lichtheid(kolom, rij, 0.1));
}

const [naarK, naarR] = lijst ? [] : naar.split(',').map(Number);
const naarRichting = lijst ? 0 : richting(naarK, naarR);
const vanCellen = new Map(
  van.map((baan) => {
    const [k, r] = baan.split(',').map(Number);
    return [`${k},${r}`, { omgekeerd: richting(k, r) !== naarRichting }];
  }),
);

// Voor --lijst, dat alleen de banen per stuk wil weten.
const baanVan = (uv) => {
  const x = Math.min(Math.max(uv[0] * atlas.width, 0), atlas.width - 1e-6);
  const y = Math.min(Math.max(uv[1] * atlas.height, 0), atlas.height - 1e-6);
  return { cel: `${Math.floor(x / celBreed)},${Math.floor(y / celHoog)}` };
};

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const { json, bin } = glb;
  let geraakt = 0;

  let stukInfo = null;
  if (lijst || stukken.length > 0) stukInfo = verdeelInStukken(glb, enigePrimitive(json, pad));

  if (lijst) {
    console.log(`== ${pad}: ${stukInfo.doos.size} stukken`);
    for (const regel of lijstRegels(glb, stukInfo, baanVan)) console.log(regel);
    continue;
  }

  const gevraagd = new Set(stukken);
  const gezien = new Set();

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
        const x = Math.min(Math.max(uv[0] * atlas.width, 0), atlas.width - 1e-6);
        const y = Math.min(Math.max(uv[1] * atlas.height, 0), atlas.height - 1e-6);
        const cel = `${Math.floor(x / celBreed)},${Math.floor(y / celHoog)}`;
        const bron = vanCellen.get(cel);
        if (!bron) continue;

        const uDeel = x / celBreed - Math.floor(x / celBreed);
        const vRuw = y / celHoog - Math.floor(y / celHoog);
        const vDeel = bron.omgekeerd ? 1 - vRuw : vRuw;
        uv[0] = ((naarK + uDeel) * celBreed) / atlas.width;
        uv[1] = ((naarR + vDeel) * celHoog) / atlas.height;
        geraakt++;
      }
    }
  }

  const kwijt = [...gevraagd].filter((s) => !gezien.has(s));
  if (kwijt.length) throw new Error(`${pad}: geen stuk op ${kwijt.join(' / ')} — draai --lijst voor de sleutels`);

  writeGlb(pad, json, bin, writeFileSync);
  const waar = stukken.length ? ` in ${stukken.length} stuk(ken)` : '';
  console.log(`${pad}: ${geraakt} uv's van ${van.join('+')} naar ${naar}${waar}`);
}
