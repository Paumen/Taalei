/**
 * Herstelt de kleurbanden van een geïmporteerde kit — de veralgemening van
 * tools/herstel-dungeon.mjs voor de overige packs met gebakken schaduwen.
 *
 * Draai vanuit de repo-root:  node tools/herstel-kit.mjs <kit> <map-met-gltf>
 * bijvoorbeeld:               node tools/herstel-kit.mjs resources ~/KayKit_ResourceBits/Assets/gltf
 *
 * Zie herstel-dungeon.mjs voor het volledige verhaal. Kort: de import koos
 * per vertex de dichtstbijzijnde kleur in de gedeelde colormap, waardoor het
 * gebakken schaduwverloop van één materiaal over meerdere banden versplinterde
 * en de vlakken als losse driehoeken tussen die banden wipten. Dit script
 * kiest per materiaal-eiland van de brontextuur één band en zet de schaduw om
 * naar verticale positie binnen die band.
 *
 * Anders dan herstel-dungeon.mjs zoekt dit script de bron niet op naam maar op
 * GEOMETRIE: van elke bron-primitive wordt de POSITION-data langs de indexlijst
 * uitgeklapt en gehasht, en elke kit-primitive wordt via diezelfde hash aan
 * zijn bron gekoppeld. Hernoemingen, samengevoegde modellen of een andere
 * mesh-selectie kunnen zo nooit stilletjes de verkeerde bron aanwijzen: een
 * kit-primitive zonder byte-gelijke bron is een harde fout. Een pack met
 * meerdere texturen kan ook: eilanden worden per textuur bijgehouden.
 *
 * Alleen de TEXCOORD_0-bytes veranderen; nogmaals draaien geeft byte-gelijke
 * uitvoer. kits/palet.json wordt bijgewerkt; draai daarna tools/build-catalog.mjs.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');
const PALET = join(ROOT, 'kits', 'palet.json');
const KOLOMMEN = 16;
const RIJEN = 4;

/**
 * Vastgeprikte bandkeuzes per kit, gesleuteld op de meest voorkomende
 * bronkleur van een eiland (zie herstel-dungeon.mjs). Vul aan wanneer het
 * script een eiland meldt dat nergens goed past of wanneer de automatische
 * keuze er in de render naast zit; een pin wint altijd van de automaat.
 */
const VASTGEPRIKT = {
  resources: {
    // Goud: automatisch won 13,0 (perzik) — 6,0 is de goudband van de colormap.
    '#d6a04a': '6,0',
    '#daa54c': '6,0',
    '#d29a47': '6,0',
    '#d19946': '6,0',
    // Koper: de automaat koos 5,0 en dat klopt (zie de dungeon-flesjes);
    // vastgeprikt zodat de melding "past nergens goed" niet blijft terugkomen.
    '#944127': '5,0',
  },
  rpgtools: {
    // Goud van kompas en instrumenten, zelfde verhaal als resources.
    '#dca84e': '6,0',
    // Perkament van de kaarten: automatisch won 13,0 (perzik); 5,3 is de
    // lichte crèmeband die de bron benadert. Het donkere deel van het
    // perkamentverloop is in de textuur een eigen eiland en moet mee.
    '#bba489': '5,3',
    '#ab9273': '5,3',
    '#ac9374': '5,3',
    '#c5b197': '5,3',
    '#a88e6e': '5,3',
  },
  forest: {},
  props: {
    // Het houtverloop van de pack valt in de textuur in meerdere eilanden;
    // twee donkere stukken kozen zelf een rodere band (12,0 en 8,0) en
    // trokken een streep over ton en tafel. Alles hout naar 14,0.
    '#7b5c3a': '14,0',
    '#5b4024': '14,0',
  },
};

/* Boven deze gemiddelde kleurafstand past een eiland nergens echt en verdient
 * de keuze een blik van een mens. */
const AANDACHTSGRENS = 50;

const [kitNaam, bronMap] = process.argv.slice(2);
if (!kitNaam || !bronMap) {
  console.error('gebruik: node tools/herstel-kit.mjs <kit> <map-met-gltf-en-bin>');
  process.exit(1);
}
if (!(kitNaam in VASTGEPRIKT)) {
  console.error(`onbekende kit "${kitNaam}" — bekend: ${Object.keys(VASTGEPRIKT).join(', ')} `
    + '(voeg de kit toe aan VASTGEPRIKT, desnoods met een leeg object)');
  process.exit(1);
}
const KIT = join(ROOT, 'kits', kitNaam);
const pins = VASTGEPRIKT[kitNaam];

/* -- GLB / glTF lezen en schrijven (zelfde lezers als herstel-dungeon.mjs) -- */

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

/* -- PNG lezen (8-bit, niet-interlaced) ------------------------------------ */

function leesPng(pad) {
  // Een FBX2glTF-omzetting draagt zijn textuur als data-URI in de glTF zelf.
  const buf = pad.startsWith('data:image/png;base64,')
    ? Buffer.from(pad.slice('data:image/png;base64,'.length), 'base64')
    : readFileSync(pad);
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

/** Dezelfde "redmean"-benadering als tools/build-catalog.mjs. */
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
const banden = new Map();
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

/* -- bronregister: hash van uitgeklapte posities → bron-primitive ----------
 * De import klapte elke primitive uit langs zijn indexlijst (ontvlecht) en
 * kopieerde de floats byte-voor-byte. De uitgeklapte POSITION-bytes zijn dus
 * een vingerafdruk die bron en kit delen, wat de naamgeving of samenvoeging
 * ook deed.
 */
const texturen = new Map(); // pad → {png, offset} (eiland-ids per textuur)
const bronIndex = new Map(); // hash → {uvs (uitgeklapt), textuurPad}

/**
 * De textuur van één primitive, via zijn materiaal. Een pack kan meerdere
 * afbeeldingen dragen (rpgtools) of modellen zonder textuur meeleveren
 * (forest's `_Mesh`-varianten naast de `_Color1`-varianten); een primitive
 * zonder baseColorTexture doet niet mee en levert null op.
 */
function textuurVan(gltfPad, json, prim) {
  if (prim.material === undefined) return null;
  const index = json.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (index === undefined) return null;
  const image = json.images?.[json.textures?.[index]?.source];
  if (!image?.uri) return null;
  if (image.uri.startsWith('data:')) return image.uri; // data-URI is zijn eigen sleutel
  return resolve(dirname(gltfPad), decodeURIComponent(image.uri));
}

for (const bestand of readdirSync(bronMap).filter((f) => f.endsWith('.gltf')).sort()) {
  const pad = join(bronMap, bestand);
  const bron = leesGltf(pad);
  for (const mesh of bron.json.meshes) {
    for (const prim of mesh.primitives) {
      if (prim.indices === undefined || prim.attributes.TEXCOORD_0 === undefined) continue;
      const textuurPad = textuurVan(pad, bron.json, prim);
      // Een primitive zonder textuur (het glas van het kompas) heeft één
      // vlakke materiaalkleur; die doet als kleur van al zijn hoekpunten mee.
      let vlakKleur = null;
      let vlakAlpha = 1;
      if (!textuurPad) {
        const factor = bron.json.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorFactor;
        if (!factor) continue;
        // baseColorFactor is lineair; texels zijn sRGB, dus omrekenen.
        vlakKleur = factor.slice(0, 3).map((l) =>
          Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055)));
        vlakAlpha = factor[3] ?? 1;
      }
      const idx = leesAccessor(bron, prim.indices);
      const pos = leesAccessor(bron, prim.attributes.POSITION);
      const uv = leesAccessor(bron, prim.attributes.TEXCOORD_0);
      const posUit = new Float32Array(idx.count * 3);
      const uvUit = new Float64Array(idx.count * 2);
      for (let j = 0; j < idx.count; j++) {
        const i = idx.data[j];
        posUit[j * 3] = pos.data[i * 3];
        posUit[j * 3 + 1] = pos.data[i * 3 + 1];
        posUit[j * 3 + 2] = pos.data[i * 3 + 2];
        uvUit[j * 2] = uv.data[i * 2];
        uvUit[j * 2 + 1] = uv.data[i * 2 + 1];
      }
      // De ruwe (niet-uitgeklapte) UV's, voor kits die hun hoekpunten nog
      // delen: daar staat de vertexdata in de bronvolgorde.
      const uvRaw = Float64Array.from(uv.data);
      const hash = createHash('sha256').update(Buffer.from(posUit.buffer)).digest('hex');
      // Kleurvarianten delen hun geometrie en verschillen alleen in UV's
      // (Fuel_A_Barrel naast Fuel_B_Barrel); daarom kan één vingerafdruk
      // meerdere kandidaten hebben. Bij het koppelen kiest de modelnaam.
      if (!bronIndex.has(hash)) bronIndex.set(hash, []);
      bronIndex.get(hash).push({
        naam: bestand.replace(/\.gltf$/, '').toLowerCase().replace(/_/g, '-'),
        uvs: uvUit,
        uvRaw,
        textuurPad,
        vlakKleur,
        vlakAlpha,
      });
    }
  }
}
console.log(`${bronIndex.size} bron-primitives geregistreerd`);

/* -- kitmodellen koppelen -------------------------------------------------- */

const modellen = [];
const zonderBron = [];
modelLus:
for (const bestand of readdirSync(KIT).filter((f) => f.endsWith('.glb')).sort()) {
  const naam = bestand.replace(/\.glb$/, '');
  const glb = leesGlb(join(KIT, bestand));
  const primitives = [];
  for (let m = 0; m < glb.json.meshes.length; m++) {
    for (let p = 0; p < glb.json.meshes[m].primitives.length; p++) {
      const prim = glb.json.meshes[m].primitives[p];
      if (prim.attributes.TEXCOORD_0 === undefined) continue;
      const pos = leesAccessor(glb, prim.attributes.POSITION);
      const idx = prim.indices !== undefined ? leesAccessor(glb, prim.indices) : null;
      const n = idx ? idx.count : pos.count;
      const posUit = new Float32Array(n * 3);
      for (let j = 0; j < n; j++) {
        const i = idx ? idx.data[j] : j;
        posUit[j * 3] = pos.data[i * 3];
        posUit[j * 3 + 1] = pos.data[i * 3 + 1];
        posUit[j * 3 + 2] = pos.data[i * 3 + 2];
      }
      const hash = createHash('sha256').update(Buffer.from(posUit.buffer)).digest('hex');
      const kandidaten = bronIndex.get(hash);
      if (!kandidaten) {
        // Een model zonder byte-gelijke bron (tools/voeg-samen.mjs verschuift
        // hoekpunten bij het samenvoegen) blijft heel het model ongemoeid;
        // beter niets doen dan op een gok hermappen.
        zonderBron.push(naam);
        continue modelLus;
      }
      let bron = kandidaten[0];
      if (kandidaten.length > 1) {
        // Zelfde vorm, meerdere kleurvarianten: de kitnaam draagt de bronnaam
        // (de importeurs maken er kebab-case van), dus die wijst de variant
        // aan. Een exacte naam wint van een gedeeltelijke ("map-empty" is
        // exact "map-empty", niet een variant van "map").
        const exact = kandidaten.filter((k) => naam === k.naam);
        const opNaam = exact.length === 1
          ? exact
          : kandidaten.filter((k) => naam.includes(k.naam) || k.naam.includes(naam));
        if (opNaam.length !== 1) {
          throw new Error(`${naam}: ${kandidaten.length} bronvarianten met dezelfde geometrie `
            + `(${kandidaten.map((k) => k.naam).join(', ')}) en de naam wijst er niet precies één aan`);
        }
        bron = opNaam[0];
      }
      /* Twee smaken kit: de packs met gebakken schaduw zijn bij de import
       * ontkoppeld (elke driehoek eigen hoekpunten, UV-aantal = uitgeklapt
       * aantal), de overige kits delen hun hoekpunten nog en staan in de
       * bronvolgorde (UV-aantal = ruw bronaantal). */
      const uvCount = leesAccessor(glb, prim.attributes.TEXCOORD_0).count;
      let gedeeld;
      if (uvCount === n) gedeeld = false;
      else if (uvCount * 2 === bron.uvRaw.length) gedeeld = true;
      else throw new Error(`${naam}: ${uvCount} UV's passen noch bij uitgeklapt (${n}) noch bij de bron (${bron.uvRaw.length / 2})`);
      primitives.push({ uvAccessor: prim.attributes.TEXCOORD_0, bron, count: uvCount, gedeeld });
    }
  }
  modellen.push({ naam, bestand, primitives });
}
console.log(`${modellen.length} kitmodellen gekoppeld aan hun bron`);
if (zonderBron.length) {
  console.warn(`  ! overgeslagen, geen byte-gelijke bron (samengevoegd model?): ${zonderBron.join(', ')}`);
}

/* -- eilanden per textuur --------------------------------------------------- */

const SPRONG = 60;
for (const pad of new Set(modellen.flatMap((m) => m.primitives.map((p) => p.bron.textuurPad)).filter(Boolean))) {
  texturen.set(pad, { png: leesPng(pad), eiland: null });
}

let eilandTotaal = 0;
for (const [, info] of texturen) {
  const { png } = info;
  const W = png.breedte;
  const H = png.hoogte;
  const gemarkeerd = new Uint8Array(W * H);
  const texel = (u, v) => [
    Math.min(W - 1, Math.max(0, Math.floor(u * W))),
    Math.min(H - 1, Math.max(0, Math.floor(v * H))),
  ];
  info.texel = texel;
  const pixel = (x, y) => {
    const i = (y * W + x) * 4;
    return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]];
  };
  info.pixel = pixel;

  for (const model of modellen) {
    for (const prim of model.primitives) {
      if (texturen.get(prim.bron.textuurPad) !== info) continue;
      const uvs = prim.bron.uvs;
      const nUit = uvs.length / 2;
      for (let t = 0; t + 2 < nUit; t += 3) {
        const P = [0, 1, 2].map((k) => texel(uvs[(t + k) * 2], uvs[(t + k) * 2 + 1]));
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
  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      if (!gemarkeerd[sy * W + sx] || eiland[sy * W + sx] !== -1) continue;
      const id = eilandTotaal++;
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
        const kleur = pixel(x, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!gemarkeerd[j] || eiland[j] !== -1) continue;
          if (kleurAfstand(kleur, pixel(nx, ny)) > SPRONG) continue;
          eiland[j] = id;
          qx[staart] = nx;
          qy[staart] = ny;
          staart++;
        }
      }
    }
  }
  info.eiland = eiland;
}
console.log(`${eilandTotaal} eilanden in ${texturen.size} textu(u)r(en)`);

/* -- per eiland de best passende band kiezen -------------------------------
 * Primitives zonder textuur krijgen per vlakke kleur een eigen "eiland".
 */
const vlakEiland = new Map();
for (const model of modellen) {
  for (const prim of model.primitives) {
    if (!prim.bron.vlakKleur) continue;
    const sleutel = naarHex(prim.bron.vlakKleur);
    if (!vlakEiland.has(sleutel)) vlakEiland.set(sleutel, eilandTotaal++);
  }
}

const telling = Array.from({ length: eilandTotaal }, () => ({ hoekpunten: 0, kleuren: new Map() }));
for (const model of modellen) {
  for (const prim of model.primitives) {
    const info = texturen.get(prim.bron.textuurPad);
    const bronUvs = prim.gedeeld ? prim.bron.uvRaw : prim.bron.uvs;
    prim.eilandVan = new Int32Array(prim.count);
    prim.bronKleur = [];
    for (let j = 0; j < prim.count; j++) {
      let kleur;
      if (info) {
        const [x, y] = info.texel(bronUvs[j * 2], bronUvs[j * 2 + 1]);
        prim.eilandVan[j] = info.eiland[y * info.png.breedte + x];
        kleur = info.pixel(x, y);
      } else {
        prim.eilandVan[j] = vlakEiland.get(naarHex(prim.bron.vlakKleur));
        kleur = prim.bron.vlakKleur;
      }
      prim.bronKleur.push(kleur);
      const t = telling[prim.eilandVan[j]];
      t.hoekpunten++;
      const sleutel = naarHex(kleur);
      if (!t.kleuren.has(sleutel)) t.kleuren.set(sleutel, { kleur, aantal: 0 });
      t.kleuren.get(sleutel).aantal++;
    }
  }
}

const keuze = new Array(eilandTotaal).fill(null);
for (let id = 0; id < eilandTotaal; id++) {
  const t = telling[id];
  if (!t.hoekpunten) continue;
  const dominant = naarHex([...t.kleuren.values()].sort((a, b) => b.aantal - a.aantal)[0].kleur);
  if (pins[dominant]) {
    if (!banden.has(pins[dominant])) {
      throw new Error(`vastgeprikt ${dominant} → ${pins[dominant]}: die band bestaat niet`);
    }
    keuze[id] = { band: pins[dominant], dominant, vastgeprikt: true };
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

const perCel = new Map();
let herschreven = 0;
let totaal = 0;
for (const model of modellen) {
  const glb = leesGlb(join(KIT, model.bestand));
  const bin = Buffer.from(glb.bin);

  /* Een doorzichtige bron-primitive (het glas van het kompas, alpha < 1)
   * heeft de import op de dekkende colormap gelegd — een witte schijf die
   * de wijzerplaat eronder verbergt. Die krijgt zijn doorzichtigheid terug
   * met een eigen materiaal zonder textuur. */
  let mi = 0;
  for (let m = 0; m < glb.json.meshes.length; m++) {
    for (const kitPrim of glb.json.meshes[m].primitives) {
      if (kitPrim.attributes.TEXCOORD_0 === undefined) continue;
      const prim = model.primitives[mi++];
      if (!prim.bron.vlakKleur || prim.bron.vlakAlpha >= 1) continue;
      glb.json.materials = glb.json.materials ?? [];
      let glas = glb.json.materials.findIndex((mat) => mat.name === 'glas');
      if (glas === -1) {
        glas = glb.json.materials.push({
          name: 'glas',
          pbrMetallicRoughness: {
            baseColorFactor: [...prim.bron.vlakKleur.map((v) => (v / 255) ** 2.2), prim.bron.vlakAlpha],
            metallicFactor: 0,
            roughnessFactor: 0.5,
          },
          alphaMode: 'BLEND',
          doubleSided: true,
        }) - 1;
      }
      kitPrim.material = glas;
    }
  }

  for (const prim of model.primitives) {
    const lig = ligging(glb, prim.uvAccessor);
    if (lig.count !== prim.count) throw new Error(`${model.naam}: UV-accessor wijkt af`);

    /* De meerderheids-correctie per driehoek kan alleen bij ontkoppelde
     * hoekpunten; bij gedeelde hoekpunten raakt één hoekpunt meerdere
     * driehoeken en beslist zijn eigen texel. */
    const definitief = Int32Array.from(prim.eilandVan);
    for (let t = 0; !prim.gedeeld && t + 2 < prim.count; t += 3) {
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

      if (!perCel.has(gekozen.band)) perCel.set(gekozen.band, new Set());
      perCel.get(gekozen.band).add(model.naam);
    }
  }
  schrijfGlb(join(KIT, model.bestand), glb.json, bin);
}
console.log(`${modellen.length} modellen herschreven: ${herschreven} van ${totaal} UV's aangepast`);

/* -- nabehandeling van modellen zonder bron ---------------------------------
 * Een samengevoegd model (tools/voeg-samen.mjs) heeft geen byte-gelijke bron
 * meer en kan niet langs de eilanden. Zijn kleuren kunnen wél per band mee
 * verhuizen met de rest van de kit: dezelfde rij in een andere band. En zijn
 * cellen moeten hoe dan ook in kits/palet.json blijven staan, anders slaat
 * het kleurfilter hem over.
 */
const NABEHANDELING = {
  'props/bucket-a': { '12,0': '14,0' }, // het hout van de emmer mee naar de houtband
};
for (const naam of zonderBron) {
  const glb = leesGlb(join(KIT, `${naam}.glb`));
  const bin = Buffer.from(glb.bin);
  const verhuis = NABEHANDELING[`${kitNaam}/${naam}`] ?? {};
  let verhuisd = 0;
  for (const mesh of glb.json.meshes) {
    for (const prim of mesh.primitives) {
      if (prim.attributes.TEXCOORD_0 === undefined) continue;
      const lig = ligging(glb, prim.attributes.TEXCOORD_0);
      for (let j = 0; j < lig.count; j++) {
        const positie = lig.start + j * lig.stap;
        const u = bin.readFloatLE(positie);
        const v = bin.readFloatLE(positie + 4);
        let cel = `${Math.floor(Math.min(0.999, u) * KOLOMMEN)},${Math.floor(Math.min(0.999, v) * RIJEN)}`;
        if (verhuis[cel]) {
          const doel = verhuis[cel];
          const [kolomBron, rijBron] = cel.split(',').map(Number);
          const [kolomDoel, rijDoel] = doel.split(',').map(Number);
          if (!banden.has(doel)) throw new Error(`nabehandeling ${naam}: band ${doel} bestaat niet`);
          bin.writeFloatLE(banden.get(doel)[0].u, positie);
          bin.writeFloatLE(Math.fround(v + (rijDoel - rijBron) / RIJEN), positie + 4);
          verhuisd++;
          cel = doel;
        }
        if (!perCel.has(cel)) perCel.set(cel, new Set());
        perCel.get(cel).add(naam);
      }
    }
  }
  if (verhuisd) {
    schrijfGlb(join(KIT, `${naam}.glb`), glb.json, bin);
    console.log(`${naam}: ${verhuisd} UV's meeverhuisd naar de banden van de kit`);
  }
}

/* Volledige eilandtabel voor wie een pin wil zetten: sleutel (dominante
 * kleur), gekozen band en omvang, grootste eerst. */
writeFileSync(`herstel-${kitNaam}-eilanden.json`, `${JSON.stringify(
  keuze.map((k, id) => (k && telling[id].hoekpunten
    ? { dominant: k.dominant, band: k.band, kosten: +(k.kosten ?? 0).toFixed(1), hoekpunten: telling[id].hoekpunten, vastgeprikt: !!k.vastgeprikt }
    : null)).filter(Boolean).sort((a, b) => b.hoekpunten - a.hoekpunten),
  null, 1)}\n`);

/* -- kits/palet.json bijwerken ---------------------------------------------- */

const paletJson = JSON.parse(readFileSync(PALET, 'utf8'));
const gedeeld = paletJson.paletten.find((p) => p.id === 'gedeeld');
if (!gedeeld) throw new Error('kits/palet.json heeft geen palet "gedeeld"');

for (const cel of gedeeld.cellen) {
  const sleutel = cel.cel.join(',');
  const modellenInCel = perCel.get(sleutel);
  const index = cel.bronnen.findIndex((b) => b.kit === kitNaam);
  if (!modellenInCel) {
    if (index !== -1) cel.bronnen.splice(index, 1);
    continue;
  }
  if (index === -1) cel.bronnen.push({ kit: kitNaam, modellen: [...modellenInCel].sort() });
  else cel.bronnen[index].modellen = [...modellenInCel].sort();
  perCel.delete(sleutel);
}
if (perCel.size) {
  throw new Error(`cellen niet in kits/palet.json: ${[...perCel.keys()].join(' ')}`);
}
writeFileSync(PALET, `${JSON.stringify(paletJson, null, 1)}\n`);
console.log('kits/palet.json bijgewerkt; draai nu tools/build-catalog.mjs');
