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

/** ±6 texels binnen dezelfde verloopstrook: net genoeg om vlakken te laten
 * leven, te weinig om als vlekken te lezen. */
const trilling = (a, b) => Math.round((hash2(a, b) - 0.5) * 12);

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

/**
 * @param yMond hoogte van de mond (onderrand van de envelop)
 * @param vanRing eerste profielring; 0 = de volle druppel met smalle tuit,
 *   hoger = afgeknot met een brede rok, zoals bij de complete ballon —
 *   de smalle tuit leest los van een mand, een brede mond maakt er
 *   één voertuig van.
 */
function envelop(m, yMond, vanRing = 0) {
  const dy = yMond - PROFIEL[vanRing][1];
  for (let band = vanRing; band < PROFIEL.length - 1; band++) {
    const [r0, y0raw] = PROFIEL[band];
    const [r1, y1raw] = PROFIEL[band + 1];
    const y0 = y0raw + dy, y1 = y1raw + dy;
    for (let baan = 0; baan < BANEN; baan++) {
      const a0 = (baan / BANEN) * Math.PI * 2;
      const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
      const A = punt(r0, y0, a0);
      const B = punt(r0, y0, a1);
      const C = punt(r1, y1, a1);
      const D = punt(r1, y1, a0);
      const kleur = baanKleur(band, baan);
      // Iedere baan is over zijn hele lengte één greep uit de strook: variatie
      // per báán, nooit per band — anders tekenen zich horizontale ringen af
      // en die heeft een echte ballon niet. De witte cel alleen omhoog
      // (lichter), want naar onderen loopt hij snel naar grijsroze.
      const dv = kleur === WIT
        ? -Math.round(hash2(baan * 3 + 2, 7) * 8)
        : Math.round((hash2(baan * 3 + 2, 3) - 0.5) * 10);
      const celUv = uv(kleur, dv);
      m.driehoek(A, C, B, celUv);
      m.driehoek(A, D, C, celUv);
    }
  }

  /* kroonplaat: 16-hoekig cilindertje op de top, inktzwart */
  const KROON_R = 0.2;
  const onder = dy + 4.536;
  const boven = dy + 4.6;
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
  const MOND_R = PROFIEL[vanRing][0] + 0.02;
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
    for (let i = vanRing; i < PROFIEL.length - 1; i++) {
      const [nr0, ny0] = profielNormaal(i);
      const [nr1, ny1] = profielNormaal(i + 1);
      m.lijn(
        punt(PROFIEL[i][0] + nr0 * NAAD_AFSTAND, PROFIEL[i][1] + dy + ny0 * NAAD_AFSTAND, hoek),
        punt(PROFIEL[i + 1][0] + nr1 * NAAD_AFSTAND, PROFIEL[i + 1][1] + dy + ny1 * NAAD_AFSTAND, hoek),
      );
    }
  }
}

/* -- mand, brander en kabels ----------------------------------------------
 * Achthoekige rieten mand — geen kist maar een mand — nadrukkelijk smaller
 * dan de mond van de envelop erboven. Menselijke maat: de deur van de
 * vuurtoren is ± 0.85 eenheid, dus de mandrand ligt op borsthoogte (0.64)
 * en wie erin staat steekt er ruim bovenuit. Vlechtwerk in twee grepen uit
 * de bruine verloopstrook, opgerolde rand in donkerder bruin (geen inkten
 * kistlijstwerk). Het materiaal is doubleSided, dus de binnenkant van de
 * wanden is gewoon zichtbaar; binnenin ligt een vloer.
 */
const MAND_ZIJDEN = 8;
const MAND_HOEK = (k) => ((k + 0.5) / MAND_ZIJDEN) * Math.PI * 2;

function mand(m, yMond) {
  const R_ONDER = 0.44, R_BOVEN = 0.5, HOOGTE = 0.55;

  /* wanden: 8 zijden × 2 rijen vlechtvakken; variatie alleen per vak van
   * het vlechtwerk, de vakken van één zijde liggen in hetzelfde vlak */
  for (let rij = 0; rij < 2; rij++) {
    const y0 = (rij / 2) * HOOGTE, y1 = ((rij + 1) / 2) * HOOGTE;
    const r0 = R_ONDER + (R_BOVEN - R_ONDER) * (y0 / HOOGTE);
    const r1 = R_ONDER + (R_BOVEN - R_ONDER) * (y1 / HOOGTE);
    for (let k = 0; k < MAND_ZIJDEN; k++) {
      const a0 = MAND_HOEK(k - 0.5), a1 = MAND_HOEK(k + 0.5);
      const A = punt(r0, y0, a0), B = punt(r0, y0, a1);
      const C = punt(r1, y1, a1), D = punt(r1, y1, a0);
      const dv = (rij + k) % 2 ? -12 : 12;
      m.driehoek(A, C, B, uv(BRUIN, dv));
      m.driehoek(A, D, C, uv(BRUIN, dv));
    }
  }

  /* opgerolde rand: uitstulpen, plat bovenvlak, terugrollen naar binnen —
   * donkerder bruin, als de dikke gevlochten rand van een echte mand */
  const RAND = [
    [R_BOVEN, HOOGTE], [R_BOVEN + 0.06, HOOGTE + 0.045],
    [R_BOVEN + 0.06, HOOGTE + 0.09], [R_BOVEN - 0.09, HOOGTE + 0.09],
    [R_BOVEN - 0.09, HOOGTE],
  ];
  for (let s = 0; s < RAND.length - 1; s++) {
    const [r0, y0] = RAND[s], [r1, y1] = RAND[s + 1];
    for (let k = 0; k < MAND_ZIJDEN; k++) {
      const a0 = MAND_HOEK(k - 0.5), a1 = MAND_HOEK(k + 0.5);
      m.driehoek(punt(r0, y0, a0), punt(r1, y1, a1), punt(r0, y0, a1), uv(BRUIN, 28));
      m.driehoek(punt(r0, y0, a0), punt(r1, y1, a0), punt(r1, y1, a1), uv(BRUIN, 28));
    }
  }

  /* bodem (naar beneden) en vloer binnenin (naar boven) */
  for (let k = 0; k < MAND_ZIJDEN; k++) {
    const a0 = MAND_HOEK(k - 0.5), a1 = MAND_HOEK(k + 0.5);
    m.driehoek([0, 0, 0], punt(R_ONDER, 0, a0), punt(R_ONDER, 0, a1), uv(BRUIN, 20));
    m.driehoek([0, 0.08, 0], punt(R_ONDER, 0.08, a1), punt(R_ONDER, 0.08, a0), uv(BRUIN, 26));
  }

  /* brander: blokje vlak onder de mond, met een terracotta bovenvlak als
   * vlampoort — gewoon een paletkleur, geen emissive */
  const B_HALF = 0.09, B_ONDER = yMond - 0.28, B_BOVEN = yMond - 0.1;
  const b = (y, i) => [B_HALF * (i === 0 || i === 3 ? 1 : -1), y, B_HALF * (i < 2 ? -1 : 1)];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.vlak(b(B_ONDER, i), b(B_ONDER, j), b(B_BOVEN, j), b(B_BOVEN, i), uv(INKT, 8));
  }
  m.vlak(b(B_BOVEN, 0), b(B_BOVEN, 1), b(B_BOVEN, 2), b(B_BOVEN, 3), uv(TERRACOTTA, -20));
  m.vlak(b(B_ONDER, 3), b(B_ONDER, 2), b(B_ONDER, 1), b(B_ONDER, 0), uv(INKT, 16));
}

/* kabels: acht dunne lijnen — hetzelfde lijnmateriaal als de naden — van de
 * mandrand omhoog en licht naar buiten naar de bredere mondring, op de
 * hoekpunten van de achthoek zodat elke kabel bij een naadpositie van de
 * envelop uitkomt. Dikke touwprisma's lazen als stokken; kabels van een
 * echte ballon zijn juist dun. */
function kabels(m, yMond) {
  for (let k = 0; k < MAND_ZIJDEN; k++) {
    const hoek = MAND_HOEK(k);
    m.lijn(punt(0.52, 0.62, hoek), punt(0.57, yMond + 0.02, hoek));
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
function controleerEnvelop(m, banden = PROFIEL.length - 1) {
  let som = 0;
  for (let i = 0; i < BANEN * banden * 6; i++) {
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
  /* envelop afgeknot op ring 1 (mond ~1.2 breed), achthoekige mand met de
   * rand op borsthoogte (0.64) en smaller dan de mond, dunne kabels: de
   * envelop domineert zoals bij een echte ballon en de mand hangt er
   * zichtbaar in, niet los onder. */
  const MOND = 1.06;
  const m = maakModel();
  envelop(m, MOND, 1);
  controleerEnvelop(m, PROFIEL.length - 2);
  mand(m, MOND);
  kabels(m, MOND);
  schrijfGlb('balloon-basket', m);
}
