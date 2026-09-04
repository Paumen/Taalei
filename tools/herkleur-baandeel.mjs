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
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const COLORMAP = new URL('../kits/colormap.png', import.meta.url).pathname;

const argumenten = process.argv.slice(2);
const van = [];
let naar = null;
let deel = '0-1';
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--van') van.push(argumenten[++i]);
  else if (argumenten[i] === '--naar') naar = argumenten[++i];
  else if (argumenten[i] === '--deel') deel = argumenten[++i];
  else bestanden.push(argumenten[i]);
}
if (van.length === 0 || !naar || bestanden.length === 0) {
  console.error('gebruik: node tools/herkleur-baandeel.mjs --van k,r [--van k,r] --naar k,r [--deel 0.55-1.0] <glb...>');
  process.exit(1);
}

const [boven, onder] = deel.split('-').map(Number);
if (!(boven >= 0 && onder <= 1 && boven < onder)) {
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

const [naarK, naarR] = naar.split(',').map(Number);
const vanCellen = new Set(van);

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const { json, bin } = glb;

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
        const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const x = Math.min(Math.max(uv[0] * atlas.width, 0), atlas.width - 1e-6);
        const y = Math.min(Math.max(uv[1] * atlas.height, 0), atlas.height - 1e-6);
        const kolom = Math.floor(x / celBreed);
        const rij = Math.floor(y / celHoog);
        if (!vanCellen.has(`${kolom},${rij}`)) continue;
        geraakt.push({ uv, uDeel: x / celBreed - kolom, licht: lichtheid(kolom, rij, y / celHoog - rij) });
      }
    }
  }

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
  console.log(`${pad}: ${geraakt.length} uv's van ${van.join('+')} naar ${naar} deel ${deel}`);
}
