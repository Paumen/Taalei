/**
 * Bouwt de blockout van de strandzone uit de verticale plak (draft_spec.md).
 *
 * Draai vanuit de repo-root:  node tools/bouw-blockout.mjs
 *
 * Een blockout is geen asset maar een indeling: waar ligt het kamp, hoe breed is
 * de kreek, staat de vuurtoren ver genoeg weg om een landmark te zijn. Alles wat
 * erin staat komt uit de bestaande kits; alleen het terrein wordt hier getekend,
 * en dat is niet meer dan een paar platte vlakken en zijkanten.
 *
 * Er komen twee bestanden uit, dezelfde indeling in twee standen uit plak §5:
 *   blockout/strand-vaag.glb    het bos staat er, plat in één kleur
 *   blockout/strand-scherp.glb  het bos heeft zijn eigen kleuren en zijn kleine props
 * Naast elkaar bekeken laten ze zien wat het kind ziet veranderen op het moment
 * dat de brug klaar is.
 *
 * Anders dan bouw-molen.mjs wordt hier niets platgeslagen. Elk kitmodel blijft
 * één mesh en elke plaatsing is een eigen node met eigen verplaatsing, draai en
 * schaal. Dat is voor een blockout het punt: je wilt een prop kunnen verzetten
 * zonder de geometrie aan te raken. Het kost wel een tekenopdracht per plaatsing
 * — dat is voor een blockout prima en voor de echte zone niet.
 *
 * Maten in rastereenheden, zoals asset_style_guide.md §4: één wandsegment is
 * 1 × 1, wandhoogte 1. Het eiland ligt in x 0..24, z 0..32, met de zee aan de
 * kant van kleine z en het bos aan de kant van grote z.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const UIT = join(ROOT, 'blockout');

/* -- .glb inlezen ---------------------------------------------------------
 * Genoeg om de Kenney-bestanden te lezen: één buffer, losse accessors, node-
 * transforms die in de hoekpunten gebakken worden. Meer hoeft niet.
 */
const COMPONENTEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const LEZERS = {
  5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2],
  5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4],
};

function leesGlb(pad) {
  const buf = readFileSync(pad);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`geen geldige GLB: ${pad}`);
  }
  const eind = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= eind) {
    const lengte = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + lengte);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + lengte;
  }
  if (!json) throw new Error(`geen JSON-chunk: ${pad}`);
  return { json, bin };
}

function leesAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  const componenten = COMPONENTEN[accessor.type];
  const [lezer, breedte] = LEZERS[accessor.componentType];
  const view = json.bufferViews[accessor.bufferView];
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const basis = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stap = view.byteStride ?? componenten * breedte;

  const uit = new Float64Array(accessor.count * componenten);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < componenten; c++) {
      uit[i * componenten + c] = dv[lezer](basis + i * stap + c * breedte, true);
    }
  }
  return uit;
}

function maalMatrix(a, b) {
  const r = new Array(16).fill(0);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      r[kolom * 4 + rij] = som;
    }
  }
  return r;
}

function samenstellen({ t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1] }) {
  const [x, y, z, w] = r;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

const EENHEID = samenstellen({});
const nodeMatrix = (node) => node.matrix
  ?? samenstellen({ t: node.translation, r: node.rotation, s: node.scale });

/**
 * Eén kitmodel als één mesh, met de node-transforms er al in gebakken en de
 * primitives achter elkaar geplakt. De kits hebben allemaal hetzelfde materiaal,
 * dus er gaat bij dat samenvoegen niets verloren.
 */
const gelezen = new Map();
function leesModel(pad, vlakkeCel) {
  const sleutel = vlakkeCel ? `${pad}#${vlakkeCel}` : pad;
  if (gelezen.has(sleutel)) return gelezen.get(sleutel);
  const { json, bin } = leesGlb(join(KITS, `${pad}.glb`));
  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];

  const loop = (index, ouder) => {
    const node = json.nodes[index];
    const wereld = maalMatrix(ouder, nodeMatrix(node));
    // De normaalmatrix mag hier de matrix zelf zijn: de kits bevatten alleen
    // verplaatsing, draai en gelijkmatige schaal, en die laten hoeken heel.
    for (const prim of json.meshes?.[node.mesh]?.primitives ?? []) {
      const basis = posities.length / 3;
      const pos = leesAccessor(json, bin, prim.attributes.POSITION);
      const nor = leesAccessor(json, bin, prim.attributes.NORMAL);
      const uv = leesAccessor(json, bin, prim.attributes.TEXCOORD_0);
      for (let i = 0; i < pos.length / 3; i++) {
        const [x, y, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
        posities.push(
          wereld[0] * x + wereld[4] * y + wereld[8] * z + wereld[12],
          wereld[1] * x + wereld[5] * y + wereld[9] * z + wereld[13],
          wereld[2] * x + wereld[6] * y + wereld[10] * z + wereld[14],
        );
        const [a, b, c] = [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
        const nx = wereld[0] * a + wereld[4] * b + wereld[8] * c;
        const ny = wereld[1] * a + wereld[5] * b + wereld[9] * c;
        const nz = wereld[2] * a + wereld[6] * b + wereld[10] * c;
        const lengte = Math.hypot(nx, ny, nz) || 1;
        normalen.push(nx / lengte, ny / lengte, nz / lengte);
        uvs.push(uv[i * 2], uv[i * 2 + 1]);
      }
      for (const j of leesAccessor(json, bin, prim.indices)) indices.push(basis + j);
    }
    for (const kind of node.children ?? []) loop(kind, wereld);
  };
  for (const index of json.scenes[json.scene ?? 0].nodes) loop(index, EENHEID);

  // Alle uv's naar één cel: het model houdt zijn vorm, maar verliest zijn kleuren
  // en daarmee zijn detail. Dat is wat "vager" hier betekent.
  if (vlakkeCel) {
    const [u, v] = uvVanCel(CEL[vlakkeCel]);
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] = u;
      uvs[i + 1] = v;
    }
  }

  const model = { posities, normalen, uvs, indices };
  gelezen.set(sleutel, model);
  return model;
}

/* -- paletcellen ----------------------------------------------------------
 * De colormap is een raster van 16 × 4 cellen, elke cel een verticale
 * verloopstrook (zie kits/palet.json). Het terrein wil één vlakke kleur per
 * vlak, dus alle hoekpunten van een vlak wijzen naar hetzelfde punt: het midden
 * van de cel.
 */
const CEL = {
  zee: [15, 3],     // #6d738a
  zand: [5, 3],     // #f0c59d
  aarde: [12, 0],   // #995a41
  bos: [5, 1],      // #3da679
  bosVaag: [3, 2],  // #9da4c4
};
/* Vaag is bewust de lichtste cel die er is en niet de donkerste. Donker leest
 * als een ander materiaal — asfalt — en dus als iets wat er hoort te zijn. Licht
 * en ontkleurd leest als afstand: er ligt daar iets, je ziet het nog niet. */
const uvVanCel = ([kolom, rij]) => [(kolom + 0.5) / 16, (rij + 0.5) / 4];

/* -- de scene -------------------------------------------------------------
 * `terrein` is de enige mesh die hier getekend wordt; `plaatsingen` zijn
 * verwijzingen naar kitmodellen met een eigen matrix.
 */
let terrein;
let plaatsingen;

function vlak([x0, z0], [x1, z1], y, cel) {
  const [u, v] = uvVanCel(cel);
  const basis = terrein.posities.length / 3;
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
    terrein.posities.push(x, y, z);
    terrein.normalen.push(0, 1, 0);
    terrein.uvs.push(u, v);
  }
  terrein.indices.push(basis, basis + 2, basis + 1, basis, basis + 3, basis + 2);
}

/** Bovenkant plus vier zijkanten; een bodem heeft een blockout niet nodig. */
function blok([x0, z0], [x1, z1], y0, y1, celTop, celZij) {
  vlak([x0, z0], [x1, z1], y1, celTop);
  const [u, v] = uvVanCel(celZij);
  const zijden = [
    [[x0, z0], [x1, z0], [0, 0, -1]],
    [[x1, z1], [x0, z1], [0, 0, 1]],
    [[x1, z0], [x1, z1], [1, 0, 0]],
    [[x0, z1], [x0, z0], [-1, 0, 0]],
  ];
  for (const [[ax, az], [bx, bz], normaal] of zijden) {
    const basis = terrein.posities.length / 3;
    for (const [x, y, z] of [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]]) {
      terrein.posities.push(x, y, z);
      terrein.normalen.push(...normaal);
      terrein.uvs.push(u, v);
    }
    terrein.indices.push(basis, basis + 1, basis + 2, basis, basis + 2, basis + 3);
  }
}

/**
 * @param {string} pad     kit/model, zonder .glb
 * @param {number[]} plek  [x, z] in rastereenheden
 * @param {object} opties  y hoogte, draai in graden om de y-as, schaal,
 *   cel  naam uit CEL; plat naar die ene kleur, voor de vage stand
 */
function zet(pad, [x, z], { y = STRAND_TOP, draai = 0, schaal = 1, cel = null } = {}) {
  const half = (draai * Math.PI) / 360;
  plaatsingen.push({
    pad,
    cel,
    sleutel: cel ? `${pad}#${cel}` : pad,
    naam: `${pad.split('/')[1]}-${plaatsingen.length}`,
    translation: [x, y, z],
    rotation: [0, Math.sin(half), 0, Math.cos(half)],
    scale: [schaal, schaal, schaal],
  });
}

/* -- indeling -------------------------------------------------------------
 * Plak §2: aankomst op het strand, het kamp erop, de kreek als grens, het bos
 * erachter. De brug over de kreek is de doorgang.
 *
 * De hoogtes liggen dicht bij elkaar. Het bos ligt bewust niet hoger dan het
 * strand: de kreek is de scheiding, niet een hoogteverschil. Een plateau zou de
 * brug een klim maken en dat is een ladder, geen brug.
 */
const ZEE_TOP = 0.10;
const STRAND_TOP = 0.55;
/* De kreek is drie eenheden breed en niet twee. Bij twee is hij vanaf de lage
 * camera uit het game design (§9) niet te zien: je kijkt tegen de rand van het
 * strand aan en het water valt erachter weg. De hindernis moet zichtbaar zijn
 * vóór de brug er ligt, anders is er niets om op te lossen. */
const KREEK = [19.5, 22.5];
const BRUG_X = 12;

function bouwTerrein({ bosScherp }) {
  // Water onder alles door: waar geen land ligt, is het water.
  vlak([0, 0], [24, 32], ZEE_TOP, CEL.zee);
  // Strand.
  blok([2, 6], [22, KREEK[0]], 0, STRAND_TOP, CEL.zand, CEL.aarde);
  // Bos.
  blok([1, KREEK[1]], [23, 31], 0, STRAND_TOP,
    bosScherp ? CEL.bos : CEL.bosVaag, bosScherp ? CEL.aarde : CEL.bosVaag);
}

function bouwStrand() {
  // Startkamp. Bij elkaar, maar niet in een rij: het moet een plek zijn waar
  // iemand is aangekomen, niet een uitstalling.
  zet('survival-kit/tent-canvas', [6.0, 12.0], { draai: 20 });
  zet('survival-kit/campfire-pit', [8.2, 12.8]);
  zet('survival-kit/chest', [5.0, 13.8], { draai: -25 });
  zet('survival-kit/bucket', [8.9, 11.9]);
  zet('survival-kit/fence', [7.0, 10.4], { draai: 8 });
  zet('survival-kit/fence', [8.0, 10.5], { draai: -6 });

  // Aangespoeld drijfhout: de grondstof, verspreid over het strand zodat het
  // hakken ergens over gaat.
  const drijfhout = [
    [12.0, 15.0, 40], [14.5, 17.2, -20], [10.2, 17.5, 70],
    [16.0, 13.0, 15], [13.2, 10.6, -55], [17.8, 16.4, 95],
    [9.4, 15.8, -80], [18.6, 11.4, 130],
  ];
  for (const [x, z, draai] of drijfhout) zet('survival-kit/resource-planks', [x, z], { draai });

  // Rotsen langs de waterlijn, zodat de rand van het strand geen rechte snee is.
  zet('survival-kit/rock-sand-a', [3.6, 7.2], { draai: 30 });
  zet('survival-kit/rock-sand-c', [9.0, 6.9], { draai: 120 });
  zet('survival-kit/rock-sand-b', [15.4, 7.0], { draai: -40 });
  zet('survival-kit/rock-sand-a', [19.4, 7.8], { draai: 200 });
  zet('survival-kit/rock-sand-b', [21.0, 15.0], { draai: 60, schaal: 0.8 });

  // Vuurtoren op een rotsplaat: het landmark waaraan het kind de zone herkent,
  // ver genoeg van het kamp om er niet bij te horen.
  zet('survival-kit/rock-flat', [19.6, 10.4]);
  zet('taalei-kit/lighthouse', [19.6, 10.4], { y: STRAND_TOP + 0.39 });

  // Wat gras waar het strand het bos raakt.
  for (const [x, z] of [[4.5, 18.6], [11.0, 19.0], [16.4, 18.8], [20.0, 18.2]]) {
    zet('survival-kit/grass', [x, z]);
  }
}

/**
 * De brug is de doorgang en dus het duurste dat het kind bouwt. Op ware grootte
 * is het brugdeel uit mini-forest daar te klein voor: op een strand van 20 breed
 * valt een dek van 0.8 weg. Iets groter, drie delen achter elkaar, en hij ligt
 * met beide uiteinden een halve eenheid op de oever.
 */
function bouwBrug() {
  const midden = (KREEK[0] + KREEK[1]) / 2;
  for (const verschuif of [-1.35, 0, 1.35]) {
    zet('mini-forest/bridge', [BRUG_X, midden + verschuif], { y: 0.18, draai: 90, schaal: 1.3 });
  }
}

/**
 * Het bos staat er in beide standen. Game design §3: het hele eiland is vanaf
 * het begin te zien, geen mist en geen sloten — wat nog niet gedaan is, is
 * vager. Vager is niet weg. Een leeg groen vlak vertelt het kind niet dat daar
 * een bos ligt, en dan is er ook niets om naartoe te willen.
 *
 * Vaag is hier dus: dezelfde bomen op dezelfde plek, maar plat in de kleur van
 * het terrein eromheen. Je ziet de vorm, je ziet niet wat het is. De kleine
 * props blijven wel weg; die zijn te klein om als silhouet iets te doen.
 */
function bouwBos({ scherp }) {
  const cel = scherp ? null : 'bosVaag';

  const bomen = [
    [5.0, 26.0, 0], [8.5, 24.2, 40], [16.0, 25.5, -30],
    [20.0, 27.5, 70], [11.0, 28.6, 15], [6.5, 29.5, -60], [18.5, 23.4, 100],
    [3.4, 24.6, 25], [21.6, 30.0, -15],
  ];
  for (const [x, z, draai] of bomen) zet('mini-forest/tree', [x, z], { draai, cel });

  for (const [x, z, draai] of [[12.6, 24.8, 0], [9.6, 27.2, 50], [15.2, 29.2, -25], [4.2, 28.0, 80]]) {
    zet('mini-forest/tree-high', [x, z], { draai, cel });
  }

  zet('mini-forest/rocks-low', [21.4, 24.6], { draai: 20, cel });
  zet('mini-forest/rocks-low', [2.6, 27.4], { draai: -35, cel });

  if (!scherp) return;
  for (const [x, z] of [[10.0, 23.2], [13.8, 26.4], [7.2, 25.6], [17.6, 27.8], [19.2, 24.6], [6.0, 22.8], [14.6, 22.6]]) {
    zet('mini-forest/plant', [x, z]);
  }
}

/* -- wegschrijven ---------------------------------------------------------
 * Eén mesh per gebruikt kitmodel plus het terrein, en een node per plaatsing.
 * Alles deelt hetzelfde materiaal, dat net als de kits naar Textures/colormap.png
 * wijst — hier een map hoger, want de blockout staat niet in kits/.
 */
function schrijfGlb(naam, { bosScherp }) {
  terrein = { posities: [], normalen: [], uvs: [], indices: [] };
  plaatsingen = [];

  bouwTerrein({ bosScherp });
  bouwStrand();
  // De brug is het enige dat het kind zelf neerzet. In de vage stand ligt hij er
  // dus niet: dat is de stand vóór het bouwen, en met een brug die er al ligt is
  // er niets meer op te lossen.
  if (bosScherp) bouwBrug();
  bouwBos({ scherp: bosScherp });

  // Mesh 0 is het terrein; daarna één mesh per uniek kitmodel. Hetzelfde model
  // in twee kleurstanden is twee meshes: de uv's zitten in de hoekpunten.
  const sleutels = [...new Map(plaatsingen.map((p) => [p.sleutel, p])).values()];
  const meshVan = new Map(sleutels.map((p, i) => [p.sleutel, i + 1]));
  const modellen = [terrein, ...sleutels.map((p) => leesModel(p.pad, p.cel))];

  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];
  const stukken = [];

  for (const model of modellen) {
    const hoekVanaf = posities.length / 3;
    const indexVanaf = indices.length;
    posities.push(...model.posities);
    normalen.push(...model.normalen);
    uvs.push(...model.uvs);
    for (const j of model.indices) indices.push(hoekVanaf + j);
    stukken.push({
      hoekVanaf,
      hoeken: posities.length / 3 - hoekVanaf,
      indexVanaf,
      aantal: indices.length - indexVanaf,
    });
  }

  const aantal = posities.length / 3;
  const groteIndices = aantal > 65535;
  const posBuf = Buffer.alloc(aantal * 12);
  const norBuf = Buffer.alloc(aantal * 12);
  const uvBuf = Buffer.alloc(aantal * 8);
  for (let i = 0; i < aantal; i++) {
    for (let c = 0; c < 3; c++) {
      posBuf.writeFloatLE(Math.fround(posities[i * 3 + c]), i * 12 + c * 4);
      norBuf.writeFloatLE(Math.fround(normalen[i * 3 + c]), i * 12 + c * 4);
    }
    uvBuf.writeFloatLE(Math.fround(uvs[i * 2]), i * 8);
    uvBuf.writeFloatLE(Math.fround(uvs[i * 2 + 1]), i * 8 + 4);
  }

  for (const stuk of stukken) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = stuk.hoekVanaf; v < stuk.hoekVanaf + stuk.hoeken; v++) {
      for (let c = 0; c < 3; c++) {
        const waarde = Math.fround(posities[v * 3 + c]);
        min[c] = Math.min(min[c], waarde);
        max[c] = Math.max(max[c], waarde);
      }
    }
    Object.assign(stuk, { min, max });
  }

  // De indices van elke mesh beginnen bij nul, zodat de accessor bij het eigen
  // venster op de hoekpuntenbuffer hoort.
  const idxBuf = Buffer.alloc(indices.length * (groteIndices ? 4 : 2));
  for (const stuk of stukken) {
    for (let i = stuk.indexVanaf; i < stuk.indexVanaf + stuk.aantal; i++) {
      const waarde = indices[i] - stuk.hoekVanaf;
      if (groteIndices) idxBuf.writeUInt32LE(waarde, i * 4);
      else idxBuf.writeUInt16LE(waarde, i * 2);
    }
  }

  const blokken = [posBuf, norBuf, uvBuf, idxBuf];
  const views = [];
  let lengte = 0;
  for (const blok of blokken) {
    views.push({ buffer: 0, byteOffset: lengte, byteLength: blok.length });
    lengte += blok.length + ((4 - (blok.length % 4)) % 4);
  }
  const bin = Buffer.alloc(lengte);
  blokken.forEach((blok, i) => blok.copy(bin, views[i].byteOffset));

  const nodes = [
    { mesh: 0, name: 'terrein' },
    ...plaatsingen.map((p) => ({
      mesh: meshVan.get(p.sleutel),
      name: p.naam,
      translation: p.translation.map(Math.fround),
      rotation: p.rotation.map(Math.fround),
      ...(p.scale[0] === 1 ? {} : { scale: p.scale.map(Math.fround) }),
    })),
  ];

  const gltf = {
    asset: {
      generator: 'taaleiland/bouw-blockout.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, bron: 'blockout', zone: 'strand', stand: bosScherp ? 'scherp' : 'vaag' } },
    },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i), name: naam }],
    nodes,
    meshes: ["terrein", ...sleutels.map((p) => p.sleutel)].map((bron, i) => ({
      name: bron,
      primitives: [{
        attributes: { POSITION: i * 3, NORMAL: i * 3 + 1, TEXCOORD_0: i * 3 + 2 },
        indices: modellen.length * 3 + i,
        material: 0,
      }],
    })),
    materials: [{
      name: 'colormap',
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: '../kits/colormap.png', name: 'colormap' }],
    samplers: [{ magFilter: 9728, minFilter: 9728 }],
    accessors: [
      ...stukken.flatMap((stuk) => [
        { bufferView: 0, byteOffset: stuk.hoekVanaf * 12, componentType: 5126, count: stuk.hoeken, type: 'VEC3', min: stuk.min, max: stuk.max },
        { bufferView: 1, byteOffset: stuk.hoekVanaf * 12, componentType: 5126, count: stuk.hoeken, type: 'VEC3' },
        { bufferView: 2, byteOffset: stuk.hoekVanaf * 8, componentType: 5126, count: stuk.hoeken, type: 'VEC2' },
      ]),
      ...stukken.map((stuk) => ({
        bufferView: 3,
        byteOffset: stuk.indexVanaf * (groteIndices ? 4 : 2),
        componentType: groteIndices ? 5125 : 5123,
        count: stuk.aantal,
        type: 'SCALAR',
      })),
    ],
    bufferViews: views.map((view, i) => ({ ...view, target: i === 3 ? 34963 : 34962 })),
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

  mkdirSync(UIT, { recursive: true });
  writeFileSync(join(UIT, `${naam}.glb`), Buffer.concat([kop, jsonKop, jsonPad, binKop, bin]));

  return {
    naam,
    driehoeken: indices.length / 3,
    hoekpunten: aantal,
    meshes: modellen.length,
    tekenopdrachten: nodes.length,
  };
}

for (const [naam, opties] of [
  ['strand-vaag', { bosScherp: false }],
  ['strand-scherp', { bosScherp: true }],
]) {
  const uit = schrijfGlb(naam, opties);
  console.log(`blockout/${uit.naam}.glb — ${uit.driehoeken} driehoeken, ${uit.hoekpunten} hoekpunten`);
  console.log(`  ${uit.meshes} meshes, ${uit.tekenopdrachten} tekenopdrachten`);
}
