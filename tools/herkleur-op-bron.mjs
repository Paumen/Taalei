// Herkleurt de driehoeken van één kleurgroep van het BRONMODEL naar een baan van
// de colormap, met behoud van hun verlooppositie.
//
// Waarom naast herkleur-baan.mjs en herkleur-selectie.mjs: de import legt meerdere
// kleurgroepen van de maker op dezelfde baan zodra ze op dezelfde kleur uitkomen,
// en dan is die grens in het werkbestand weg. In de bron staat hij er nog — als
// een eigen materiaalnaam in de .obj, of als een eigen kleur in de atlas. Dat is
// de grens die de maker gelegd heeft, exact, en niet te benaderen met een doos of
// een drempel op hoogte: de kaft van een open boek is een plank van twee milimeter
// onder een blok bladzijden, en een doos eromheen pakt de bladzijden mee.
//
//   node tools/herkleur-op-bron.mjs <werk.glb> --obj <bron.obj> --lijst
//   node tools/herkleur-op-bron.mjs <werk.glb> --obj <bron.obj> --groep DarkBrown --naar 6,1
//   node tools/herkleur-op-bron.mjs <werk.glb> --obj <bron.obj> --atlas <atlas.png> \
//     --groep '#a89a6a' --naar 14,3
//
// Zonder --atlas heet een groep naar het `usemtl` van de bron; met --atlas naar de
// kleur die de uv van de driehoek in die atlas aanwijst. Kits met één materiaal
// (de Quaternius-packs) hebben --atlas nodig, kits met benoemde materialen niet.
//
// Bron en werkbestand worden gekoppeld op het zwaartepunt van de driehoek, niet op
// volgorde: de import last hoekpunten en houdt de volgorde niet vast. Een driehoek
// die in de bron niet terug te vinden is, telt als niet-gekozen en wordt gemeld.
import { readFileSync, writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const COLORMAP = new URL('../kits/colormap.png', import.meta.url).pathname;
// Bron en werkbestand komen uit dezelfde export, dus de hoekpunten staan op
// dezelfde plek; een halve tiende milimeter speling vangt het afronden op.
const ROOSTER = 1e3;

const arg = process.argv.slice(2);
let objPad = null, atlasPad = null, groep = null, naar = null, pad = null, lijst = false;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--obj') objPad = arg[++i];
  else if (arg[i] === '--atlas') atlasPad = arg[++i];
  else if (arg[i] === '--groep') groep = arg[++i];
  else if (arg[i] === '--naar') naar = arg[++i];
  else if (arg[i] === '--lijst') lijst = true;
  else pad = arg[i];
}
if (!pad || !objPad || (!lijst && (!groep || !naar))) {
  console.error('gebruik: node tools/herkleur-op-bron.mjs <werk.glb> --obj <bron.obj> [--atlas <png>] --groep <naam> --naar k,r');
  console.error('         node tools/herkleur-op-bron.mjs <werk.glb> --obj <bron.obj> [--atlas <png>] --lijst');
  process.exit(1);
}

const bronAtlas = atlasPad ? readPng(atlasPad) : null;
const atlasKleur = (u, v) => {
  const x = Math.min(bronAtlas.width - 1, Math.max(0, Math.floor(u * bronAtlas.width)));
  const y = Math.min(bronAtlas.height - 1, Math.max(0, Math.floor((1 - v) * bronAtlas.height)));
  const i = (y * bronAtlas.width + x) * 4;
  return '#' + [0, 1, 2].map((k) => bronAtlas.pixels[i + k].toString(16).padStart(2, '0')).join('');
};

// De driehoeken van de bron, elk met zijn groep en het zwaartepunt waarop hij aan
// het werkbestand gekoppeld wordt. Een `f` met meer dan drie hoekpunten wordt als
// waaier opgedeeld, zoals elke exporteur dat doet.
function bronDriehoeken() {
  const vs = [], uvs = [], tri = [];
  let mtl = null;
  for (const regel of readFileSync(objPad, 'utf8').split('\n')) {
    const p = regel.trim().split(/\s+/);
    if (p[0] === 'usemtl') mtl = p[1];
    else if (p[0] === 'v') vs.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vt') uvs.push([+p[1], +p[2]]);
    else if (p[0] === 'f') {
      const hoek = p.slice(1).map((q) => q.split('/').map((n) => (n === '' ? 0 : +n)));
      for (let k = 1; k + 1 < hoek.length; k++) {
        const drie = [hoek[0], hoek[k], hoek[k + 1]];
        const punt = drie.map((h) => vs[h[0] - 1]);
        tri.push({
          groep: bronAtlas ? atlasKleur(...uvs[drie[0][1] - 1]) : mtl,
          mid: [0, 1, 2].map((a) => (punt[0][a] + punt[1][a] + punt[2][a]) / 3),
        });
      }
    }
  }
  return tri;
}

const rooster = (m) => m.map((v) => Math.round(v * ROOSTER));
const sleutel = (m) => rooster(m).join(',');

// Een zwaartepunt dat net over een roostergrens valt, staat in een buurvakje; kijk
// daarom in de zevenentwintig vakjes rond het gezochte. Levert dat niets op, dan is
// de vierhoek in de bron langs de andere diagonaal in tweeën gedeeld en ligt er geen
// driehoek met hetzelfde zwaartepunt: val terug op de dichtstbijzijnde van allemaal,
// die dan nog steeds binnen diezelfde vierhoek ligt en dus dezelfde groep draagt.
function zoek(kaart, alles, mid) {
  const [a, b, c] = rooster(mid);
  let beste = null, afstand = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    for (const t of kaart.get(`${a + i},${b + j},${c + k}`) ?? []) {
      const d = (t.mid[0] - mid[0]) ** 2 + (t.mid[1] - mid[1]) ** 2 + (t.mid[2] - mid[2]) ** 2;
      if (d < afstand) { afstand = d; beste = t.groep; }
    }
  }
  if (beste !== null) return beste;
  for (const t of alles) {
    const d = (t.mid[0] - mid[0]) ** 2 + (t.mid[1] - mid[1]) ** 2 + (t.mid[2] - mid[2]) ** 2;
    if (d < afstand) { afstand = d; beste = t.groep; }
  }
  return beste;
}

const glb = readGlb(pad);

// Alle primitieven, niet één: glasmateriaal.mjs splitst een model met glas in
// tweeën, en de driehoeken van de bron liggen dan over allebei verdeeld.
const primitieven = [];
const gezien = new Set();
for (const mesh of glb.json.meshes ?? []) for (const prim of mesh.primitives ?? []) {
  const sleutelPrim = `${prim.attributes.POSITION},${prim.indices}`;
  if (gezien.has(sleutelPrim)) continue;
  gezien.add(sleutelPrim);
  primitieven.push({
    prim,
    pos: readAccessor(glb, prim.attributes.POSITION).data,
    idx: readAccessor(glb, prim.indices).data,
  });
}

const alleBron = bronDriehoeken();
const kaart = new Map();
for (const t of alleBron) {
  const s = sleutel(t.mid);
  if (!kaart.has(s)) kaart.set(s, []);
  kaart.get(s).push(t);
}

// Per driehoek van elk primitief de groep uit de bron.
for (const p of primitieven) {
  p.perDriehoek = [];
  for (let t = 0; t < p.idx.length; t += 3) {
    const mid = [0, 1, 2].map((a) =>
      (p.pos[p.idx[t] * 3 + a] + p.pos[p.idx[t + 1] * 3 + a] + p.pos[p.idx[t + 2] * 3 + a]) / 3);
    p.perDriehoek.push(zoek(kaart, alleBron, mid));
  }
}
const perDriehoek = primitieven.flatMap((p) => p.perDriehoek);

if (lijst) {
  // Ook de banen en verloopstanden die het werkbestand nú aan die groep geeft: zo is
  // te zien of een grens ook zonder de bron te leggen is, met --van of --vbron.
  const kaartUit = readPng(COLORMAP);
  const cb = kaartUit.width / KOLOMMEN, ch = kaartUit.height / RIJEN;
  const telling = new Map();
  for (const p of primitieven) {
    const uvData = readAccessor(glb, p.prim.attributes.TEXCOORD_0).data;
    for (let t = 0; t < p.idx.length; t += 3) {
      const g = p.perDriehoek[t / 3];
      let e = telling.get(g);
      if (!e) telling.set(g, (e = { n: 0, banen: new Map() }));
      e.n++;
      for (const v of [p.idx[t], p.idx[t + 1], p.idx[t + 2]]) {
        const x = Math.min(Math.max(uvData[v * 2] * kaartUit.width, 0), kaartUit.width - 1e-6);
        const y = Math.min(Math.max(uvData[v * 2 + 1] * kaartUit.height, 0), kaartUit.height - 1e-6);
        const cel = `${Math.floor(x / cb)},${Math.floor(y / ch)}`;
        const stand = y / ch - Math.floor(y / ch);
        const b = e.banen.get(cel) ?? [1, 0];
        e.banen.set(cel, [Math.min(b[0], stand), Math.max(b[1], stand)]);
      }
    }
  }
  console.log(`== ${pad}: ${perDriehoek.length} driehoeken`);
  for (const [g, e] of [...telling].sort((a, b) => b[1].n - a[1].n)) {
    const banen = [...e.banen].map(([c, [lo, hi]]) => `${c} stand ${lo.toFixed(2)}-${hi.toFixed(2)}`);
    console.log(`   ${String(g ?? '(niet in de bron)').padEnd(18)} ${String(e.n).padStart(5)}  ${banen.join(' · ')}`);
  }
  process.exit(0);
}

if (!perDriehoek.includes(groep)) {
  throw new Error(`${pad}: geen driehoek in groep ${groep} — draai --lijst voor de groepen`);
}

const atlas = readPng(COLORMAP);
const celBreed = atlas.width / KOLOMMEN;
const celHoog = atlas.height / RIJEN;

// Lichtheid boven- en onderin een cel, om te zien of het verloop andersom loopt.
const lichtheid = (kolom, rij, vDeel) => {
  const x = Math.floor((kolom + 0.5) * celBreed);
  const y = Math.min(Math.floor((rij + vDeel) * celHoog), atlas.height - 1);
  const i = (y * atlas.width + x) * 4;
  return atlas.pixels[i] + atlas.pixels[i + 1] + atlas.pixels[i + 2];
};
const richting = (kolom, rij) => Math.sign(lichtheid(kolom, rij, 0.9) - lichtheid(kolom, rij, 0.1));

const [naarK, naarR] = naar.split(',').map(Number);
const naarRichting = richting(naarK, naarR);

let geraakt = 0;
for (const p of primitieven) {
  // Hoekpunten van de gekozen driehoeken. Een hoekpunt dat ook in een niet-gekozen
  // driehoek zit, zou die mee verkleuren; dat is een fout en geen afronding, want
  // de kits zijn plat geschaduw en hebben per vlak eigen hoekpunten.
  const gekozen = new Set(), gedeeld = new Set();
  for (let t = 0; t < p.idx.length; t += 3) {
    const doel = p.perDriehoek[t / 3] === groep ? gekozen : gedeeld;
    for (const v of [p.idx[t], p.idx[t + 1], p.idx[t + 2]]) doel.add(v);
  }
  const botsing = [...gekozen].filter((v) => gedeeld.has(v));
  if (botsing.length) {
    throw new Error(`${pad}: ${botsing.length} hoekpunt(en) liggen in twee groepen — deze grens is niet per hoekpunt te leggen`);
  }

  const accessor = glb.json.accessors[p.prim.attributes.TEXCOORD_0];
  if (accessor.componentType !== 5126) throw new Error(`${pad}: TEXCOORD_0 is geen float`);
  const bufferView = glb.json.bufferViews[accessor.bufferView];
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stap = bufferView.byteStride ?? 8;

  for (const i of gekozen) {
    const uv = new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + i * stap, 2);
    const x = Math.min(Math.max(uv[0] * atlas.width, 0), atlas.width - 1e-6);
    const y = Math.min(Math.max(uv[1] * atlas.height, 0), atlas.height - 1e-6);
    const vanK = Math.floor(x / celBreed), vanR = Math.floor(y / celHoog);
    if (vanK === naarK && vanR === naarR) continue;
    const uDeel = x / celBreed - vanK;
    const vRuw = y / celHoog - vanR;
    const vDeel = richting(vanK, vanR) !== naarRichting ? 1 - vRuw : vRuw;
    uv[0] = ((naarK + uDeel) * celBreed) / atlas.width;
    uv[1] = ((naarR + vDeel) * celHoog) / atlas.height;
    geraakt++;
  }
}

writeGlb(pad, glb.json, glb.bin, writeFileSync);
const kwijt = perDriehoek.filter((g) => g === null).length;
console.log(`${pad}: ${geraakt} uv's van groep ${groep} naar ${naar}${kwijt ? ` (${kwijt} driehoek(en) niet in de bron gevonden)` : ''}`);
