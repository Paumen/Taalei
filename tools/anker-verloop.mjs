// Legt het zwaartepunt van een baan op een gekozen lichtheid, met behoud van het
// contrast dat het model zelf draagt.
//
//   node tools/anker-verloop.mjs --van 0,0 --van 1,0 --naar 1,0 --venster 0.57-0.63 <glb...>
//   node tools/anker-verloop.mjs --naar 1,0 --venster 0.57-0.63 --lijst <glb...>
//
// Het venster is OKLab-lichtheid, net als de G-regels, en het geldt voor het
// zwaartepunt — niet voor de uitersten. Dat is de hele truc: de G-regels vragen waar
// het gemiddelde ligt, want dat is de kleur die je van een voorwerp afleest, en de
// spreiding eromheen is de gebakken schaduw van de maker. Die blijft staan zoals hij is.
//
// Waarom niet herkleur-baandeel.mjs, dat ook een venster kent: dat rekt het geraakte
// bereik uit tot het venster vol is, en schaalt daarmee het contrast naar de breedte
// van het venster. Een venster is smal, dus dat trekt een subtiel verloop open en
// drukt een sterk verloop plat — props/box-a stond op 0.032 L en werd 0.063,
// dungeon/keg stond op 0.205 en werd 0.049. Allebei zichtbaar verkeerd, en allebei
// niet meer wat de maker gebakken had.
//
// Krimpen gebeurt alleen als het model anders buiten de báán zou vallen: een deel van
// het oppervlak zou dan in de buurbaan komen en als een andere kleur tellen. Per kant
// gemeten, want een verloop ligt zelden symmetrisch om zijn zwaartepunt, en niet
// verder dan die kant nodig heeft.
//
// Meerdere --van komen samen op één lichtheidsschaal in de doelbaan: een model dat
// zijn licht en donker over twee banen had staan, houdt de volgorde binnen één baan.
//
// Een baan zonder verloop blijft vlak. Er is geen schaduw om te verschuiven, en er een
// verzinnen zou neerkomen op een drempel op geometrie — precies wat de herkleurregels
// verbieden.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const COLORMAP = new URL('../kits/colormap.png', import.meta.url).pathname;
const RAND = 0.004;

const argumenten = process.argv.slice(2);
const van = [];
let naar = null;
let venster = null;
let lijst = false;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  const a = argumenten[i];
  if (a === '--van') van.push(argumenten[++i]);
  else if (a === '--naar') naar = argumenten[++i];
  else if (a === '--venster') venster = argumenten[++i];
  else if (a === '--lijst') lijst = true;
  else bestanden.push(a);
}
if (bestanden.length === 0 || !naar || !venster) {
  console.error('gebruik: node tools/anker-verloop.mjs [--van k,r ...] --naar k,r --venster L-L [--lijst] <glb...>');
  process.exit(1);
}
if (van.length === 0) van.push(naar);
const [onder, boven] = venster.split('-').map(Number).sort((a, b) => a - b);
const doel = (onder + boven) / 2;
const [naarK, naarR] = naar.split(',').map(Number);
const bronnen = new Set(van);

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

// De lichtheid van elke lijn van een baan, en de weg terug: van een lichtheid naar de
// stand in de doelbaan die er het dichtst bij ligt.
function baanLadder(k, r) {
  const x = Math.floor(k * celBreed + celBreed / 2);
  const ladder = [];
  for (let y = 0; y < celHoog; y++) {
    const i4 = ((Math.floor(r * celHoog) + y) * atlas.width + x) * 4;
    ladder.push(lichtheid(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]));
  }
  return ladder;
}
const doelLadder = baanLadder(naarK, naarR);
const doelLicht = doelLadder[0];
const doelDonker = doelLadder[doelLadder.length - 1];
const ladders = new Map();
const ladderVan = (k, r) => {
  const sleutel = `${k},${r}`;
  if (!ladders.has(sleutel)) ladders.set(sleutel, baanLadder(k, r));
  return ladders.get(sleutel);
};
function standVoor(L) {
  let beste = 0;
  for (let i = 1; i < doelLadder.length; i++) {
    if (Math.abs(doelLadder[i] - L) < Math.abs(doelLadder[beste] - L)) beste = i;
  }
  return (beste + 0.5) / doelLadder.length;
}

if (doel < Math.min(doelLicht, doelDonker) || doel > Math.max(doelLicht, doelDonker)) {
  console.error(`venster ${venster} ligt met midden ${doel.toFixed(3)} buiten baan ${naar} (L ${doelLicht.toFixed(3)}-${doelDonker.toFixed(3)})`);
  process.exit(2);
}

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

// Per vertex het oppervlak van de driehoeken die eraan hangen, gedeeld door drie: zo
// weegt elke vertex mee voor het stuk oppervlak dat hij draagt, en telt een gemiddelde
// over de vertices hetzelfde als een gemiddelde over de driehoeken.
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
      const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices) : null;
      const aan = (i) => (idx ? idx.data[i] : i);
      const aantal = idx ? idx.count : positie.count;
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
        const k = Math.floor(x);
        const r = Math.floor(y);
        if (!bronnen.has(`${k},${r}`)) continue;
        const ladder = ladderVan(k, r);
        const lijn = Math.min(ladder.length - 1, Math.floor((y - r) * ladder.length));
        // de stand binnen de cel in de breedte blijft staan: een baan is een kolom, en
        // die breedte draagt geen kleur — maar hij moet wel mee naar de nieuwe kolom
        raak.push({ uv, uDeel: x - k, L: ladder[lijn], gewicht: rij ? rij[i] : 0 });
      }
    }
  }
  if (raak.length === 0) { console.log(`${pad}: geen uv's op ${van.join(' of ')}`); continue; }

  const totaal = raak.reduce((som, r) => som + r.gewicht, 0);
  const zwaartepunt = totaal > 0
    ? raak.reduce((som, r) => som + r.L * r.gewicht, 0) / totaal
    : raak.reduce((som, r) => som + r.L, 0) / raak.length;
  const laagste = Math.min(...raak.map((r) => r.L));
  const hoogste = Math.max(...raak.map((r) => r.L));

  // krimpen alleen om binnen de baan te blijven, per kant zo weinig als het kan
  const ruimteLicht = Math.max(doelLicht, doelDonker) - doel;
  const ruimteDonker = doel - Math.min(doelLicht, doelDonker);
  const naarBoven = hoogste - zwaartepunt;
  const naarBeneden = zwaartepunt - laagste;
  const schaal = Math.min(
    1,
    naarBoven > 0 ? ruimteLicht / naarBoven : 1,
    naarBeneden > 0 ? ruimteDonker / naarBeneden : 1,
  );

  const verslag = `${pad}: ${raak.length} uv's ${van.join('+')} -> ${naar}, zwaartepunt L ${zwaartepunt.toFixed(3)} -> ${doel.toFixed(3)}, contrast ${(hoogste - laagste).toFixed(3)}${schaal < 1 ? ` x${schaal.toFixed(2)} (past niet in de baan)` : ' ongewijzigd'}`;
  if (lijst) { console.log(verslag); continue; }

  for (const r of raak) {
    const stand = Math.min(Math.max(standVoor(doel + (r.L - zwaartepunt) * schaal), RAND), 1 - RAND);
    r.uv[0] = (naarK + Math.min(Math.max(r.uDeel, RAND), 1 - RAND)) / KOLOMMEN;
    r.uv[1] = (naarR + stand) / RIJEN;
  }
  console.log(verslag);
  writeGlb(pad, json, bin, writeFileSync);
}
