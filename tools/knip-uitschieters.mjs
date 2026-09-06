// Trekt de uv's die buiten een lichtheidsvenster vallen naar de rand ervan toe.
//
//   node tools/knip-uitschieters.mjs --baan 1,0 --venster 0.562-0.630 <glb...>
//   node tools/knip-uitschieters.mjs --baan 1,0 --venster 0.562-0.630 --lijst <glb...>
//
// Anders dan anker-verloop.mjs, dat een baan als geheel schaalt: dit raakt alleen de
// driehoeken die buiten het venster liggen en laat de rest exact staan. Dat is wat je
// wilt als de span van een groep niet door zijn verloop bepaald wordt maar door een
// staart: over de eenentwintig bakken van Kisten & vaten samen loopt wood middle van
// L 0.637 tot 0.531, maar de donkerste procent van het oppervlak vult daarvan 0.031 -
// een derde van de baan, gedragen door losse driehoeken. Schalen zou het hele verloop
// platdrukken om die procent te verplaatsen; knippen verplaatst alleen die procent.
//
// De uitschieters komen op de rand van het venster te liggen en dus allemaal op
// dezelfde lijn. Dat is een keuze, geen bijverschijnsel: het zijn losse driehoeken
// zonder eigen verloop, en ze op één lijn zetten is precies wat ze binnenhalen
// betekent. Wil je ze uitgesmeerd, dan is dit het verkeerde gereedschap.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const COLORMAP = new URL('../kits/colormap.png', import.meta.url).pathname;

const argumenten = process.argv.slice(2);
let baan = null;
let venster = null;
let lijst = false;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  const a = argumenten[i];
  if (a === '--baan') baan = argumenten[++i];
  else if (a === '--venster') venster = argumenten[++i];
  else if (a === '--lijst') lijst = true;
  else bestanden.push(a);
}
if (bestanden.length === 0 || !baan || !venster) {
  console.error('gebruik: node tools/knip-uitschieters.mjs --baan k,r --venster L-L [--lijst] <glb...>');
  process.exit(1);
}
const [baanK, baanR] = baan.split(',').map(Number);
const [onder, boven] = venster.split('-').map(Number).sort((a, b) => a - b);

const atlas = readPng(COLORMAP);
const celBreed = atlas.width / KOLOMMEN;
const celHoog = atlas.height / RIJEN;
const lineair = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
function lichtheid(r, g, b) {
  const [x, y, z] = [lineair(r), lineair(g), lineair(b)];
  const l = Math.cbrt(0.4122214708 * x + 0.5363325363 * y + 0.0514459929 * z);
  const m = Math.cbrt(0.2119034982 * x + 0.6806995451 * y + 0.1073969566 * z);
  const s = Math.cbrt(0.0883024619 * x + 0.2817188376 * y + 0.6299787005 * z);
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
}
const ladder = [];
for (let y = 0; y < celHoog; y++) {
  const i4 = ((Math.floor(baanR * celHoog) + y) * atlas.width + Math.floor(baanK * celBreed + celBreed / 2)) * 4;
  ladder.push(lichtheid(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]));
}
const lijnVoor = (L) => {
  let beste = 0;
  for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - L) < Math.abs(ladder[beste] - L)) beste = i;
  return beste;
};
const randLicht = lijnVoor(boven);
const randDonker = lijnVoor(onder);

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const { json, bin } = glb;
  let teLicht = 0;
  let teDonker = 0;
  let totaal = 0;

  const gedaan = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const index = prim.attributes?.TEXCOORD_0;
      if (index === undefined || gedaan.has(index)) continue;
      gedaan.add(index);
      const accessor = json.accessors[index];
      const bufferView = json.bufferViews[accessor.bufferView];
      const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stap = bufferView.byteStride ?? 8;
      for (let i = 0; i < accessor.count; i++) {
        const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const x = Math.min(Math.max(uv[0], 0), 1) * KOLOMMEN;
        const y = Math.min(Math.max(uv[1], 0), 1) * RIJEN;
        if (Math.floor(x) !== baanK || Math.floor(y) !== baanR) continue;
        totaal++;
        const lijn = Math.min(ladder.length - 1, Math.floor((y - baanR) * ladder.length));
        let nieuw = lijn;
        if (ladder[lijn] > boven) { nieuw = randLicht; teLicht++; }
        else if (ladder[lijn] < onder) { nieuw = randDonker; teDonker++; }
        if (nieuw === lijn) continue;
        uv[1] = (baanR + (nieuw + 0.5) / ladder.length) / RIJEN;
      }
    }
  }
  const verslag = `${pad}: ${totaal} uv's op ${baan}, ${teLicht} te licht en ${teDonker} te donker naar de rand`;
  if (lijst) { console.log(verslag); continue; }
  if (teLicht + teDonker === 0) { console.log(`${pad}: niets buiten het venster`); continue; }
  console.log(verslag);
  writeGlb(pad, json, bin, writeFileSync);
}
