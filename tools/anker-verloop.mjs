// Legt het zwaartepunt van een baan op een gekozen stand, met behoud van de
// eigen schaduwspan van het model.
//
//   node tools/anker-verloop.mjs --baan 1,0 --venster 0.125-0.711 <glb...>
//   node tools/anker-verloop.mjs --baan 0,0 --venster 0.500-0.875 --lijst <glb...>
//
// Waarom naast normaliseer-verloop.mjs en herkleur-baandeel.mjs, die allebei al
// iets in een venster leggen:
//
//   herkleur-baandeel.mjs rekt het geraakte bereik uit tot het venster vol is.
//   De uitersten van elk model komen dan gelijk te liggen — het lichtste vlak op
//   de bovenrand, het donkerste op de onderrand — maar het gemiddelde niet: een
//   vat waarvan het meeste oppervlak licht ligt komt op 0.617 uit en een emmer
//   waarvan het meeste donker ligt op 0.552, met precies hetzelfde bereik.
//   Naast elkaar zijn dat nog steeds twee kleuren hout.
//
//   normaliseer-verloop.mjs ankert het midden van het geraakte bereik, per
//   vertex geteld. Dat is hetzelfde uiterste-op-uiterste: na een uitrekking
//   liggen alle middens al gelijk terwijl de gemiddelden uiteen blijven lopen.
//
// Wat je ziet is het naar oppervlak gewogen gemiddelde: een groot licht vlak
// weegt zwaarder dan drie kleine donkere. Dat is ook wat gradient-lint.mjs meet
// en wat de G-regels als getal noemen. Dit gereedschap legt dat gemiddelde op het
// midden van het venster en schuift de rest mee. Loopt het model daarmee buiten
// het venster, dan krimpt de span om het zwaartepunt heen tot hij past — niet
// verder, zodat er zo veel schaduw overblijft als er in past.
//
// Een baan zonder verloop blijft vlak: er is geen schaduw om te verschuiven, en
// er een verzinnen zou neerkomen op een drempel op geometrie. Dat is precies wat
// de herkleurregels verbieden.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const RAND = 0.002;

const argumenten = process.argv.slice(2);
const banen = [];
let venster = null;
let lijst = false;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  const a = argumenten[i];
  if (a === '--baan') banen.push(argumenten[++i]);
  else if (a === '--venster') venster = argumenten[++i];
  else if (a === '--lijst') lijst = true;
  else bestanden.push(a);
}
if (bestanden.length === 0 || banen.length === 0 || !venster) {
  console.error('gebruik: node tools/anker-verloop.mjs --baan k,r [--baan k,r] --venster a-b [--lijst] <glb...>');
  process.exit(1);
}
const [laag, hoog] = venster.split('-').map(Number);
if (!(laag >= 0 && hoog <= 1 && laag < hoog)) {
  console.error(`--venster ${venster} valt buiten 0-1 of loopt achteruit`);
  process.exit(2);
}
const midden = (laag + hoog) / 2;
const halfVenster = (hoog - laag) / 2;

const EENHEID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function maal(a, b) {
  const r = new Array(16).fill(0);
  for (let k = 0; k < 4; k++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let n = 0; n < 4; n++) som += a[n * 4 + rij] * b[k * 4 + n];
      r[k * 4 + rij] = som;
    }
  }
  return r;
}

function knoopMatrix(knoop) {
  if (knoop.matrix) return knoop.matrix;
  const [tx, ty, tz] = knoop.translation ?? [0, 0, 0];
  const [x, y, z, w] = knoop.rotation ?? [0, 0, 0, 1];
  const s = knoop.scale ?? [1, 1, 1];
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  for (let k = 0; k < 3; k++) for (let rij = 0; rij < 3; rij++) m[k * 4 + rij] *= s[k];
  return [...m.slice(0, 12), tx, ty, tz, 1];
}

const punt = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

// Per vertex het oppervlak van de driehoeken die eraan hangen, gedeeld door drie:
// zo weegt elke vertex mee voor het stuk oppervlak dat hij draagt, en telt het
// gewogen gemiddelde over de vertices hetzelfde als over de driehoeken.
function vertexGewichten(glb) {
  const { json } = glb;
  const knopen = json.nodes ?? [];
  const wereld = new Array(knopen.length).fill(null);
  const loop = (i, ouder) => {
    if (wereld[i]) return;
    const knoop = knopen[i];
    if (!knoop) return;
    wereld[i] = maal(ouder, knoopMatrix(knoop));
    for (const kind of knoop.children ?? []) loop(kind, wereld[i]);
  };
  for (const i of json.scenes?.[json.scene ?? 0]?.nodes ?? []) loop(i, EENHEID);

  const gewicht = new Map();
  knopen.forEach((knoop, index) => {
    if (knoop.mesh === undefined || !wereld[index]) return;
    for (const prim of json.meshes[knoop.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      const uvIndex = prim.attributes?.TEXCOORD_0;
      if (uvIndex === undefined) continue;
      const positie = readAccessor(glb, prim.attributes.POSITION);
      const p = new Array(positie.count);
      for (let v = 0; v < positie.count; v++) {
        p[v] = punt(wereld[index], positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2]);
      }
      const index2 = prim.indices !== undefined ? readAccessor(glb, prim.indices) : null;
      const aan = (i) => (index2 ? index2.data[i] : i);
      const aantal = index2 ? index2.count : positie.count;
      if (!gewicht.has(uvIndex)) gewicht.set(uvIndex, new Float64Array(positie.count));
      const rij = gewicht.get(uvIndex);
      for (let i = 0; i + 2 < aantal; i += 3) {
        const [a, b, c] = [p[aan(i)], p[aan(i + 1)], p[aan(i + 2)]];
        const nx = (c[1] - b[1]) * (a[2] - b[2]) - (c[2] - b[2]) * (a[1] - b[1]);
        const ny = (c[2] - b[2]) * (a[0] - b[0]) - (c[0] - b[0]) * (a[2] - b[2]);
        const nz = (c[0] - b[0]) * (a[1] - b[1]) - (c[1] - b[1]) * (a[0] - b[0]);
        const deel = Math.sqrt(nx * nx + ny * ny + nz * nz) / 6;
        rij[aan(i)] += deel;
        rij[aan(i + 1)] += deel;
        rij[aan(i + 2)] += deel;
      }
    }
  });
  return gewicht;
}

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const { json, bin } = glb;
  const gewichten = vertexGewichten(glb);
  let geschreven = false;

  for (const baan of banen) {
    const [bk, br] = baan.split(',').map(Number);
    const raak = [];

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
        const rij = gewichten.get(index);
        for (let i = 0; i < accessor.count; i++) {
          const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
          const x = Math.min(Math.max(uv[0], 0), 1) * KOLOMMEN;
          const y = Math.min(Math.max(uv[1], 0), 1) * RIJEN;
          if (Math.floor(x) !== bk || Math.floor(y) !== br) continue;
          raak.push({ uv, stand: y - br, gewicht: rij ? rij[i] : 0 });
        }
      }
    }
    if (raak.length === 0) continue;

    const totaal = raak.reduce((som, r) => som + r.gewicht, 0);
    const zwaartepunt = totaal > 0
      ? raak.reduce((som, r) => som + r.stand * r.gewicht, 0) / totaal
      : raak.reduce((som, r) => som + r.stand, 0) / raak.length;
    const laagste = Math.min(...raak.map((r) => r.stand));
    const hoogste = Math.max(...raak.map((r) => r.stand));

    // krimpen tot de verste kant nog in het venster past, en niet verder
    const uiterste = Math.max(zwaartepunt - laagste, hoogste - zwaartepunt);
    const schaal = uiterste > halfVenster ? halfVenster / uiterste : 1;

    if (lijst) {
      console.log(`${pad}: baan ${baan} zwaartepunt ${zwaartepunt.toFixed(3)} -> ${midden.toFixed(3)}, span ${(hoogste - laagste).toFixed(3)} x ${schaal.toFixed(2)}`);
      continue;
    }

    for (const r of raak) {
      const nieuw = Math.min(Math.max(midden + (r.stand - zwaartepunt) * schaal, laag + RAND), hoog - RAND);
      r.uv[1] = (br + nieuw) / RIJEN;
    }
    geschreven = true;
    console.log(`${pad}: baan ${baan} ${raak.length} uv's, zwaartepunt ${zwaartepunt.toFixed(3)} -> ${midden.toFixed(3)}, span x${schaal.toFixed(2)}`);
  }

  if (geschreven) writeGlb(pad, json, bin, writeFileSync);
}
