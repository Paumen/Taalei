/**
 * Herstelt de kleurbanden van kits/dungeon na de schade van het importeren.
 *
 * Draai vanuit de repo-root:  node tools/herstel-dungeon.mjs <map-met-gltf>
 * (dezelfde bronmap als tools/importeer-dungeon.mjs: de Assets/gltf-map van
 * KayKit's Dungeon Asset Pack, met ../textures/dungeon_texture.png ernaast.)
 *
 * Wat er mis was: de import zette elke vertex apart over naar de dichtstbij-
 * zijnde kleur in de gedeelde colormap. De bron bakt zijn schaduwen in de
 * textuur, dus de kleuren van één materiaal vormen een verloop — en dat
 * verloop ligt in kleurruimte langs meerdere banden tegelijk. De lichte kant
 * van het koper landde zo in de ene band, de donkere kant in een andere, en
 * omdat de hoekpunten per driehoek ontkoppeld zijn wipte elk vlak onafhankelijk
 * tussen die banden: de driehoekige kleurglitches in de catalogus.
 *
 * De herstelaanpak kiest niet per vertex maar per MATERIAAL: alle driehoeken
 * die hetzelfde stuk van de brontextuur bemonsteren (een "eiland": een
 * aaneengesloten, kleur-continu gebied) krijgen samen één band, de band
 * waarin de hele kleurverdeling van het eiland het best past. Binnen die band
 * krijgt elke vertex de rij die het dichtst bij zijn échte bronkleur ligt,
 * zodat de gebakken schaduw als verticale positie in de band blijft bestaan —
 * precies zoals de Kenney-kits hun banden zelf gebruiken.
 *
 * Alleen de TEXCOORD_0-bytes van de .glb's veranderen; geometrie, normalen
 * en materialen blijven byte-voor-byte gelijk. Draait het script nogmaals,
 * dan komt er exact hetzelfde uit. Draai daarna tools/build-catalog.mjs voor
 * de kleurstalen in catalog.json: die leest ze uit de modellen zelf.
 *
 * Dit script staat bewust op zichzelf (eigen GLB-, glTF- en PNG-lezer) en
 * deelt geen code met de importeurs die de schade veroorzaakten.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'dungeon');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');
const KOLOMMEN = 16;
const RIJEN = 4;

/**
 * Vastgeprikte bandkeuzes, per eiland (gesleuteld op de meest voorkomende
 * bronkleur van dat eiland). Voor deze drie had geen enkele band een goede
 * pasvorm, dus daar is met de hand gekozen (besluit PO, augustus 2026):
 *
 * - #d36d33 — het felle oranje van de flesjes en sierranden. Automatisch won
 *   7,0 (steenrood, "de flesjes worden rood"); 5,0 houdt de terracotta-toon
 *   en de schaduwdiepte van de bron.
 * - #f37681 / #f47d86 — de binnenkant van het vlees op de borden. Automatisch
 *   won 3,0 (roze), maar dat oogde snoeproze; 7,0 geeft het rode vlees van
 *   de bron terug.
 */
const VASTGEPRIKT = {
  '#d36d33': '5,0',
  '#f37681': '7,0',
  '#f47d86': '7,0',
};

/* Boven deze gemiddelde kleurafstand heeft een eiland geen echte thuisbasis
 * in de colormap en verdient de keuze een blik van een mens. */
const AANDACHTSGRENS = 50;

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/herstel-dungeon.mjs <map-met-gltf-en-bin>');
  process.exit(1);
}

/* -- GLB / glTF lezen en schrijven ---------------------------------------- */

function leesGlb(pad) {
  const buf = readFileSync(pad);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`geen GLB: ${pad}`);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`eerste chunk is geen JSON: ${pad}`);
  const jsonLengte = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLengte).toString('utf8'));
  let bin = null;
  let offset = 20 + jsonLengte;
  while (offset + 8 <= buf.length) {
    const lengte = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === 0x004e4942) bin = buf.subarray(offset + 8, offset + 8 + lengte);
    offset += 8 + lengte;
  }
  return { json, bin };
}

function schrijfGlb(pad, json, bin) {
  const vulling = (n, m) => (m - (n % m)) % m;
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(vulling(jsonBuf.length, 4), 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(vulling(bin.length, 4), 0)]);
  const kop = Buffer.alloc(12);
  kop.writeUInt32LE(0x46546c67, 0);
  kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const jsonKop = Buffer.alloc(8);
  jsonKop.writeUInt32LE(jsonChunk.length, 0);
  jsonKop.writeUInt32LE(0x4e4f534a, 4);
  const binKop = Buffer.alloc(8);
  binKop.writeUInt32LE(binChunk.length, 0);
  binKop.writeUInt32LE(0x004e4942, 4);
  writeFileSync(pad, Buffer.concat([kop, jsonKop, jsonChunk, binKop, binChunk]));
}

function leesGltf(pad) {
  const json = JSON.parse(readFileSync(pad, 'utf8'));
  if (!json.buffers || json.buffers.length !== 1) throw new Error(`${pad}: verwacht één buffer`);
  const bin = readFileSync(join(dirname(pad), decodeURIComponent(json.buffers[0].uri)));
  return { json, bin };
}

const COMPONENT = {
  5120: { Soort: Int8Array, maat: 1 },
  5121: { Soort: Uint8Array, maat: 1 },
  5122: { Soort: Int16Array, maat: 2 },
  5123: { Soort: Uint16Array, maat: 2 },
  5125: { Soort: Uint32Array, maat: 4 },
  5126: { Soort: Float32Array, maat: 4 },
};
const ONDERDELEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function leesAccessor({ json, bin }, index) {
  const acc = json.accessors[index];
  if (acc.sparse) throw new Error('sparse accessor wordt niet ondersteund');
  const { Soort, maat } = COMPONENT[acc.componentType];
  const breedte = ONDERDELEN[acc.type];
  const bv = json.bufferViews[acc.bufferView];
  const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stap = bv.byteStride ?? breedte * maat;
  const uit = new Float64Array(acc.count * breedte);
  for (let i = 0; i < acc.count; i++) {
    const rij = new Soort(bin.buffer, bin.byteOffset + start + i * stap, breedte);
    for (let k = 0; k < breedte; k++) uit[i * breedte + k] = rij[k];
  }
  return { data: uit, breedte, count: acc.count };
}

/** Waar een accessor in de binaire buffer begint, om ter plekke te schrijven. */
function ligging({ json }, index) {
  const acc = json.accessors[index];
  const { maat } = COMPONENT[acc.componentType];
  const breedte = ONDERDELEN[acc.type];
  const bv = json.bufferViews[acc.bufferView];
  return {
    start: (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0),
    stap: bv.byteStride ?? breedte * maat,
    count: acc.count,
  };
}

/* -- PNG lezen (8-bit, niet-interlaced; RGB/RGBA/grijs/palet) -------------- */

function leesPng(pad) {
  const buf = readFileSync(pad);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`geen PNG: ${pad}`);
  let offset = 8;
  let ihdr = null;
  let palet = null;
  const idat = [];
  while (offset < buf.length) {
    const lengte = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + lengte);
    if (type === 'IHDR') {
      ihdr = {
        breedte: data.readUInt32BE(0),
        hoogte: data.readUInt32BE(4),
        bitdiepte: data[8],
        kleurtype: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palet = Buffer.from(data);
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + lengte;
  }
  if (!ihdr) throw new Error(`PNG zonder IHDR: ${pad}`);
  if (ihdr.interlace !== 0 || ihdr.bitdiepte !== 8) {
    throw new Error(`PNG-variant wordt niet ondersteund: ${pad}`);
  }
  const kanalen = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.kleurtype];
  if (!kanalen) throw new Error(`kleurtype ${ihdr.kleurtype} wordt niet ondersteund: ${pad}`);

  const ruw = inflateSync(Buffer.concat(idat));
  const rijBytes = ihdr.breedte * kanalen;
  const uit = Buffer.alloc(ihdr.hoogte * rijBytes);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < ihdr.hoogte; y++) {
    const filter = ruw[y * (rijBytes + 1)];
    const bronStart = y * (rijBytes + 1) + 1;
    const doelStart = y * rijBytes;
    for (let x = 0; x < rijBytes; x++) {
      const byte = ruw[bronStart + x];
      const links = x >= kanalen ? uit[doelStart + x - kanalen] : 0;
      const boven = y > 0 ? uit[doelStart + x - rijBytes] : 0;
      const bovenLinks = y > 0 && x >= kanalen ? uit[doelStart + x - rijBytes - kanalen] : 0;
      let v;
      switch (filter) {
        case 0: v = byte; break;
        case 1: v = byte + links; break;
        case 2: v = byte + boven; break;
        case 3: v = byte + ((links + boven) >> 1); break;
        case 4: v = byte + paeth(links, boven, bovenLinks); break;
        default: throw new Error(`onbekend PNG-filter ${filter}`);
      }
      uit[doelStart + x] = v & 0xff;
    }
  }

  const pixels = Buffer.alloc(ihdr.breedte * ihdr.hoogte * 4);
  for (let i = 0; i < ihdr.breedte * ihdr.hoogte; i++) {
    let r, g, b, a = 255;
    if (ihdr.kleurtype === 2) [r, g, b] = [uit[i * 3], uit[i * 3 + 1], uit[i * 3 + 2]];
    else if (ihdr.kleurtype === 6) [r, g, b, a] = [uit[i * 4], uit[i * 4 + 1], uit[i * 4 + 2], uit[i * 4 + 3]];
    else if (ihdr.kleurtype === 0) r = g = b = uit[i];
    else if (ihdr.kleurtype === 4) { r = g = b = uit[i * 2]; a = uit[i * 2 + 1]; }
    else { const p = uit[i] * 3; [r, g, b] = [palet[p], palet[p + 1], palet[p + 2]]; }
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  }
  return { breedte: ihdr.breedte, hoogte: ihdr.hoogte, pixels };
}

/* -- kleuren --------------------------------------------------------------- */

/** Dezelfde "redmean"-benadering als tools/build-catalog.mjs gebruikt. */
function kleurAfstand(a, b) {
  const rGemiddeld = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (2 + rGemiddeld / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rGemiddeld) / 256) * db * db,
  );
}

const naarHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/* -- banden uit de colormap ------------------------------------------------ */

const colormap = leesPng(COLORMAP);
const banden = new Map(); // 'kolom,rij' → [{kleur, u, v}]
{
  const celBreed = colormap.breedte / KOLOMMEN;
  const celHoog = colormap.hoogte / RIJEN;
  for (let rij = 0; rij < RIJEN; rij++) {
    for (let kolom = 0; kolom < KOLOMMEN; kolom++) {
      const x = Math.floor(kolom * celBreed + celBreed / 2);
      const punten = [];
      for (let i = 0; i < celHoog; i++) {
        const y = Math.floor(rij * celHoog) + i;
        const p = (y * colormap.breedte + x) * 4;
        const kleur = [colormap.pixels[p], colormap.pixels[p + 1], colormap.pixels[p + 2]];
        if (kleur[0] === 0 && kleur[1] === 0 && kleur[2] === 0) continue;
        punten.push({ kleur, u: (x + 0.5) / colormap.breedte, v: (y + 0.5) / colormap.hoogte });
      }
      if (punten.length) banden.set(`${kolom},${rij}`, punten);
    }
  }
}

/* -- modellen koppelen aan hun bron ---------------------------------------- */

const textuur = leesPng(join(bronMap, '..', 'textures', 'dungeon_texture.png'));
const W = textuur.breedte;
const H = textuur.hoogte;
const texel = (u, v) => [
  Math.min(W - 1, Math.max(0, Math.floor(u * W))),
  Math.min(H - 1, Math.max(0, Math.floor(v * H))),
];
const bronPixel = (x, y) => {
  const i = (y * W + x) * 4;
  return [textuur.pixels[i], textuur.pixels[i + 1], textuur.pixels[i + 2]];
};

const bronNamen = Object.fromEntries(
  readdirSync(bronMap).filter((f) => f.endsWith('.gltf'))
    .map((f) => [f.replace(/\.gltf$/, '').toLowerCase().replace(/_/g, '-'), f.replace(/\.gltf$/, '')]),
);

/* De import bewaarde de driehoeksvolgorde exact: na het ontkoppelen is
 * hoekpunt j van de kit-primitive het j-de element van de bronindexlijst.
 * Dat is geverifieerd op de POSITION-data (bit-identiek), en hieronder wordt
 * het per model opnieuw gecontroleerd voordat er iets wordt geschreven. */
const modellen = [];
for (const bestand of readdirSync(KIT).filter((f) => f.endsWith('.glb')).sort()) {
  const naam = bestand.replace(/\.glb$/, '');
  const bronNaam = bronNamen[naam];
  if (!bronNaam) throw new Error(`geen bronmodel voor ${naam}`);
  const bron = leesGltf(join(bronMap, `${bronNaam}.gltf`));
  const kitGlb = leesGlb(join(KIT, bestand));
  if (bron.json.meshes.length !== kitGlb.json.meshes.length) {
    throw new Error(`${naam}: ${kitGlb.json.meshes.length} meshes in de kit, `
      + `${bron.json.meshes.length} in de bron — is de juiste pack-versie gebruikt?`);
  }
  const primitives = [];
  for (let m = 0; m < kitGlb.json.meshes.length; m++) {
    if (bron.json.meshes[m].primitives.length !== kitGlb.json.meshes[m].primitives.length) {
      throw new Error(`${naam}: mesh ${m} heeft ${kitGlb.json.meshes[m].primitives.length} primitives `
        + `in de kit en ${bron.json.meshes[m].primitives.length} in de bron`);
    }
    for (let p = 0; p < kitGlb.json.meshes[m].primitives.length; p++) {
      const bronPrim = bron.json.meshes[m].primitives[p];
      const kitPrim = kitGlb.json.meshes[m].primitives[p];
      const bronIdx = leesAccessor(bron, bronPrim.indices);
      const bronUv = leesAccessor(bron, bronPrim.attributes.TEXCOORD_0);
      const bronPos = leesAccessor(bron, bronPrim.attributes.POSITION);
      const kitPos = leesAccessor(kitGlb, kitPrim.attributes.POSITION);
      if (kitPos.count !== bronIdx.count) throw new Error(`${naam}: hoekpuntaantal wijkt af van de bron`);
      for (let j = 0; j < kitPos.count; j++) {
        const bi = bronIdx.data[j];
        for (let k = 0; k < 3; k++) {
          if (kitPos.data[j * 3 + k] !== bronPos.data[bi * 3 + k]) {
            throw new Error(`${naam}: hoekpunt ${j} ligt niet op zijn bronpositie`);
          }
        }
      }
      const uvs = new Float64Array(bronIdx.count * 2);
      for (let j = 0; j < bronIdx.count; j++) {
        uvs[j * 2] = bronUv.data[bronIdx.data[j] * 2];
        uvs[j * 2 + 1] = bronUv.data[bronIdx.data[j] * 2 + 1];
      }
      primitives.push({ uvAccessor: kitPrim.attributes.TEXCOORD_0, uvs, count: bronIdx.count });
    }
  }
  modellen.push({ naam, bestand, primitives });
}
console.log(`${modellen.length} modellen gekoppeld aan hun bron`);

/* -- eilanden: aaneengesloten, kleur-continue stukken van de brontextuur ---
 * Eerst markeren welke texels de modellen echt bemonsteren (elke UV-driehoek
 * gerasterd met een pixel speling), daarna aaneengesloten gebieden zoeken
 * waarbinnen buren qua kleur op elkaar lijken: een verloop is continu, een
 * grens tussen twee materialen is een sprong.
 */
const SPRONG = 60;
const gemarkeerd = new Uint8Array(W * H);
for (const model of modellen) {
  for (const prim of model.primitives) {
    for (let t = 0; t + 2 < prim.count; t += 3) {
      const P = [0, 1, 2].map((k) => texel(prim.uvs[(t + k) * 2], prim.uvs[(t + k) * 2 + 1]));
      const x0 = Math.max(0, Math.min(...P.map((p) => p[0])) - 1);
      const x1 = Math.min(W - 1, Math.max(...P.map((p) => p[0])) + 1);
      const y0 = Math.max(0, Math.min(...P.map((p) => p[1])) - 1);
      const y1 = Math.min(H - 1, Math.max(...P.map((p) => p[1])) + 1);
      const [a, b, c] = P;
      const noemer = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (noemer !== 0) {
            const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / noemer;
            const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / noemer;
            if (l1 < -0.15 || l2 < -0.15 || 1 - l1 - l2 < -0.15) continue;
          }
          gemarkeerd[y * W + x] = 1;
        }
      }
    }
  }
}

const eiland = new Int32Array(W * H).fill(-1);
let aantalEilanden = 0;
{
  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      if (!gemarkeerd[sy * W + sx] || eiland[sy * W + sx] !== -1) continue;
      const id = aantalEilanden++;
      let kop = 0;
      let staart = 0;
      qx[staart] = sx;
      qy[staart] = sy;
      staart++;
      eiland[sy * W + sx] = id;
      while (kop < staart) {
        const x = qx[kop];
        const y = qy[kop];
        kop++;
        const kleur = bronPixel(x, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!gemarkeerd[j] || eiland[j] !== -1) continue;
          if (kleurAfstand(kleur, bronPixel(nx, ny)) > SPRONG) continue;
          eiland[j] = id;
          qx[staart] = nx;
          qy[staart] = ny;
          staart++;
        }
      }
    }
  }
}
console.log(`${aantalEilanden} eilanden in de brontextuur`);

/* -- per eiland de best passende band kiezen ------------------------------- */

const telling = Array.from({ length: aantalEilanden }, () => ({ hoekpunten: 0, kleuren: new Map() }));
for (const model of modellen) {
  for (const prim of model.primitives) {
    prim.eilandVan = new Int32Array(prim.count);
    prim.bronKleur = [];
    for (let j = 0; j < prim.count; j++) {
      const [x, y] = texel(prim.uvs[j * 2], prim.uvs[j * 2 + 1]);
      prim.eilandVan[j] = eiland[y * W + x];
      const kleur = bronPixel(x, y);
      prim.bronKleur.push(kleur);
      const t = telling[prim.eilandVan[j]];
      t.hoekpunten++;
      const sleutel = naarHex(kleur);
      if (!t.kleuren.has(sleutel)) t.kleuren.set(sleutel, { kleur, aantal: 0 });
      t.kleuren.get(sleutel).aantal++;
    }
  }
}

const keuze = new Array(aantalEilanden).fill(null);
for (let id = 0; id < aantalEilanden; id++) {
  const t = telling[id];
  if (!t.hoekpunten) continue;
  const dominant = naarHex([...t.kleuren.values()].sort((a, b) => b.aantal - a.aantal)[0].kleur);
  if (VASTGEPRIKT[dominant]) {
    if (!banden.has(VASTGEPRIKT[dominant])) {
      throw new Error(`vastgeprikt ${dominant} → ${VASTGEPRIKT[dominant]}: die band bestaat niet`);
    }
    keuze[id] = { band: VASTGEPRIKT[dominant], dominant, vastgeprikt: true };
    continue;
  }
  let beste = null;
  for (const [band, punten] of banden) {
    let kosten = 0;
    for (const { kleur, aantal } of t.kleuren.values()) {
      let d = Infinity;
      for (const punt of punten) d = Math.min(d, kleurAfstand(kleur, punt.kleur));
      kosten += d * aantal;
    }
    kosten /= t.hoekpunten;
    if (!beste || kosten < beste.kosten) beste = { band, kosten };
  }
  keuze[id] = { ...beste, dominant };
  if (beste.kosten > AANDACHTSGRENS) {
    console.warn(`  ! eiland ${dominant} (${t.hoekpunten} hoekpunten) past nergens goed: `
      + `band ${beste.band}, afstand ${beste.kosten.toFixed(0)} — overweeg VASTGEPRIKT of een nieuwe band`);
  }
}

/* -- UV's herschrijven ------------------------------------------------------ */

let herschreven = 0;
let totaal = 0;
for (const model of modellen) {
  const glb = leesGlb(join(KIT, model.bestand));
  const bin = Buffer.from(glb.bin);
  for (const prim of model.primitives) {
    const lig = ligging(glb, prim.uvAccessor);
    if (lig.count !== prim.count) throw new Error(`${model.naam}: UV-accessor wijkt af`);

    /* Een hoekpunt waarvan de texel precies op een materiaalgrens ligt kan in
     * het verkeerde eiland vallen; de meerderheid van zijn driehoek wint. De
     * hoekpunten zijn bij de import al ontkoppeld, dus driehoeken zijn vrij
     * om onafhankelijk te kiezen. */
    const definitief = Int32Array.from(prim.eilandVan);
    for (let t = 0; t + 2 < prim.count; t += 3) {
      const ids = [definitief[t], definitief[t + 1], definitief[t + 2]];
      if (ids[0] === ids[1] && ids[1] === ids[2]) continue;
      let meerderheid = ids[0];
      if (ids[1] === ids[2]) meerderheid = ids[1];
      else if (ids[0] !== ids[1] && ids[0] !== ids[2]) {
        meerderheid = ids.reduce((a, b) => (telling[b].hoekpunten > telling[a].hoekpunten ? b : a));
      }
      for (let k = 0; k < 3; k++) definitief[t + k] = meerderheid;
    }

    for (let j = 0; j < prim.count; j++) {
      totaal++;
      const gekozen = keuze[definitief[j]];
      const punten = banden.get(gekozen.band);
      let beste = punten[0];
      let besteAfstand = Infinity;
      for (const punt of punten) {
        const d = kleurAfstand(prim.bronKleur[j], punt.kleur);
        if (d < besteAfstand) {
          besteAfstand = d;
          beste = punt;
        }
      }
      const positie = lig.start + j * lig.stap;
      const oudU = bin.readFloatLE(positie);
      const oudV = bin.readFloatLE(positie + 4);
      if (Math.abs(oudU - beste.u) > 1e-6 || Math.abs(oudV - beste.v) > 1e-6) herschreven++;
      bin.writeFloatLE(beste.u, positie);
      bin.writeFloatLE(beste.v, positie + 4);
    }
  }
  schrijfGlb(join(KIT, model.bestand), glb.json, bin);
}
console.log(`${modellen.length} modellen herschreven: ${herschreven} van ${totaal} UV's aangepast`);

console.log('klaar; draai nu tools/build-catalog.mjs');
