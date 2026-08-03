/**
 * Grof blokmodel van het hele eiland — alleen de vorm.
 *
 * Draai vanuit de repo-root:  node tools/bouw-eiland.mjs
 *
 * Dit is bewust lelijk. Het beantwoordt één vraag: klopt de vorm, de
 * hoogte-opbouw en de ligging van de zones ten opzichte van elkaar? Er staat
 * geen enkel kit-onderdeel op, er is geen begroeiing, geen pad en geen detail.
 * Alles komt uit eiland/eiland.json; het script zelf bevat geen coördinaten.
 *
 * Wat eruit komt:
 *   eiland/eiland-grof.glb    het terrein + zee + meer, plat geschaduwd
 *   eiland/plattegrond.png    bovenaanzicht met hoogteschaduw en zonemerken
 *
 * De hoogte van een cel is het gewogen gemiddelde van de streefhoogtes van alle
 * zones (dichterbij weegt zwaarder), daarna vermenigvuldigd met een kustaflopende
 * factor, plus wat ruis. Daarna worden de vlakke pads erin gestempeld en de
 * krater en het meer uitgehold. Kleur volgt uit hoogte en steilte, uit dezelfde
 * cellen van kits/colormap.png die de kits gebruiken — er komt geen kleur bij.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UIT = join(ROOT, 'eiland');

const plan = JSON.parse(readFileSync(join(UIT, 'eiland.json'), 'utf8'));

/* -- ruis -----------------------------------------------------------------
 * Waardenruis op een heel raster, met een hash in plaats van een tabel zodat
 * hetzelfde zaad altijd hetzelfde eiland geeft, ongeacht in welke volgorde er
 * gevraagd wordt. Elke zone kan later zijn eigen zaadstroom krijgen; nu is er
 * er maar één, want er wordt nog niets gestrooid.
 */
function hash(ix, iz, zaad) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(zaad | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function waardenRuis(x, z, zaad) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const boven = hash(x0, z0, zaad) + (hash(x0 + 1, z0, zaad) - hash(x0, z0, zaad)) * sx;
  const onder = hash(x0, z0 + 1, zaad) + (hash(x0 + 1, z0 + 1, zaad) - hash(x0, z0 + 1, zaad)) * sx;
  return boven + (onder - boven) * sz;
}

/** Meerdere octaven op elkaar; grof eerst, fijn erbovenop. */
function fbm(x, z, zaad, octaven) {
  let som = 0;
  let gewicht = 0;
  let amplitude = 1;
  let frequentie = 1;
  for (let i = 0; i < octaven; i++) {
    som += waardenRuis(x * frequentie, z * frequentie, zaad + i * 101) * amplitude;
    gewicht += amplitude;
    amplitude *= 0.5;
    frequentie *= 2;
  }
  return som / gewicht;
}

const klem = (v, laag, hoog) => (v < laag ? laag : v > hoog ? hoog : v);
const soepel = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/* -- hoogtekaart ----------------------------------------------------------
 * Eén waarde per rasterpunt. Het raster loopt van -maat/2 tot +maat/2 met
 * stappen van `stap`, dus er zijn (maat/stap + 1) punten per zijde.
 */
const { maat, stap, zaad, kust, ruis } = plan;
const zones = plan.zones;
const N = Math.round(maat / stap) + 1;
const halve = maat / 2;

/** Wereldcoördinaat van rasterindex. */
const wx = (i) => -halve + i * stap;

/**
 * Straal van de kustlijn onder een gegeven hoek. De ruis wordt op een cirkel
 * bemonsterd, zodat hij vanzelf rondloopt en er bij hoek 0 geen naad valt.
 */
function kustStraal(hoek) {
  const k = kust.golflengte;
  /* Twee schalen: de grove maakt baaien en landtongen, de fijne knaagt de lijn
   * stuk zodat hij nergens als een cirkelboog leest. */
  const grof = fbm(Math.cos(hoek) * k + 32, Math.sin(hoek) * k + 32, zaad, 2);
  const fijn = fbm(Math.cos(hoek) * k * 4 + 91, Math.sin(hoek) * k * 4 + 91, zaad + 3, 2);
  const n = grof * 0.75 + fijn * 0.25;
  return kust.straal * (1 - kust.grilligheid / 2 + kust.grilligheid * n);
}

/**
 * Hoeveel ruis er lokaal op mag. Dit is het enige wat nog gewogen wordt
 * gemiddeld over de zones: een vlakke zone naast een ruige wordt geleidelijk
 * ruiger in plaats van met een naad. De hóógte komt niet meer uit deze weging —
 * middelen maakte van elke berg een plateau en van het hele eiland een wig.
 */
function zoneRelief(x, z) {
  let som = 0;
  let gewicht = 0;
  for (const zone of zones) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    const w = 1 / (dx * dx + dz * dz + 60);
    som += (zone.relief ?? 1) * w;
    gewicht += w;
  }
  return som / gewicht;
}

/** Afstand van een punt tot een lijnstuk — voor ruggen en dalen. */
function totSegment(px, pz, [ax, az], [bx, bz]) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 ? klem(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * De landvorm: een flauwe koepel, met daaroverheen de toppen en ruggen. Ze
 * worden met max gecombineerd en niet opgeteld of gemiddeld — optellen laat
 * twee bergen naast elkaar tot één te hoge bult groeien, middelen strijkt ze
 * allebei plat. Max houdt elke top op zijn eigen hoogte en laat op de plek waar
 * twee vormen elkaar snijden een graat achter, wat precies is wat een
 * gefacetteerd terrein nodig heeft.
 */
const landvorm = plan.landvorm;

function landHoogte(x, z, inlandsDeel) {
  let h = landvorm.koepel.hoogte * Math.pow(inlandsDeel, landvorm.koepel.macht);

  for (const top of landvorm.toppen) {
    const d = Math.hypot(x - top.x, z - top.z);
    if (d >= top.straal) continue;
    h = Math.max(h, top.hoogte * Math.pow(1 - d / top.straal, top.macht));
  }

  for (const rug of landvorm.ruggen) {
    const d = totSegment(x, z, rug.van, rug.tot);
    if (d >= rug.breedte) continue;
    h = Math.max(h, rug.hoogte * Math.pow(1 - d / rug.breedte, 1.5));
  }

  /* Dalen tellen niet op maar nemen de diepste: waar twee dalen samenkomen
   * hoort een dalmond te liggen, geen put. En een dal mag de grond wel
   * uitvlakken maar niet doorgraven tot onder zeeniveau — dat zou midden op het
   * eiland een gat slaan. */
  let uitgraven = 0;
  for (const dal of landvorm.dalen) {
    const d = totSegment(x, z, dal.van, dal.tot);
    if (d >= dal.breedte) continue;
    uitgraven = Math.max(uitgraven, dal.diepte * Math.pow(1 - d / dal.breedte, 1.5));
  }

  return Math.max(h - uitgraven, Math.min(h, 0.6));
}

/**
 * Het plafond dat een verticale kust onmogelijk maakt: op `d` eenheden van de
 * kustlijn mag het land hoogstens `d * helling` hoog zijn. De helling zelf
 * verloopt met de hoek, zodat er flauwe baaien naast steile kapen liggen in
 * plaats van één gelijkmatige kegelrok rondom.
 */
function kustPlafond(d, hoek) {
  const k = kust.golflengte;
  const n = fbm(Math.cos(hoek) * k * 1.7 + 61, Math.sin(hoek) * k * 1.7 + 61, zaad + 11, 2);
  const helling = kust.maxHelling * (1 - kust.hellingVariatie / 2 + kust.hellingVariatie * n);
  return d * helling;
}

/** Index van de zone waar dit punt het dichtst bij ligt. */
function dichtstbij(x, z) {
  let beste = 0;
  let besteD = Infinity;
  for (let i = 0; i < zones.length; i++) {
    const d = Math.hypot(x - zones[i].x, z - zones[i].z);
    if (d < besteD) { besteD = d; beste = i; }
  }
  return beste;
}

const hoogte = new Float32Array(N * N);
const isMeer = new Uint8Array(N * N);
const isKrater = new Uint8Array(N * N);

for (let iz = 0; iz < N; iz++) {
  for (let ix = 0; ix < N; ix++) {
    const x = wx(ix);
    const z = wx(iz);
    const r = Math.hypot(x, z);
    const hoek = Math.atan2(z, x);
    const straal = kustStraal(hoek);
    const binnen = straal - r; // eenheden landinwaarts vanaf de kustlijn

    let h;
    if (binnen <= 0) {
      // Zeebodem: loopt door onder water, steeds dieper naar buiten toe.
      h = (binnen / kust.strandbreedte) * kust.zeebodem;
    } else {
      const land = soepel(klem(binnen / kust.strandbreedte, 0, 1));
      const detail = (fbm(x / ruis.golflengte, z / ruis.golflengte, zaad + 7, ruis.octaven) - 0.5) * 2;
      h = landHoogte(x, z, klem(binnen / straal, 0, 1));
      h += detail * ruis.hoogte * zoneRelief(x, z) * land;
      // Geen muur aan zee: het plafond wint altijd.
      h = Math.min(h, kustPlafond(binnen, hoek));
    }

    hoogte[iz * N + ix] = h;
  }
}

/* Zones trekken de grond binnen hun eigen invloed naar hun streefhoogte. Pas
 * hierna, zodat ze de landvorm bijsturen in plaats van hem te bepalen: een
 * kampplek moet vlak liggen, maar mag de berg ernaast niet platslaan. */
for (const zone of zones) {
  const invloed = zone.invloed ?? 0;
  if (!invloed) continue;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const d = Math.hypot(wx(ix) - zone.x, wx(iz) - zone.z);
      if (d > invloed) continue;
      const i = iz * N + ix;
      if (hoogte[i] <= plan.zeeniveau && zone.hoogte > plan.zeeniveau) continue; // niet de zee inlopen
      /* Zwak, en de rand van de invloedscirkel wordt met de ruis vervaagd:
       * trekt een zone te hard, dan staat er een ronde bult in het landschap
       * die de cirkel verraadt. */
      const rafel = 0.75 + fbm(wx(ix) / 9, wx(iz) / 9, zaad + 23, 2) * 0.5;
      const mengen = (1 - soepel(klem((d / invloed) * rafel, 0, 1))) * 0.5;
      hoogte[i] += (zone.hoogte - hoogte[i]) * mengen;
    }
  }
}

/* -- pads, krater en meer -------------------------------------------------
 * Pas ná de basisvorm, want ze moeten de ruis kunnen overschrijven. Een pad is
 * de kern van het ontwerp: binnen de cirkel is de grond exact vlak op een
 * hoogte die op 0.25 valt, zodat er straks een kit-onderdeel op kan staan
 * zonder te zweven. Daarbuiten loopt hij in een halve padbreedte uit.
 */
const snap = (v) => Math.round(v * 4) / 4;

for (const zone of zones) {
  if (!zone.pad) continue;
  const vlak = snap(zone.hoogte);
  const rand = zone.pad * 1.6;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const d = Math.hypot(wx(ix) - zone.x, wx(iz) - zone.z);
      if (d > rand) continue;
      // 1 binnen de pad, glijdt naar 0 op de rand.
      const mengen = 1 - soepel((d - zone.pad) / (rand - zone.pad));
      const i = iz * N + ix;
      hoogte[i] = hoogte[i] + (vlak - hoogte[i]) * mengen;
    }
  }
}

/* De krater moet dieper uithollen dan de kegel over diezelfde afstand zakt,
 * anders blijft het midden het hoogste punt en is de "krater" een bult. Daarom
 * staat de diepte los in de json en is de kegel er vlak van boven op gemaakt
 * (lage macht), zodat de rand echt boven de bodem uitkomt. */
for (const zone of zones) {
  if (!zone.krater) continue;
  const { straal, diepte } = zone.krater;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const d = Math.hypot(wx(ix) - zone.x, wx(iz) - zone.z);
      if (d > straal) continue;
      const i = iz * N + ix;
      hoogte[i] -= (1 - soepel(d / straal)) * diepte;
      if (d < straal * 0.55) isKrater[i] = 1;
    }
  }
}

const meerVlakken = [];
for (const zone of zones) {
  if (!zone.water) continue;
  const spiegel = snap(zone.hoogte - 0.5);
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const d = Math.hypot(wx(ix) - zone.x, wx(iz) - zone.z);
      if (d > zone.water) continue;
      const i = iz * N + ix;
      // Bodem onder de spiegel, dieper naar het midden toe.
      const kom = (1 - soepel(d / zone.water)) * 3.5;
      hoogte[i] = Math.min(hoogte[i], spiegel - 0.2) - kom * 0.4;
      if (d < zone.water * 0.92) isMeer[i] = 1;
    }
  }
  meerVlakken.push({ x: zone.x, z: zone.z, straal: zone.water * 0.92, y: spiegel });
}

/* -- kleur ----------------------------------------------------------------
 * Per driehoek, uit hoogte en steilte. Dit is het enige wat een gegenereerd
 * terrein "echt" laat lezen zonder er iets op te zetten: steile vlakken zijn
 * rots, vlakke zijn begroeid, laag is zand, hoog is kaal.
 */
const cel = plan.cellen;
const uvVan = ([kolom, rij]) => [(kolom + 0.5) / 16, (rij + 0.5) / 4];

function kies(gemiddeld, hellingGraden, krater) {
  if (krater) return cel.lava;
  if (gemiddeld < 0.9) return cel.zand;
  if (hellingGraden > 40) return cel.rots;
  if (gemiddeld > 32) return cel.top;
  if (gemiddeld > 24) return cel.rots;
  if (gemiddeld > 15) return cel.aarde;
  if (gemiddeld > 4) return cel.gras;
  return cel.weide;
}

/* -- driehoeken -----------------------------------------------------------
 * Niet-geïndexeerd: elke driehoek heeft zijn eigen drie hoekpunten met de
 * normaal van het vlak. Dat is precies wat plat schaduwen betekent, en het
 * scheelt een normaal-middeling die de facetten juist glad zou strijken.
 */
function nieuweStapel() {
  return { pos: [], nor: [], uv: [] };
}

function driehoek(stapel, a, b, c, uv) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  for (const p of [a, b, c]) {
    stapel.pos.push(p[0], p[1], p[2]);
    stapel.nor.push(nx, ny, nz);
    stapel.uv.push(uv[0], uv[1]);
  }
  return ny;
}

const terrein = nieuweStapel();

for (let iz = 0; iz < N - 1; iz++) {
  for (let ix = 0; ix < N - 1; ix++) {
    const x0 = wx(ix), x1 = wx(ix + 1);
    const z0 = wx(iz), z1 = wx(iz + 1);
    const h00 = hoogte[iz * N + ix];
    const h10 = hoogte[iz * N + ix + 1];
    const h01 = hoogte[(iz + 1) * N + ix];
    const h11 = hoogte[(iz + 1) * N + ix + 1];

    const a = [x0, h00, z0];
    const b = [x1, h10, z0];
    const c = [x0, h01, z1];
    const d = [x1, h11, z1];

    /* Diep water hoeft geen bodem: die zie je nooit, hij kost driehoeken, en
     * aan de hoeken van het vierkante domein steekt hij onder het ronde
     * zeevlak vandaan. */
    if (h00 < -8 && h10 < -8 && h01 < -8 && h11 < -8) continue;

    const krater = isKrater[iz * N + ix] === 1;

    /* Twee keer: eerst met een voorlopige uv om de helling te meten, dan pas
     * kleuren. Goedkoper is de normaal apart uitrekenen, maar zo blijft het
     * één plek waar een driehoek ontstaat. */
    for (const [p, q, r] of [[a, c, b], [b, c, d]]) {
      const gem = (p[1] + q[1] + r[1]) / 3;
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
      const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      const ny = uz * vx - ux * vz;
      const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1;
      const helling = Math.acos(klem(Math.abs(ny / len), 0, 1)) * 180 / Math.PI;
      driehoek(terrein, p, q, r, uvVan(kies(gem, helling, krater)));
    }
  }
}

/* Zee: één vlak op zeeniveau over het hele domein, plus de meerspiegels.
 * Apart net, zodat het straks los aan of uit kan en een eigen materiaal of
 * animatie kan krijgen. */
const water = nieuweStapel();
const uvWater = uvVan(cel.water);
const zee = plan.zeeniveau;
/**
 * Watervlak als waaier van driehoeken. De volgorde is hoek 1 vóór hoek 0: bij
 * de omgekeerde volgorde wijst de normaal naar beneden en staat het water in
 * het donker.
 */
function schijf(x, y, z, straal, zijden) {
  for (let i = 0; i < zijden; i++) {
    const a0 = (i / zijden) * Math.PI * 2;
    const a1 = ((i + 1) / zijden) * Math.PI * 2;
    driehoek(water,
      [x, y, z],
      [x + Math.cos(a1) * straal, y, z + Math.sin(a1) * straal],
      [x + Math.cos(a0) * straal, y, z + Math.sin(a0) * straal],
      uvWater);
  }
}

/* Ruim over de hoeken van het vierkante domein heen; reikt de zee daar niet
 * tot, dan steekt de zeebodem als een punt buiten het water uit. */
schijf(0, zee, 0, halve * Math.SQRT2 + 10, 48);

for (const meer of meerVlakken) {
  schijf(meer.x, meer.y, meer.z, meer.straal, 16); // stijlgids §2: max 16 per cirkel
}

/* -- glb ------------------------------------------------------------------
 * Twee meshes op twee nodes, één materiaal dat naar de gedeelde colormap wijst.
 * Zonder indices: mode TRIANGLES leest de hoekpunten dan gewoon op volgorde.
 */
function schrijfGlb(pad, netten) {
  const blokken = [];
  const views = [];
  const accessors = [];
  const meshes = [];
  let lengte = 0;

  const voegToe = (waarden, componenten) => {
    const buf = Buffer.alloc(waarden.length * 4);
    for (let i = 0; i < waarden.length; i++) buf.writeFloatLE(Math.fround(waarden[i]), i * 4);
    blokken.push(buf);
    views.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, target: 34962 });
    lengte += buf.length + ((4 - (buf.length % 4)) % 4);
    return views.length - 1;
  };

  for (const net of netten) {
    const aantal = net.pos.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < aantal; i++) {
      for (let c = 0; c < 3; c++) {
        const v = Math.fround(net.pos[i * 3 + c]);
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    const vPos = voegToe(net.pos, 3);
    const vNor = voegToe(net.nor, 3);
    const vUv = voegToe(net.uv, 2);
    const basis = accessors.length;
    accessors.push(
      { bufferView: vPos, componentType: 5126, count: aantal, type: 'VEC3', min, max },
      { bufferView: vNor, componentType: 5126, count: aantal, type: 'VEC3' },
      { bufferView: vUv, componentType: 5126, count: aantal, type: 'VEC2' },
    );
    meshes.push({
      name: net.naam,
      primitives: [{
        attributes: { POSITION: basis, NORMAL: basis + 1, TEXCOORD_0: basis + 2 },
        material: 0,
      }],
    });
  }

  const bin = Buffer.alloc(lengte);
  blokken.forEach((blok, i) => blok.copy(bin, views[i].byteOffset));

  const gltf = {
    asset: {
      generator: 'taaleiland/bouw-eiland.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: plan.versie, soort: 'grofmodel', zaad } },
    },
    scene: 0,
    scenes: [{ nodes: netten.map((_, i) => i), name: 'eiland' }],
    nodes: netten.map((net, i) => ({ mesh: i, name: net.naam })),
    meshes,
    materials: [{
      name: 'colormap',
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: '../kits/colormap.png', name: 'colormap' }],
    samplers: [{ magFilter: 9728, minFilter: 9728 }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const kop = Buffer.alloc(12);
  kop.writeUInt32LE(0x46546c67, 0);
  kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(12 + 8 + jsonPad.length + 8 + bin.length, 8);
  const jsonKop = Buffer.alloc(8);
  jsonKop.writeUInt32LE(jsonPad.length, 0);
  jsonKop.writeUInt32LE(0x4e4f534a, 4);
  const binKop = Buffer.alloc(8);
  binKop.writeUInt32LE(bin.length, 0);
  binKop.writeUInt32LE(0x004e4942, 4);

  writeFileSync(pad, Buffer.concat([kop, jsonKop, jsonPad, binKop, bin]));
  return Buffer.concat([kop, jsonKop, jsonPad, binKop, bin]).length;
}

/* -- plattegrond ----------------------------------------------------------
 * Bovenaanzicht als png, zodat je de vorm kunt beoordelen zonder iets te
 * openen. Kleur uit dezelfde keuze als het terrein, met schaduw uit de helling
 * naar het noordwesten, en een merk op elk zonemiddelpunt.
 */
const CRC = (() => {
  const tabel = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabel[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = tabel[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function schrijfPng(pad, breedte, hoogtePx, rgb) {
  const stapPx = breedte * 3;
  const rauw = Buffer.alloc((stapPx + 1) * hoogtePx);
  for (let y = 0; y < hoogtePx; y++) {
    rauw[y * (stapPx + 1)] = 0; // filter: geen
    rgb.copy(rauw, y * (stapPx + 1) + 1, y * stapPx, (y + 1) * stapPx);
  }
  const brok = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const romp = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(CRC(romp), 0);
    return Buffer.concat([len, romp, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0);
  ihdr.writeUInt32BE(hoogtePx, 4);
  ihdr[8] = 8;  // bits per kanaal
  ihdr[9] = 2;  // rgb
  writeFileSync(pad, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    brok('IHDR', ihdr),
    brok('IDAT', deflateSync(rauw, { level: 9 })),
    brok('IEND', Buffer.alloc(0)),
  ]));
}

const SCHAAL = 4; // pixels per eenheid
const PB = maat * SCHAAL;
const beeld = Buffer.alloc(PB * PB * 3);
const zoneVan = new Int16Array(PB * PB).fill(-1); // -1 = zee

/** Hoogte op een willekeurig punt, bilineair uit het raster. */
function hoogteOp(x, z) {
  const fx = klem((x + halve) / stap, 0, N - 1.001);
  const fz = klem((z + halve) / stap, 0, N - 1.001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const h00 = hoogte[iz * N + ix];
  const h10 = hoogte[iz * N + ix + 1];
  const h01 = hoogte[(iz + 1) * N + ix];
  const h11 = hoogte[(iz + 1) * N + ix + 1];
  return (h00 + (h10 - h00) * tx) + ((h01 + (h11 - h01) * tx) - (h00 + (h10 - h00) * tx)) * tz;
}

const hexNaarRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/* Kleuren voor de plattegrond komen uit palet.json, zodat de kaart en het model
 * dezelfde cellen laten zien. */
const paletCellen = JSON.parse(readFileSync(join(ROOT, 'kits', 'palet.json'), 'utf8'))
  .paletten.find((p) => p.id === 'gedeeld').cellen;
const hexVanCel = ([kolom, rij]) =>
  paletCellen.find((c) => c.cel[0] === kolom && c.cel[1] === rij)?.kleur ?? '#ff00ff';

for (let py = 0; py < PB; py++) {
  for (let px = 0; px < PB; px++) {
    const x = -halve + (px + 0.5) / SCHAAL;
    const z = -halve + (py + 0.5) / SCHAAL;
    const h = hoogteOp(x, z);

    let rgbKleur;
    if (h <= plan.zeeniveau) {
      // Zee: donkerder naarmate het dieper is.
      const diep = klem(-h / 12, 0, 1);
      const basis = hexNaarRgb(hexVanCel(cel.water));
      rgbKleur = basis.map((v) => Math.round(v * (1 - diep * 0.55)));
    } else {
      const dx = hoogteOp(x + 1, z) - hoogteOp(x - 1, z);
      const dz = hoogteOp(x, z + 1) - hoogteOp(x, z - 1);
      const helling = Math.atan(Math.hypot(dx, dz) / 2) * 180 / Math.PI;
      const inMeer = meerVlakken.some((m) => Math.hypot(x - m.x, z - m.z) < m.straal && h < m.y);
      const inKrater = zones.some((zo) => zo.krater && Math.hypot(x - zo.x, z - zo.z) < zo.krater * 0.55);
      const basis = hexNaarRgb(hexVanCel(inMeer ? cel.water : kies(h, helling, inKrater)));
      // Schaduw uit de helling naar het noordwesten.
      const licht = klem(0.72 + (-dx - dz) * 0.10, 0.45, 1.25);
      rgbKleur = basis.map((v) => klem(Math.round(v * licht), 0, 255));
      zoneVan[py * PB + px] = dichtstbij(x, z);
    }

    const i = (py * PB + px) * 3;
    beeld[i] = rgbKleur[0];
    beeld[i + 1] = rgbKleur[1];
    beeld[i + 2] = rgbKleur[2];
  }
}

/* Zonegrenzen: waar de dichtstbijzijnde zone verandert. Puur een hulplijn voor
 * de kaart — het terrein weet er niets van, en de echte zones worden later
 * polygonen. Genoeg om te zien hoe groot elk gebied uitvalt en of er ergens een
 * zone platgedrukt wordt door zijn buren. */
const grens = Buffer.from(beeld);
for (let py = 1; py < PB - 1; py++) {
  for (let px = 1; px < PB - 1; px++) {
    const hier = zoneVan[py * PB + px];
    if (hier < 0) continue;
    if (hier === zoneVan[py * PB + px + 1] && hier === zoneVan[(py + 1) * PB + px]) continue;
    const i = (py * PB + px) * 3;
    for (let c = 0; c < 3; c++) grens[i + c] = klem(Math.round(beeld[i + c] * 0.45), 0, 255);
  }
}
grens.copy(beeld);

function vulBlok(px0, py0, breed, hoog, kleur) {
  for (let py = Math.max(0, py0); py < Math.min(PB, py0 + hoog); py++) {
    for (let px = Math.max(0, px0); px < Math.min(PB, px0 + breed); px++) {
      const i = (py * PB + px) * 3;
      beeld[i] = kleur[0];
      beeld[i + 1] = kleur[1];
      beeld[i + 2] = kleur[2];
    }
  }
}

/* Cijfers 3 x 5. Namen passen niet op deze schaal; het nummer verwijst naar de
 * legenda die het script uitprint. */
const CIJFERS = [
  0b111101101101111, 0b010110010010111, 0b111001111100111, 0b111001111001111,
  0b101101111001001, 0b111100111001111, 0b111100111101111, 0b111001001001001,
  0b111101111101111, 0b111101111001111,
];

function tekenGetal(x, z, getal) {
  const s = 3; // pixels per fontpunt
  const tekens = String(getal).split('');
  const breed = tekens.length * 4 * s - s;
  const hoog = 5 * s;
  let px = Math.round((x + halve) * SCHAAL - breed / 2);
  const py = Math.round((z + halve) * SCHAAL - hoog / 2);
  vulBlok(px - 3, py - 3, breed + 6, hoog + 6, [26, 26, 30]);
  for (const teken of tekens) {
    const masker = CIJFERS[Number(teken)];
    for (let rij = 0; rij < 5; rij++) {
      for (let kolom = 0; kolom < 3; kolom++) {
        if (!((masker >> (14 - (rij * 3 + kolom))) & 1)) continue;
        vulBlok(px + kolom * s, py + rij * s, s, s, [255, 255, 255]);
      }
    }
    px += 4 * s;
  }
}

/* Zonemerken: een open ring op het middelpunt, en een tweede ring op de padrand
 * waar er een pad is. Wit, want geen enkele terreinkleur zit daar in de buurt. */
function ring(x, z, straal, dikte, kleur) {
  const cx = (x + halve) * SCHAAL;
  const cz = (z + halve) * SCHAAL;
  const rp = straal * SCHAAL;
  const van = Math.max(0, Math.floor(cz - rp - dikte));
  const tot = Math.min(PB - 1, Math.ceil(cz + rp + dikte));
  for (let py = van; py <= tot; py++) {
    for (let px = Math.max(0, Math.floor(cx - rp - dikte)); px <= Math.min(PB - 1, Math.ceil(cx + rp + dikte)); px++) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cz);
      if (Math.abs(d - rp) > dikte) continue;
      const i = (py * PB + px) * 3;
      beeld[i] = kleur[0];
      beeld[i + 1] = kleur[1];
      beeld[i + 2] = kleur[2];
    }
  }
}

zones.forEach((zone, i) => {
  if (zone.pad) ring(zone.x, zone.z, zone.pad, 0.9, [255, 255, 255]);
  tekenGetal(zone.x, zone.z, i + 1);
});

/* -- aanzichten -----------------------------------------------------------
 * Een plattegrond laat de indeling zien maar niet de vorm; daarvoor moet je er
 * schuin op kijken. Deze rasteraar tekent precies de driehoeken die ook in de
 * .glb staan, met de kleur die hun uv aanwijst, dus wat je hier ziet is het
 * model en geen tweede weergave ervan.
 *
 * Orthografisch, want een eiland beoordeel je op silhouet en niet op
 * perspectief, en met een z-buffer omdat de bergen voor de zee langs komen.
 */
function celVanUv(u, v) {
  return [Math.round(u * 16 - 0.5), Math.round(v * 4 - 0.5)];
}

function renderAanzicht(hoekGraden, elevatieGraden, breedtePx) {
  const th = (hoekGraden * Math.PI) / 180;
  const ph = (elevatieGraden * Math.PI) / 180;

  // Basis van de camera: f kijkt naar de scène toe.
  const f = [-Math.cos(ph) * Math.cos(th), -Math.sin(ph), -Math.cos(ph) * Math.sin(th)];
  let r = [f[2], 0, -f[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = r.map((v) => v / rl);
  /* f × r, niet r × f: die laatste wijst omlaag en zet het hele eiland
   * ondersteboven — bergen onder water, zeebodem in de lucht. */
  const u = [
    f[1] * r[2] - f[2] * r[1],
    f[2] * r[0] - f[0] * r[2],
    f[0] * r[1] - f[1] * r[0],
  ];

  const opScherm = (p) => [
    p[0] * r[0] + p[1] * r[1] + p[2] * r[2],
    p[0] * u[0] + p[1] * u[1] + p[2] * u[2],
    p[0] * f[0] + p[1] * f[1] + p[2] * f[2],
  ];

  /* Uitsnede op het terrein alleen; het zeevlak steekt ver buiten het eiland en
   * zou het anders wegdrukken. */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < terrein.pos.length; i += 3) {
    const [sx, sy] = opScherm([terrein.pos[i], terrein.pos[i + 1], terrein.pos[i + 2]]);
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }
  const marge = 0.04;
  const schaal = Math.min(
    (breedtePx * (1 - marge * 2)) / (maxX - minX),
    (breedtePx * (1 - marge * 2)) / (maxY - minY),
  );
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const HP = breedtePx;
  const doek = Buffer.alloc(HP * HP * 3);
  for (let i = 0; i < HP * HP; i++) {
    doek[i * 3] = 22; doek[i * 3 + 1] = 24; doek[i * 3 + 2] = 30;
  }
  const diepte = new Float32Array(HP * HP).fill(Infinity);

  const LICHT = (() => {
    const l = [-0.45, 0.82, -0.35];
    const len = Math.hypot(l[0], l[1], l[2]);
    return l.map((v) => v / len);
  })();

  for (const net of [terrein, water]) {
    for (let t = 0; t < net.pos.length; t += 9) {
      const punten = [0, 1, 2].map((k) => {
        const [sx, sy, sz] = opScherm([net.pos[t + k * 3], net.pos[t + k * 3 + 1], net.pos[t + k * 3 + 2]]);
        return [(sx - midX) * schaal + HP / 2, HP / 2 - (sy - midY) * schaal, sz];
      });

      const nx = net.nor[t], ny = net.nor[t + 1], nz = net.nor[t + 2];
      const lambert = klem(nx * LICHT[0] + ny * LICHT[1] + nz * LICHT[2], 0, 1);
      const basis = hexNaarRgb(hexVanCel(celVanUv(net.uv[(t / 3) * 2], net.uv[(t / 3) * 2 + 1])));
      const licht = 0.42 + lambert * 0.75;
      const kleur = basis.map((v) => klem(Math.round(v * licht), 0, 255));

      const [a, b, c] = punten;
      const opp = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(opp) < 1e-9) continue;
      const px0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const px1 = Math.min(HP - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const py0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const py1 = Math.min(HP - 1, Math.ceil(Math.max(a[1], b[1], c[1])));

      for (let py = py0; py <= py1; py++) {
        for (let px = px0; px <= px1; px++) {
          const x = px + 0.5;
          const y = py + 0.5;
          const w0 = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / opp;
          const w1 = ((x - a[0]) * (c[1] - a[1]) - (y - a[1]) * (c[0] - a[0])) / opp;
          if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
          const d = a[2] + (b[2] - a[2]) * w1 + (c[2] - a[2]) * w0;
          const i = py * HP + px;
          if (d >= diepte[i]) continue;
          diepte[i] = d;
          doek[i * 3] = kleur[0];
          doek[i * 3 + 1] = kleur[1];
          doek[i * 3 + 2] = kleur[2];
        }
      }
    }
  }
  return { doek, maat: HP };
}

mkdirSync(UIT, { recursive: true });
terrein.naam = 'terrein';
water.naam = 'water';
const bytes = schrijfGlb(join(UIT, 'eiland-grof.glb'), [terrein, water]);
schrijfPng(join(UIT, 'plattegrond.png'), PB, PB, beeld);

/* Vier hoeken rond het eiland, plus een lage om het silhouet te keuren. */
const AANZICHTEN = [
  { naam: 'zuidoost', hoek: 45, elevatie: 34 },
  { naam: 'zuidwest', hoek: 135, elevatie: 34 },
  { naam: 'noordwest', hoek: 225, elevatie: 34 },
  { naam: 'noordoost', hoek: 315, elevatie: 34 },
  { naam: 'silhouet', hoek: 20, elevatie: 9 },
];
for (const av of AANZICHTEN) {
  const { doek, maat: m } = renderAanzicht(av.hoek, av.elevatie, 640);
  schrijfPng(join(UIT, `aanzicht-${av.naam}.png`), m, m, doek);
}

/* -- verslag --------------------------------------------------------------
 * Wat je wilt weten zonder het model te openen: hoe groot is het, hoe hoog
 * komt het, en staat elke zone waar hij hoort — boven water, binnen de kust.
 */
let hoogst = -Infinity;
let landCellen = 0;
for (let i = 0; i < hoogte.length; i++) {
  if (hoogte[i] > hoogst) hoogst = hoogte[i];
  if (hoogte[i] > plan.zeeniveau) landCellen++;
}

const driehoeken = (terrein.pos.length + water.pos.length) / 9;
console.log(`eiland/eiland-grof.glb — ${maat} x ${maat} eenheden, raster ${stap}`);
console.log(`  ${driehoeken} driehoeken, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  hoogste punt ${hoogst.toFixed(1)}, landoppervlak ${(landCellen * stap * stap).toLocaleString('nl-NL')} eenheden²`);
console.log(`eiland/plattegrond.png — ${PB} x ${PB}\n`);

const problemen = [];
console.log('zone            streef  gemeten  landinw.  plafond');
for (const zone of zones) {
  const gemeten = hoogteOp(zone.x, zone.z);
  const hoek = Math.atan2(zone.z, zone.x);
  const binnen = kustStraal(hoek) - Math.hypot(zone.x, zone.z);
  const plafond = kustPlafond(binnen, hoek);
  console.log(
    `${zone.id.padEnd(14)} ${String(zone.hoogte).padStart(6)}  ${gemeten.toFixed(1).padStart(7)}`
    + `  ${binnen.toFixed(1).padStart(8)}  ${plafond.toFixed(1).padStart(7)}`,
  );
  if (binnen < 0) problemen.push(`${zone.id} ligt buiten de kustlijn (${binnen.toFixed(1)})`);
  if (zone.hoogte > 0 && gemeten < plan.zeeniveau) problemen.push(`${zone.id} staat onder water (${gemeten.toFixed(1)})`);
  if (zone.pad && Math.abs(gemeten - snap(zone.hoogte)) > 0.05) {
    problemen.push(`${zone.id} heeft een pad maar ligt niet vlak (${gemeten.toFixed(2)} i.p.v. ${snap(zone.hoogte)})`);
  }
  /* Het kustplafond wint van de streefhoogte. Ligt een zone te dicht op zee voor
   * de hoogte die hij wil, dan zakt hij stilzwijgend weg; dat moet opvallen. */
  if (zone.hoogte > plafond + 0.5) {
    problemen.push(
      `${zone.id} wil ${zone.hoogte} maar het kustplafond staat maar ${plafond.toFixed(1)} toe`
      + ` — verder landinwaarts zetten of lager maken`,
    );
  }
}

/* Steilste overgang op het hele eiland. Loopt die tegen de 90°, dan staat er
 * ergens alsnog een muur. */
let steilste = 0;
for (let iz = 0; iz < N - 1; iz++) {
  for (let ix = 0; ix < N - 1; ix++) {
    const h = hoogte[iz * N + ix];
    const dx = Math.abs(hoogte[iz * N + ix + 1] - h);
    const dz = Math.abs(hoogte[(iz + 1) * N + ix] - h);
    steilste = Math.max(steilste, Math.max(dx, dz) / stap);
  }
}
console.log(`\nsteilste overgang: ${(Math.atan(steilste) * 180 / Math.PI).toFixed(0)}°`);

if (problemen.length) {
  console.log(`\n${problemen.length} probleem(en):`);
  for (const p of problemen) console.log(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log('\nGeen problemen.');
}
