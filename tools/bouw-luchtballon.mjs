/**
 * Bouwt de twee luchtballonnen in kits/taalei-kit/:
 *
 *   balloon         alleen de envelop — het silhouet aan de horizon
 *   balloon-basket  de complete ballon: envelop, touwen, brander en mand
 *
 * Draai vanuit de repo-root:  node tools/bouw-luchtballon.mjs
 *
 * De envelop is een gedraaid profiel van 13 ringen × 16 banen (het maximum
 * van 16 vlakke stukken per cirkel uit de stijlgids), met een kroonplaat op
 * de top en een monddeksel in de onderopening. De naden tussen de banen zijn
 * lijnsegmenten in een tweede primitive — een kernonderdeel van hoe een
 * luchtballon leest, zie de PO-notitie onderaan. Bij balloon-basket hangen
 * de touwen als dezelfde soort lijnen van de mondring naar de mandrand.
 *
 * Kleuren komen uit kits/palet.json ("gedeeld"); de uv's wijzen naar het
 * midden van de cel, met per vlak een kleine verticale verschuiving binnen
 * dezelfde verloopstrook zodat de vlakken niet steriel egaal worden. Er komt
 * geen kleur bij.
 *
 *   gebroken wit  #f0ece3  cel 5/2   banen van de envelop
 *   terracotta    #d07b56  cel 5/0   accentbanen en de top
 *   staalblauw    #6d738a  cel 15/3  accentbanen, onderste ring, naden, touwen
 *   inktzwart     #3e3e44  cel 10/0  kroonplaat, monddeksel, mandrand, brander
 *   bruin         #995a41  cel 12/0  vlechtwerk van de mand
 *
 * PO-notities:
 *   - De naden en touwen zijn lijnen (outlines). Bewust gehouden: zonder
 *     naden leest de vorm als een druppel, niet als een luchtballon.
 *     Ondoorzichtig, geen transparantie of emissive ergens in deze modellen.
 *   - Oorsprong op Y = 0 bij het laagste punt (mond resp. mandbodem), spil
 *     in het midden van de voetafdruk. balloon "zweeft" dus niet zelf;
 *     de scène bepaalt de hoogte. balloon-basket staat op de grond.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'taalei-kit');

/* -- profiel --------------------------------------------------------------
 * (straal, hoogte) van mond naar top; hoogte 0 = de mond. Het buikigste punt
 * ligt iets boven het midden, zoals bij een echte envelop.
 */
const PROFIEL = [
  [0.22, 0.0], [0.58, 0.32], [0.98, 0.74], [1.34, 1.22], [1.64, 1.78],
  [1.82, 2.34], [1.888, 2.84], [1.832, 3.3], [1.66, 3.68], [1.36, 4.02],
  [0.94, 4.3], [0.46, 4.48], [0.2, 4.552],
];
const BANEN = 16;

/* -- paletcellen ----------------------------------------------------------
 * De gedeelde colormap is 512 × 512: 16 kolommen × 4 rijen, elke cel een
 * verticale verloopstrook van 32 × 128 texels. De kleur uit palet.json staat
 * op de middelste rij van de cel; daar wijzen de uv's naartoe. De sampler
 * staat op nearest, dus één uv-punt per vlak is precies één texel.
 */
const cel = (kolom, rij) => [kolom * 32 + 16, rij * 128 + 64];
const WIT = cel(5, 2);
const TERRACOTTA = cel(5, 0);
const STAAL = cel(15, 3);
const INKT = cel(10, 0);
const BRUIN = cel(12, 0);
const uv = ([x, y], dv = 0) => [(x + 0.5) / 512, (y + dv + 0.5) / 512];

/** Zelfde hash als in de ontwerpstudie: deterministisch per vlak. */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** ±12 texels binnen dezelfde verloopstrook: net genoeg om vlakken te laten
 * leven, te weinig om als een andere paletkleur te lezen. */
const trilling = (a, b) => Math.round((hash2(a, b) - 0.5) * 24);

const punt = (r, y, hoek) => [r * Math.cos(hoek), y, r * Math.sin(hoek)];

/* -- model verzamelen -----------------------------------------------------
 * Facetten: elke driehoek krijgt eigen hoekpunten en één normaal, zoals de
 * rest van de kits. Iedere driehoek wijst met alle drie de uv's naar
 * hetzelfde texel, dus het vlak is egaal van kleur.
 */
function maakModel() {
  const posities = [], normalen = [], uvs = [];
  const lijnPosities = [], lijnIndices = [];

  function driehoek(A, B, C, celUv) {
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const lengte = Math.hypot(...n) || 1;
    for (const p of [A, B, C]) {
      posities.push(...p);
      normalen.push(n[0] / lengte, n[1] / lengte, n[2] / lengte);
      uvs.push(...celUv);
    }
  }

  const vlak = (A, B, C, D, celUv) => { driehoek(A, B, C, celUv); driehoek(A, C, D, celUv); };

  function lijn(A, B) {
    const basis = lijnPosities.length / 3;
    lijnPosities.push(...A, ...B);
    lijnIndices.push(basis, basis + 1);
  }

  return { driehoek, vlak, lijn, posities, normalen, uvs, lijnPosities, lijnIndices };
}

/* -- envelop --------------------------------------------------------------
 * Onderste twee banden staalblauw, bovenste twee terracotta; daartussen om
 * de vier banen terracotta of staalblauw op een gebroken-witte romp.
 */
function baanKleur(band, baan) {
  if (band <= 1) return STAAL;
  if (band >= PROFIEL.length - 3) return TERRACOTTA;
  const k = baan % 4;
  return k === 1 ? TERRACOTTA : k === 3 ? STAAL : WIT;
}

/** @param yMond hoogte van de mond (onderrand van de envelop) */
function envelop(m, yMond) {
  for (let band = 0; band < PROFIEL.length - 1; band++) {
    const [r0, y0] = PROFIEL[band];
    const [r1, y1] = PROFIEL[band + 1];
    for (let baan = 0; baan < BANEN; baan++) {
      const a0 = (baan / BANEN) * Math.PI * 2;
      const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
      const A = punt(r0, yMond + y0, a0);
      const B = punt(r0, yMond + y0, a1);
      const C = punt(r1, yMond + y1, a1);
      const D = punt(r1, yMond + y1, a0);
      const celUv = uv(baanKleur(band, baan), trilling(band * 7 + 1, baan * 3 + 2));
      m.driehoek(A, C, B, celUv);
      m.driehoek(A, D, C, celUv);
    }
  }

  /* kroonplaat: 16-hoekig cilindertje op de top, inktzwart */
  const KROON_R = 0.2;
  const onder = yMond + 4.536;
  const boven = yMond + 4.6;
  for (let baan = 0; baan < BANEN; baan++) {
    const a0 = (baan / BANEN) * Math.PI * 2;
    const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
    const A = punt(KROON_R, onder, a0);
    const B = punt(KROON_R, onder, a1);
    const C = punt(KROON_R, boven, a1);
    const D = punt(KROON_R, boven, a0);
    m.driehoek(A, C, B, uv(INKT));
    m.driehoek(A, D, C, uv(INKT));
    m.driehoek([0, boven, 0], D, C, uv(INKT));
  }

  /* monddeksel: de donkere opening, sluit de envelop van onderen */
  const MOND_R = 0.22;
  for (let baan = 0; baan < BANEN; baan++) {
    const a0 = (baan / BANEN) * Math.PI * 2;
    const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
    m.driehoek([0, yMond, 0], punt(MOND_R, yMond, a0), punt(MOND_R, yMond, a1), uv(INKT));
  }

  /* naden: één lijn per baangrens, van mond tot top, een fractie buiten het
   * doek langs de profielnormaal zodat de lijn niet met het vlak vecht om
   * diepte. */
  const NAAD_AFSTAND = 0.008;
  const profielNormaal = (i) => {
    const voor = PROFIEL[Math.max(i - 1, 0)];
    const na = PROFIEL[Math.min(i + 1, PROFIEL.length - 1)];
    const [dr, dy] = [na[0] - voor[0], na[1] - voor[1]];
    const lengte = Math.hypot(dr, dy) || 1;
    return [dy / lengte, -dr / lengte]; // (nr, ny), naar buiten
  };
  for (let baan = 0; baan < BANEN; baan++) {
    const hoek = (baan / BANEN) * Math.PI * 2;
    for (let i = 0; i < PROFIEL.length - 1; i++) {
      const [nr0, ny0] = profielNormaal(i);
      const [nr1, ny1] = profielNormaal(i + 1);
      m.lijn(
        punt(PROFIEL[i][0] + nr0 * NAAD_AFSTAND, yMond + PROFIEL[i][1] + ny0 * NAAD_AFSTAND, hoek),
        punt(PROFIEL[i + 1][0] + nr1 * NAAD_AFSTAND, yMond + PROFIEL[i + 1][1] + ny1 * NAAD_AFSTAND, hoek),
      );
    }
  }
}

/* -- mand, brander en touwen ---------------------------------------------
 * Vierkante rieten mand met een taps toelopend lijf, een inktzwarte rand en
 * een vloer erin (het materiaal is doubleSided, dus de binnenkant van de
 * wanden is gewoon zichtbaar). De brander is een blokje halverwege de
 * touwen; de touwen lopen van de vier randhoeken naar de mondring.
 */
function mand(m, yMond) {
  const ONDER_HALF = 0.42, BOVEN_HALF = 0.5, HOOGTE = 0.72;
  const hoekpunt = (half, y, i) => [half * (i === 0 || i === 3 ? 1 : -1), y, half * (i < 2 ? -1 : 1)];

  /* wanden (buitenkant; binnenkant komt gratis mee via doubleSided) */
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.vlak(
      hoekpunt(ONDER_HALF, 0, i), hoekpunt(ONDER_HALF, 0, j),
      hoekpunt(BOVEN_HALF, HOOGTE, j), hoekpunt(BOVEN_HALF, HOOGTE, i),
      uv(BRUIN, trilling(i * 5 + 3, 11)),
    );
  }
  /* bodem (naar beneden) en vloer binnenin (naar boven) */
  m.vlak(
    hoekpunt(ONDER_HALF, 0, 3), hoekpunt(ONDER_HALF, 0, 2),
    hoekpunt(ONDER_HALF, 0, 1), hoekpunt(ONDER_HALF, 0, 0),
    uv(BRUIN, 20),
  );
  m.vlak(
    hoekpunt(ONDER_HALF, 0.1, 0), hoekpunt(ONDER_HALF, 0.1, 1),
    hoekpunt(ONDER_HALF, 0.1, 2), hoekpunt(ONDER_HALF, 0.1, 3),
    uv(BRUIN, 26),
  );

  /* rand: vierkant lijstwerk dat iets uitsteekt, inktzwart */
  const RAND_UIT = 0.54, RAND_IN = 0.46, RAND_TOP = 0.84;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.vlak( // buitenkant
      hoekpunt(RAND_UIT, HOOGTE, i), hoekpunt(RAND_UIT, HOOGTE, j),
      hoekpunt(RAND_UIT, RAND_TOP, j), hoekpunt(RAND_UIT, RAND_TOP, i),
      uv(INKT),
    );
    m.vlak( // binnenkant
      hoekpunt(RAND_IN, RAND_TOP, i), hoekpunt(RAND_IN, RAND_TOP, j),
      hoekpunt(RAND_IN, HOOGTE, j), hoekpunt(RAND_IN, HOOGTE, i),
      uv(INKT),
    );
    m.vlak( // bovenkant van het lijstwerk
      hoekpunt(RAND_UIT, RAND_TOP, i), hoekpunt(RAND_UIT, RAND_TOP, j),
      hoekpunt(RAND_IN, RAND_TOP, j), hoekpunt(RAND_IN, RAND_TOP, i),
      uv(INKT, -14),
    );
  }

  /* brander: blokje tussen de touwen, onder de mond */
  const B_HALF = 0.09, B_ONDER = yMond - 0.34, B_BOVEN = yMond - 0.18;
  const b = (y, i) => hoekpunt(B_HALF, y, i);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.vlak(b(B_ONDER, i), b(B_ONDER, j), b(B_BOVEN, j), b(B_BOVEN, i), uv(INKT, 8));
  }
  m.vlak(b(B_BOVEN, 0), b(B_BOVEN, 1), b(B_BOVEN, 2), b(B_BOVEN, 3), uv(INKT, -6));
  m.vlak(b(B_ONDER, 3), b(B_ONDER, 2), b(B_ONDER, 1), b(B_ONDER, 0), uv(INKT, 16));
}

/* touwen: van de vier randhoeken van de mand naar de mondring, elk op zijn
 * eigen diagonaal zodat hoek en mondpunt recht boven elkaar uitkomen */
function touwen(m, yMond) {
  const RAND_IN = 0.46, RAND_TOP = 0.84;
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const hoek = Math.atan2(sz, sx);
    m.lijn([RAND_IN * sx, RAND_TOP, RAND_IN * sz], punt(0.22, yMond, hoek));
  }
}

/* -- glb schrijven -------------------------------------------------------- */

/** sRGB-hex → lineaire factor, want baseColorFactor is lineair. */
const lineair = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

function schrijfGlb(naam, m) {
  const buffers = [];
  let bytes = 0;
  const bufferViews = [];
  const accessors = [];

  function accessor(data, type, componentType, { minMax = false, target } = {}) {
    const componenten = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const view = { buffer: 0, byteOffset: bytes, byteLength: buf.length };
    if (target) view.target = target;
    buffers.push(buf);
    bytes += buf.length;
    if (bytes % 4) {
      const rest = 4 - (bytes % 4);
      buffers.push(Buffer.alloc(rest));
      bytes += rest;
    }
    bufferViews.push(view);
    const acc = {
      bufferView: bufferViews.length - 1,
      componentType,
      count: data.length / componenten,
      type,
    };
    if (minMax) {
      const min = Array(componenten).fill(Infinity);
      const max = Array(componenten).fill(-Infinity);
      for (let i = 0; i < data.length; i += componenten) {
        for (let c = 0; c < componenten; c++) {
          min[c] = Math.min(min[c], data[i + c]);
          max[c] = Math.max(max[c], data[i + c]);
        }
      }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  }

  const ARRAY_BUFFER = 34962;
  const ELEMENT_ARRAY_BUFFER = 34963;
  const aantal = m.posities.length / 3;
  const iPositie = accessor(Float32Array.from(m.posities), 'VEC3', 5126, { minMax: true, target: ARRAY_BUFFER });
  const iNormaal = accessor(Float32Array.from(m.normalen), 'VEC3', 5126, { target: ARRAY_BUFFER });
  const iUv = accessor(Float32Array.from(m.uvs), 'VEC2', 5126, { target: ARRAY_BUFFER });
  const iIndex = accessor(Uint16Array.from({ length: aantal }, (_, i) => i), 'SCALAR', 5123, { target: ELEMENT_ARRAY_BUFFER });
  const iLijnPositie = accessor(Float32Array.from(m.lijnPosities), 'VEC3', 5126, { minMax: true, target: ARRAY_BUFFER });
  const iLijnIndex = accessor(Uint16Array.from(m.lijnIndices), 'SCALAR', 5123, { target: ELEMENT_ARRAY_BUFFER });

  const gltf = {
    asset: {
      generator: 'taaleiland/bouw-luchtballon.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, bron: 'procedureel', palet: 1 } },
    },
    scene: 0,
    scenes: [{ nodes: [0], name: naam }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{
      name: naam,
      primitives: [
        {
          attributes: { POSITION: iPositie, NORMAL: iNormaal, TEXCOORD_0: iUv },
          indices: iIndex,
          material: 0,
        },
        {
          // naden en touwen: lijnen (mode 1) kennen geen texture, dus de
          // kleur staat als factor op een eigen materiaal — dezelfde
          // staalblauwe cel 15/3.
          attributes: { POSITION: iLijnPositie },
          indices: iLijnIndex,
          mode: 1,
          material: 1,
        },
      ],
    }],
    materials: [
      {
        name: 'colormap',
        doubleSided: true,
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
      },
      {
        name: 'seam',
        pbrMetallicRoughness: { baseColorFactor: [...lineair('#6d738a'), 1], metallicFactor: 0 },
      },
    ],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ name: 'colormap', uri: 'Textures/colormap.png' }],
    samplers: [{ magFilter: 9728, minFilter: 9728 }],
    bufferViews,
    accessors,
    buffers: [{ byteLength: bytes }],
  };

  const jsonChunk = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonChunk.length % 4)) % 4;
  const binChunk = Buffer.concat(buffers);
  const totaal = 12 + 8 + jsonChunk.length + jsonPad + 8 + binChunk.length;

  const glb = Buffer.alloc(totaal);
  glb.writeUInt32LE(0x46546c67, 0); // 'glTF'
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totaal, 8);
  glb.writeUInt32LE(jsonChunk.length + jsonPad, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonChunk.copy(glb, 20);
  glb.fill(0x20, 20 + jsonChunk.length, 20 + jsonChunk.length + jsonPad);
  let off = 20 + jsonChunk.length + jsonPad;
  glb.writeUInt32LE(binChunk.length, off);
  glb.writeUInt32LE(0x004e4942, off + 4); // 'BIN'
  binChunk.copy(glb, off + 8);

  const pad = join(KIT, `${naam}.glb`);
  writeFileSync(pad, glb);
  console.log(`${pad}`);
  console.log(`  ${aantal / 3} driehoeken, ${m.lijnIndices.length / 2} lijnsegmenten, ${glb.length} bytes`);
}

/** controle: de envelopvlakken van een model moeten naar buiten wijzen */
function controleerEnvelop(m) {
  let som = 0;
  for (let i = 0; i < BANEN * (PROFIEL.length - 1) * 6; i++) {
    const [x, z] = [m.posities[i * 3], m.posities[i * 3 + 2]];
    const lengte = Math.hypot(x, z) || 1;
    som += (m.normalen[i * 3] * x + m.normalen[i * 3 + 2] * z) / lengte;
  }
  if (som <= 0) throw new Error('envelop staat binnenstebuiten');
}

/* -- de twee modellen ------------------------------------------------------ */

{
  const m = maakModel();
  envelop(m, 0);
  controleerEnvelop(m);
  schrijfGlb('balloon', m);
}

{
  const MOND = 1.28; // mand 0–0.84, touwen tot de mond, envelop daarboven
  const m = maakModel();
  envelop(m, MOND);
  controleerEnvelop(m);
  mand(m, MOND);
  touwen(m, MOND);
  schrijfGlb('balloon-basket', m);
}
