/**
 * Bouwt de twee molens in kits/taalei-kit/ uit onderdelen die al in kits/ staan.
 *
 * Draai vanuit de repo-root:  node tools/bouw-molen.mjs
 *
 * Er wordt geen enkel vlak nieuw getekend. Een molen is een stapeling van
 * bestaande Kenney-onderdelen, verplaatst, gedraaid en geschaald, en daarna
 * platgeslagen tot één mesh met één materiaal — dezelfde vorm als de rest van
 * de kits, zodat de catalogus en de laadcode geen uitzondering nodig hebben.
 *
 * Beide molens hebben dezelfde romp, deur, raam, vloer en wieken; ze verschillen
 * alleen in de kap:
 *   windmill           de koepel van pirate-kit/structure-roof, uitgerekt
 *   windmill-hip-roof  vier keer fantasy-town-kit/roof-corner-round, ware grootte
 *
 * Wat waar vandaan komt:
 *   fantasy-town-kit/wall-wood-corner-diagonal(-half)  romp en plint
 *   fantasy-town-kit/wall-wood-doorway-square          deur
 *   fantasy-town-kit/wall-wood-window-shutters         raam
 *   fantasy-town-kit/roof-flat                         vloer
 *   pirate-kit/structure-roof                          kap (alleen de koepel)
 *   fantasy-town-kit/roof-corner-round                 kap (schilddak)
 *   fantasy-town-kit/windmill                          wiekenkruis
 *
 * Een paar onderdelen krijgen andere uv's mee: beide kappen gaan naar leisteen
 * en het zeildoek van de wieken van zandkleur naar gebroken wit. Al die cellen
 * staan al in kits/palet.json; er komt geen kleur bij.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');

/* -- .glb inlezen ---------------------------------------------------------
 * GLB-container: 12-byte header, daarna chunks van [lengte, type, data]. De
 * Kenney-bestanden zijn allemaal één mesh met één primitive en losse
 * POSITION/NORMAL/TEXCOORD_0-accessors; meer hoeft dit script niet aan te
 * kunnen, dus de lezer blijft klein.
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
  return { data: uit, count: accessor.count };
}

/* -- matrices -------------------------------------------------------------
 * Kolom-major, zoals glTF ze aanlevert.
 */
const EENHEID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

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

const T = (x, y, z) => samenstellen({ t: [x, y, z] });
const S = (x, y, z) => samenstellen({ s: [x, y, z] });
const R = (graden) => {
  const half = (graden * Math.PI) / 360;
  return samenstellen({ r: [0, Math.sin(half), 0, Math.cos(half)] });
};
/** Spiegeling in het vlak x = z: verwisselt de twee wandhelften van een hoekstuk. */
const SPIEGEL_XZ = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  return samenstellen({ t: node.translation, r: node.rotation, s: node.scale });
}

/** Alle primitives van een .glb, met de node-transforms er al in verwerkt. */
const gelezen = new Map();
function leesModel(pad) {
  if (gelezen.has(pad)) return gelezen.get(pad);
  const { json, bin } = leesGlb(join(KITS, `${pad}.glb`));
  const stukken = [];
  const scene = json.scenes[json.scene ?? 0];

  const loop = (index, ouder) => {
    const node = json.nodes[index];
    const wereld = maalMatrix(ouder, nodeMatrix(node));
    for (const prim of json.meshes?.[node.mesh]?.primitives ?? []) {
      const posities = leesAccessor(json, bin, prim.attributes.POSITION);
      stukken.push({
        posities: posities.data,
        normalen: leesAccessor(json, bin, prim.attributes.NORMAL).data,
        uvs: leesAccessor(json, bin, prim.attributes.TEXCOORD_0).data,
        indices: Array.from(leesAccessor(json, bin, prim.indices).data),
        matrix: wereld,
      });
    }
    for (const kind of node.children ?? []) loop(kind, wereld);
  };
  for (const index of scene.nodes) loop(index, EENHEID);

  gelezen.set(pad, stukken);
  return stukken;
}

/* -- paletcellen ----------------------------------------------------------
 * De colormap is een raster van 16 × 4 cellen en elke cel is een verticale
 * verloopstrook. Een deel naar een andere cel verplaatsen is dus een vaste
 * verschuiving van de uv's; het verloop bínnen de cel blijft intact, en de
 * vlakken blijven precies één texel per vlak aanwijzen.
 */
const celVanUv = (u, v) => `${Math.floor(u * 16)}/${Math.floor(v * 4)}`;
const uvVanCel = (cel) => {
  const [kolom, rij] = cel.split('/').map(Number);
  return [kolom / 16, rij / 4];
};

/**
 * Grootste aaneengesloten stuk uit een driehoekenlijst. `structure-roof` heeft
 * losse palmbladeren op de koepel liggen; die hangen nergens aan vast en
 * vallen er zo vanzelf af.
 */
function grootsteEiland(posities, indices) {
  const zelfdePunt = new Map();
  const ouder = new Map();
  const kern = (i) => {
    const sleutel = [0, 1, 2].map((c) => posities[i * 3 + c].toFixed(4)).join(',');
    if (!zelfdePunt.has(sleutel)) {
      zelfdePunt.set(sleutel, i);
      ouder.set(i, i);
    }
    return zelfdePunt.get(sleutel);
  };
  const zoek = (x) => {
    while (ouder.get(x) !== x) {
      ouder.set(x, ouder.get(ouder.get(x)));
      x = ouder.get(x);
    }
    return x;
  };

  for (let i = 0; i < indices.length; i += 3) {
    const punten = [kern(indices[i]), kern(indices[i + 1]), kern(indices[i + 2])];
    for (const [a, b] of [[punten[0], punten[1]], [punten[1], punten[2]]]) {
      const [ra, rb] = [zoek(a), zoek(b)];
      if (ra !== rb) ouder.set(ra, rb);
    }
  }

  const eilanden = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const groep = zoek(kern(indices[i]));
    if (!eilanden.has(groep)) eilanden.set(groep, []);
    eilanden.get(groep).push(...indices.slice(i, i + 3));
  }
  return [...eilanden.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}

/* -- onderdelen plaatsen -------------------------------------------------- */

let delen = [];

/**
 * @param {string} pad  kit/model, zonder .glb
 * @param {object} opties
 *   yVanaf  houd alleen driehoeken die volledig boven deze lokale hoogte liggen
 *   eiland  houd daarna alleen het grootste aaneengesloten stuk
 *   hercel  { 'kolom/rij': 'kolom/rij' } verplaatst uv's naar een andere paletcel
 * @param {...number[]} matrices  van buiten naar binnen, zoals je ze leest
 */
function zet(pad, opties, ...matrices) {
  const matrix = matrices.reduce(maalMatrix, EENHEID);

  for (const stuk of leesModel(pad)) {
    const m = maalMatrix(matrix, stuk.matrix);
    const aantal = stuk.posities.length / 3;
    const posities = new Float64Array(aantal * 3);
    const normalen = new Float64Array(aantal * 3);

    for (let i = 0; i < aantal; i++) {
      const [x, y, z] = [stuk.posities[i * 3], stuk.posities[i * 3 + 1], stuk.posities[i * 3 + 2]];
      posities[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
      posities[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      posities[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];

      const [a, b, c] = [stuk.normalen[i * 3], stuk.normalen[i * 3 + 1], stuk.normalen[i * 3 + 2]];
      const nx = m[0] * a + m[4] * b + m[8] * c;
      const ny = m[1] * a + m[5] * b + m[9] * c;
      const nz = m[2] * a + m[6] * b + m[10] * c;
      const lengte = Math.hypot(nx, ny, nz) || 1;
      normalen[i * 3] = nx / lengte;
      normalen[i * 3 + 1] = ny / lengte;
      normalen[i * 3 + 2] = nz / lengte;
    }

    let indices = stuk.indices;
    if (opties.yVanaf !== undefined) {
      indices = [];
      for (let i = 0; i < stuk.indices.length; i += 3) {
        const hoogtes = [0, 1, 2].map((k) => stuk.posities[stuk.indices[i + k] * 3 + 1]);
        if (Math.min(...hoogtes) >= opties.yVanaf) indices.push(...stuk.indices.slice(i, i + 3));
      }
    }
    if (opties.eiland) indices = grootsteEiland(posities, indices);

    // Een spiegeling keert de winding om; zonder deze omdraai staan de vlakken
    // van het gespiegelde hoekstuk naar binnen.
    const determinant =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[4] * (m[1] * m[10] - m[2] * m[9]) +
      m[8] * (m[1] * m[6] - m[2] * m[5]);
    if (determinant < 0) {
      indices = indices.slice();
      for (let i = 0; i + 2 < indices.length; i += 3) {
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      }
    }

    let uvs = stuk.uvs;
    if (opties.hercel) {
      uvs = Float64Array.from(uvs);
      for (let i = 0; i < uvs.length; i += 2) {
        const van = celVanUv(uvs[i], uvs[i + 1]);
        const naar = opties.hercel[van];
        if (!naar) continue;
        const [vanU, vanV] = uvVanCel(van);
        const [naarU, naarV] = uvVanCel(naar);
        uvs[i] += naarU - vanU;
        uvs[i + 1] += naarV - vanV;
      }
    }

    delen.push({ posities, normalen, uvs, indices });
  }
}

/* -- de molen -------------------------------------------------------------
 * Alle maten in rastereenheden: één wandsegment is 1 × 1, wandhoogte 1.
 */

/**
 * Romp. Vier `wall-wood-corner-diagonal` op de vier cellen van een 2 × 2
 * voetafdruk vormen samen een achthoek: vier rechte vlakken en vier schuine
 * hoeken. Dat is acht vlakke stukken per cirkel, ruim binnen de zestien uit
 * asset_style_guide.md, en het is de enige achthoek die de kit al kan maken.
 * Elke ring staat een stap smaller dan die eronder; dat geeft de romp de taps
 * toelopende vorm van een molen zonder één nieuw vlak te tekenen.
 */
const HOEKEN = [0, -90, 180, 90]; // schuine hoek naar +x+z, -x+z, -x-z, +x-z

function ring(y, schaal, hoogte, { voorkantOpen = false } = {}) {
  for (const graden of HOEKEN) {
    const plaats = [T(0, y, 0), S(schaal, hoogte, schaal), R(graden), T(0.5, 0, 0.5)];
    if (voorkantOpen && graden === 90) {
      // Rechtsvoor: alleen de zijwand en de schuine hoek, het voorvlak blijft
      // leeg voor de deur. Zou de wandhelft blijven staan, dan keek je door de
      // deuropening tegen een dichte wand op 2.5 cm afstand aan.
      zet('fantasy-town-kit/wall-wood-corner-diagonal-half', {}, ...plaats);
    } else if (voorkantOpen && graden === 0) {
      // Linksvoor: hetzelfde stuk gespiegeld, zodat de wandhelft aan de zijkant zit.
      zet('fantasy-town-kit/wall-wood-corner-diagonal-half', {}, ...plaats, SPIEGEL_XZ);
    } else {
      zet('fantasy-town-kit/wall-wood-corner-diagonal', {}, ...plaats);
    }
  }
}

const PLINT_HOOG = 0.22;
const RINGEN = [1.0, 0.92, 0.84]; // breedtefactor per verdieping
const BOVEN = PLINT_HOOG + RINGEN.length;

/* De halve dikte van het wiekenkruis: de naaf moet zo ver voor de kap staan dat
 * het kruis er vrij langs draait. */
const WIEK_DIK = 0.235;

/**
 * De twee kappen. Elke kap zet zijn eigen onderdelen neer en zegt daarna hoe
 * hoog hij is en hoe ver hij aan de voorkant uitsteekt; daar hangt de naaf van
 * de wieken aan.
 */
const KAPPEN = {
  /* De koepel van `pirate-kit/structure-roof` is de enige achthoekige kap in de
   * kits en past dus bij de achthoekige romp; de vier poten eronder en de
   * palmbladeren erop laten we vallen. Iets hoger uitgerekt dan hij van zichzelf
   * is, want een molenkap is geen huisdak, en van riet naar leisteen zodat hij
   * zich losmaakt van het zeildoek. */
  windmill() {
    const BREED = 1.234; // gemeten breedte van de koepel in structure-roof
    const HOOG = 0.56;   // en de hoogte, van y = 0.8 tot y = 1.36
    const schaal = (2 * RINGEN.at(-1)) / BREED;
    const rek = 1.35;
    zet('pirate-kit/structure-roof', { yVanaf: 0.79, eiland: true, hercel: { '13/0': '6/1' } },
      T(0, BOVEN - 0.8 * schaal * rek, 0), S(schaal, schaal * rek, schaal));
    return { hoogte: HOOG * schaal * rek, voorkant: (BREED / 2) * schaal };
  },

  /* Vier `roof-corner-round` op ware grootte. Elk stuk is een hoek van een
   * schilddak over één cel van 1 × 1, met de nok in de hoek (+x, -z) en de
   * dakrand over -x en +z heen. Zet je ze op de vier cellen van een 2 × 2 en
   * draai je ze mee, dan komen de vier nokpunten samen op de as van de molen.
   * De kap steekt daardoor 0.23 buiten de bovenste ring uit — een echte
   * dakrand, in plaats van een kap die op de romp is afgesneden. */
  'windmill-hip-roof'() {
    for (const graden of [0, 90, 180, 270]) {
      zet('fantasy-town-kit/roof-corner-round', { hercel: { '5/1': '6/1' } },
        T(0, BOVEN, 0), R(graden), T(-0.5, 0, 0.5));
    }
    return { hoogte: 0.626, voorkant: 1.067 };
  },
};

function bouwMolen(naam) {
  delen = [];

  ring(0, 1.06, PLINT_HOOG);       // plint: dezelfde ring, plat gedrukt en iets breder
  RINGEN.forEach((schaal, i) => ring(PLINT_HOOG + i, schaal, 1, { voorkantOpen: i === 0 }));

  /* Deur en raam staan gelijk met de hoekstijlen van hun eigen ring; de
   * wandpanelen liggen 0.025 dieper, dus er ligt nergens vlak op vlak. */
  zet('fantasy-town-kit/wall-wood-doorway-square', {},
    T(0, PLINT_HOOG, 0), S(RINGEN[0], 1, RINGEN[0]), T(0.5, 0, 0));
  zet('fantasy-town-kit/wall-wood-window-shutters', {},
    T(0, PLINT_HOOG + 1, 0), S(RINGEN[1], 1, RINGEN[1]), T(0.5, 0, 0));

  /* Vloer. Zonder vloer kijk je van bovenaf dwars door de deuropening en onder
   * de wanden door heen — en dat is precies de hoek waaronder een speler de
   * molen ziet. Twee `roof-flat`-platen, één recht en één 45 graden gedraaid,
   * dekken samen de achthoek af: het grootste vierkant dat er in zijn eentje in
   * past laat aan vier kanten een spleet vrij. Van dakgroen naar donker hout. */
  for (const graden of [0, 45]) {
    zet('fantasy-town-kit/roof-flat', { hercel: { '5/1': '12/0' } },
      T(0, 0.16, 0), R(graden), S(1.42, 1, 1.42));
  }

  const kap = KAPPEN[naam]();

  /* Wieken. `fantasy-town-kit/windmill.glb` is precies het wiekenkruis en verder
   * niets: naaf op de oorsprong, kruis in het y-z-vlak, dus het kijkt al naar
   * +x. Op ware grootte, zonder schaal: kleiner gemaakt reiken de wieken
   * nauwelijks voorbij de romp en valt precies weg waar een molen aan te
   * herkennen is. */
  zet('fantasy-town-kit/windmill', { hercel: { '5/3': '5/2' } },
    T(kap.voorkant + WIEK_DIK + 0.06, BOVEN + kap.hoogte * 0.45, 0));

  return schrijfGlb(naam);
}

/* -- wegschrijven ---------------------------------------------------------
 * Eén mesh, één primitive, één opaak materiaal `colormap` dat via een externe
 * URI naar Textures/colormap.png wijst: precies de vorm die de Kenney-bestanden
 * ook hebben.
 */
function schrijfGlb(naam) {
  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];
  for (const deel of delen) {
    const basis = posities.length / 3;
    posities.push(...deel.posities);
    normalen.push(...deel.normalen);
    uvs.push(...deel.uvs);
    for (const i of deel.indices) indices.push(basis + i);
  }

  const aantal = posities.length / 3;
  const groteIndices = aantal > 65535;
  const posBuf = Buffer.alloc(aantal * 12);
  const norBuf = Buffer.alloc(aantal * 12);
  const uvBuf = Buffer.alloc(aantal * 8);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < aantal; i++) {
    for (let c = 0; c < 3; c++) {
      const waarde = Math.fround(posities[i * 3 + c]);
      posBuf.writeFloatLE(waarde, i * 12 + c * 4);
      norBuf.writeFloatLE(Math.fround(normalen[i * 3 + c]), i * 12 + c * 4);
      min[c] = Math.min(min[c], waarde);
      max[c] = Math.max(max[c], waarde);
    }
    uvBuf.writeFloatLE(Math.fround(uvs[i * 2]), i * 8);
    uvBuf.writeFloatLE(Math.fround(uvs[i * 2 + 1]), i * 8 + 4);
  }

  const idxBuf = Buffer.alloc(indices.length * (groteIndices ? 4 : 2));
  indices.forEach((waarde, i) =>
    groteIndices ? idxBuf.writeUInt32LE(waarde, i * 4) : idxBuf.writeUInt16LE(waarde, i * 2));

  const blokken = [posBuf, norBuf, uvBuf, idxBuf];
  const views = [];
  let lengte = 0;
  for (const blok of blokken) {
    views.push({ buffer: 0, byteOffset: lengte, byteLength: blok.length });
    lengte += blok.length + ((4 - (blok.length % 4)) % 4);
  }
  const bin = Buffer.alloc(lengte);
  blokken.forEach((blok, i) => blok.copy(bin, views[i].byteOffset));

  const gltf = {
    asset: {
      generator: 'taaleiland/bouw-molen.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, bron: 'kitonderdelen', palet: 1 } },
    },
    scene: 0,
    scenes: [{ nodes: [0], name: naam }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{
      name: naam,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }],
    }],
    materials: [{
      name: 'colormap',
      doubleSided: true,
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ magFilter: 9728, minFilter: 9728 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: aantal, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: aantal, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: aantal, type: 'VEC2' },
      { bufferView: 3, componentType: groteIndices ? 5125 : 5123, count: indices.length, type: 'SCALAR' },
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

  writeFileSync(join(KITS, 'taalei-kit', `${naam}.glb`),
    Buffer.concat([kop, jsonKop, jsonPad, binKop, bin]));

  return {
    naam,
    maat: [max[0] - min[0], max[2] - min[2], max[1] - min[1]],
    driehoeken: indices.length / 3,
    hoekpunten: aantal,
  };
}

for (const naam of Object.keys(KAPPEN)) {
  const uit = bouwMolen(naam);
  console.log(
    `kits/taalei-kit/${uit.naam}.glb — ${uit.maat.map((v) => v.toFixed(3)).join(' × ')} (b × d × h)`,
  );
  console.log(`  ${uit.driehoeken} driehoeken, ${uit.hoekpunten} hoekpunten, 1 tekenopdracht`);
}
