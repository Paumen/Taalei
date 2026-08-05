/**
 * Bouwt kits/taalei-kit/balloon.glb: de envelop van een luchtballon, zonder
 * mand — het silhouet aan de horizon.
 *
 * Draai vanuit de repo-root:  node tools/bouw-luchtballon.mjs
 * Controleer daarna met:      node tools/toets-ballon.mjs
 *
 * -- vorm ------------------------------------------------------------------
 * Peervormig: onder een kegel naar een smalle hals (0.60 breed tegenover 3.78
 * voor de envelop, dus 1 : 6.3, zoals bij een echte ballon), de grootste
 * omtrek op 62% van de hoogte, en daarboven de koepel. De koepel komt
 * rechtstreeks uit het profiel van de ontwerpstudie; zie KRUIN.
 *
 * Kleuren komen uit kits/palet.json ("gedeeld"); er komt geen kleur bij.
 *
 *   gebroken wit  #f0ece3  cel 5/2   banen van de envelop
 *   terracotta    #d07b56  cel 5/0   accentbanen en kruin
 *   staalblauw    #6d738a  cel 15/3  accentbanen, halsband en naden
 *   inktzwart     #3e3e44  cel 10/0  kroonplaat en halsgat
 *
 * PO-notities:
 *   - De naden van de banen zijn lijnen (outlines). Bewust gehouden: zonder
 *     naden leest de envelop als een gladde bal.
 *   - Geen transparantie of emissive.
 *   - Oorsprong: spil in het midden van de voetafdruk, Y = 0 bij de hals.
 *     De ballon zweeft dus niet zelf; de scène bepaalt de hoogte.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'taalei-kit');

const BANEN = 16;      // banen van de envelop; het maximum uit de stijlgids
const BANDEN = 12;     // hoogtebanden van de envelop

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
const uv = ([x, y], dv = 0) => [(x + 0.5) / 512, (y + dv + 0.5) / 512];

/** Deterministische ruis per baan, zodat een run reproduceerbaar is. */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

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

/* -- envelop --------------------------------------------------------------- */

const RMAX = 1.888;      // grootste straal
const HOOGTE = 4.5;      // hals tot kroon
const HALS = 0.3;        // straal van de halsopening
const KROON = 0.2;       // straal van de kroonplaat
const T_MAX = 0.624;     // grootste omtrek op 62% van de hoogte, als in de studie
const P_ONDER = 0.85;    // vulling van de kegel onder de grootste omtrek

/**
 * De kruin van de ontwerpstudie, uitgedrukt als (hoogte, straal) binnen de
 * koepel — 0 bij de grootste omtrek, 1 bij de kroonplaat, beide genormaliseerd.
 * Overgenomen uit het profiel van de studie in plaats van benaderd met een
 * formule: een kwartcirkel of superellips valt bovenin steeds naast de
 * originele vorm (te bol bij 85%, te stomp vlak onder de kroon), en het is
 * juist die bovenkant die de silhouet maakt.
 */
const KRUIN = [
  [0, 1], [0.269, 0.967], [0.491, 0.865], [0.690, 0.687],
  [0.853, 0.438], [0.958, 0.154], [1, 0],
];

function kruinStraal(u) {
  for (let i = 0; i < KRUIN.length - 1; i++) {
    const [u0, r0] = KRUIN[i], [u1, r1] = KRUIN[i + 1];
    if (u <= u1) return r0 + (r1 - r0) * ((u - u0) / (u1 - u0));
  }
  return 0;
}

/** (straal, hoogte) op parameter t ∈ [0,1], van hals naar kroon. */
function opCurve(t) {
  let r;
  if (t <= T_MAX) {
    // onderkegel: vult snel uit naar de grootste omtrek
    const v = t / T_MAX;
    r = HALS + (RMAX - HALS) * Math.pow(Math.sin((Math.PI / 2) * v), P_ONDER);
  } else {
    const u = (t - T_MAX) / (1 - T_MAX);
    r = KROON + (RMAX - KROON) * kruinStraal(u);
  }
  return [r, t * HOOGTE];
}

/**
 * De ringen worden op gelijke booglengte gezet, niet op gelijke hoogte.
 * De ontwerpstudie doet dat ook: daar lopen de hoogtestappen van 0.32 onderin
 * via 0.56 in het midden terug naar 0.072 bij de kroon, precies waar de
 * omtrek het snelst krimpt. Verdeel je op hoogte, dan stort de bovenste band
 * in één keer van straal 1.23 naar 0.20 in — een klif in plaats van een
 * koepel, want de kwartcirkel staat bij de kroon verticaal.
 */
function profiel() {
  const FIJN = 600;
  const punten = [];
  const lengtes = [0];
  for (let i = 0; i <= FIJN; i++) {
    const p = opCurve(i / FIJN);
    punten.push(p);
    if (i > 0) {
      const q = punten[i - 1];
      lengtes.push(lengtes[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
  }
  const totaal = lengtes[FIJN];

  const p = [];
  let j = 0;
  for (let i = 0; i <= BANDEN; i++) {
    const doel = (i / BANDEN) * totaal;
    while (j < FIJN && lengtes[j + 1] < doel) j++;
    const span = lengtes[j + 1] - lengtes[j] || 1;
    const f = Math.min(Math.max((doel - lengtes[j]) / span, 0), 1);
    const A = punten[j], B = punten[Math.min(j + 1, FIJN)];
    p.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]);
  }
  p[0] = [HALS, 0];
  p[p.length - 1] = [KROON, HOOGTE];
  return p;
}
const PROFIEL = profiel();

/** Onderste band staalblauw als halsband, kruin terracotta, ertussen om de
 * vier banen een accent op een gebroken-witte romp. */
function baanKleur(band, baan) {
  if (band === 0) return STAAL;
  if (band >= BANDEN - 2) return TERRACOTTA;
  const k = baan % 4;
  return k === 1 ? TERRACOTTA : k === 3 ? STAAL : WIT;
}

function envelop(m, prof, yHals) {
  for (let band = 0; band < prof.length - 1; band++) {
    const [r0, y0] = prof[band];
    const [r1, y1] = prof[band + 1];
    for (let baan = 0; baan < BANEN; baan++) {
      const a0 = (baan / BANEN) * Math.PI * 2;
      const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
      const kleur = baanKleur(band, baan);
      // Variatie per báán over de hele lengte, nooit per band: anders
      // tekenen zich horizontale ringen af en die heeft een ballon niet.
      // De witte cel alleen omhoog (lichter), want naar onderen loopt hij
      // snel naar grijsroze.
      const dv = kleur === WIT
        ? -Math.round(hash2(baan * 3 + 2, 7) * 8)
        : Math.round((hash2(baan * 3 + 2, 3) - 0.5) * 10);
      const celUv = uv(kleur, dv);
      m.driehoek(punt(r0, yHals + y0, a0), punt(r1, yHals + y1, a1), punt(r0, yHals + y0, a1), celUv);
      m.driehoek(punt(r0, yHals + y0, a0), punt(r1, yHals + y1, a0), punt(r1, yHals + y1, a1), celUv);
    }
  }

  /* kroonplaat op de top */
  const top = yHals + prof[prof.length - 1][1];
  for (let baan = 0; baan < BANEN; baan++) {
    const a0 = (baan / BANEN) * Math.PI * 2;
    const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
    m.driehoek(punt(KROON, top, a0), punt(KROON, top + 0.06, a1), punt(KROON, top, a1), uv(INKT));
    m.driehoek(punt(KROON, top, a0), punt(KROON, top + 0.06, a0), punt(KROON, top + 0.06, a1), uv(INKT));
    m.driehoek([0, top + 0.06, 0], punt(KROON, top + 0.06, a0), punt(KROON, top + 0.06, a1), uv(INKT));
  }

  /* halsgat: een korte kegel naar binnen en omhoog, zodat het gat diepte
   * heeft. Een plat schijfje leest als een dop, niet als een opening. */
  for (let baan = 0; baan < BANEN; baan++) {
    const a0 = (baan / BANEN) * Math.PI * 2;
    const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
    m.driehoek(punt(HALS, yHals, a0), punt(HALS * 0.45, yHals + 0.16, a1), punt(HALS, yHals, a1), uv(INKT, 14));
    m.driehoek(punt(HALS, yHals, a0), punt(HALS * 0.45, yHals + 0.16, a0), punt(HALS * 0.45, yHals + 0.16, a1), uv(INKT, 14));
    m.driehoek([0, yHals + 0.16, 0], punt(HALS * 0.45, yHals + 0.16, a1), punt(HALS * 0.45, yHals + 0.16, a0), uv(INKT, 20));
  }

  /* naden: één lijn per baangrens, een fractie buiten het doek langs de
   * profielnormaal zodat de lijn niet met het vlak vecht om diepte */
  const AFSTAND = 0.008;
  const profielNormaal = (i) => {
    const voor = prof[Math.max(i - 1, 0)];
    const na = prof[Math.min(i + 1, prof.length - 1)];
    const [dr, dy] = [na[0] - voor[0], na[1] - voor[1]];
    const lengte = Math.hypot(dr, dy) || 1;
    return [dy / lengte, -dr / lengte];
  };
  for (let baan = 0; baan < BANEN; baan++) {
    const hoek = (baan / BANEN) * Math.PI * 2;
    for (let i = 0; i < prof.length - 1; i++) {
      const [nr0, ny0] = profielNormaal(i);
      const [nr1, ny1] = profielNormaal(i + 1);
      m.lijn(
        punt(prof[i][0] + nr0 * AFSTAND, yHals + prof[i][1] + ny0 * AFSTAND, hoek),
        punt(prof[i + 1][0] + nr1 * AFSTAND, yHals + prof[i + 1][1] + ny1 * AFSTAND, hoek),
      );
    }
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
  const primitives = [{
    attributes: {
      POSITION: accessor(Float32Array.from(m.posities), 'VEC3', 5126, { minMax: true, target: ARRAY_BUFFER }),
      NORMAL: accessor(Float32Array.from(m.normalen), 'VEC3', 5126, { target: ARRAY_BUFFER }),
      TEXCOORD_0: accessor(Float32Array.from(m.uvs), 'VEC2', 5126, { target: ARRAY_BUFFER }),
    },
    indices: accessor(Uint16Array.from({ length: aantal }, (_, i) => i), 'SCALAR', 5123, { target: ELEMENT_ARRAY_BUFFER }),
    material: 0,
  }, {
    // naden: lijnen (mode 1) kennen geen texture, dus de kleur staat als
    // factor op een eigen materiaal — dezelfde staalblauwe cel 15/3.
    attributes: {
      POSITION: accessor(Float32Array.from(m.lijnPosities), 'VEC3', 5126, { minMax: true, target: ARRAY_BUFFER }),
    },
    indices: accessor(Uint16Array.from(m.lijnIndices), 'SCALAR', 5123, { target: ELEMENT_ARRAY_BUFFER }),
    mode: 1,
    material: 1,
  }];

  const gltf = {
    asset: {
      generator: 'taaleiland/bouw-luchtballon.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, bron: 'procedureel', palet: 1 } },
    },
    scene: 0,
    scenes: [{ nodes: [0], name: naam }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{ name: naam, primitives }],
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

  writeFileSync(join(KIT, `${naam}.glb`), glb);
  console.log(`${naam}: ${aantal / 3} driehoeken, ${m.lijnIndices.length / 2} naadsegmenten, ${glb.length} bytes`);
}

/**
 * De envelopvlakken moeten naar buiten wijzen. `vanaf` is de hoekpuntindex
 * waar de envelop begint.
 */
function controleerEnvelop(m, vanaf = 0) {
  let som = 0;
  for (let i = vanaf; i < vanaf + BANEN * BANDEN * 6; i++) {
    const [x, z] = [m.posities[i * 3], m.posities[i * 3 + 2]];
    const lengte = Math.hypot(x, z) || 1;
    som += (m.normalen[i * 3] * x + m.normalen[i * 3 + 2] * z) / lengte;
  }
  if (som <= 0) throw new Error('envelop staat binnenstebuiten');
}

/* -- de twee modellen ------------------------------------------------------ */

{
  const m = maakModel();
  envelop(m, PROFIEL, 0);
  controleerEnvelop(m);
  schrijfGlb('balloon', m);
}

console.log(
  `verhoudingen: envelop ${(RMAX * 2).toFixed(2)} breed, ` +
  `hals ${(HALS * 2).toFixed(2)} (1:${(RMAX / HALS).toFixed(1)})`,
);
