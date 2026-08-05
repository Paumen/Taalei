/**
 * Bouwt de twee luchtballonnen in kits/taalei-kit/:
 *
 *   balloon         alleen de envelop — het silhouet aan de horizon
 *   balloon-basket  de complete ballon: envelop, kabels, branderring met
 *                   brander, stijlen en mand
 *
 * Draai vanuit de repo-root:  node tools/bouw-luchtballon.mjs
 * Controleer daarna met:      node tools/toets-ballon.mjs
 *
 * -- verhoudingen ----------------------------------------------------------
 * Uitgangspunt zijn de maten van een echte ballon (envelop ± 20 m, hals
 * ± 2.5 m, mand ± 1.4 m, mand-tot-hals ± 2 m). Gestileerd mag afwijken, maar
 * de onderdelen moeten zich tot elkaar verhouden zoals ze dat in het echt
 * doen, anders klopt er niets van:
 *
 *   hals : envelop  ≈ 1 : 6      de hals is een smalle keel, geen wijde rok
 *   mand : envelop  ≈ 1 : 8      de envelop domineert volledig
 *   mand : hals     ≈ 0.8        de mand hangt bínnen de halsdoorsnede
 *   ring : mand     ≈ 0.9        de branderring net binnen de mandbreedte
 *   tuig            ≈ 1.2 × mandhoogte
 *
 * -- vorm ------------------------------------------------------------------
 * Peervormig: onder een kegel naar de hals, de grootste omtrek op 60% van de
 * hoogte, en daarboven een koepel. De koepel volgt de kruin van de
 * ontwerpstudie — nagemeten een kwartcirkel; zie N_KRUIN.
 *
 * Kleuren komen uit kits/palet.json ("gedeeld"); er komt geen kleur bij.
 *
 *   gebroken wit  #f0ece3  cel 5/2   banen van de envelop
 *   terracotta    #d07b56  cel 5/0   accentbanen, kruin, vlampoort brander
 *   staalblauw    #6d738a  cel 15/3  accentbanen, halsband, naden, kabels
 *   inktzwart     #3e3e44  cel 10/0  kroonplaat, halsgat, ring, brander
 *   bruin         #995a41  cel 12/0  vlechtwerk van de mand
 *
 * PO-notities:
 *   - De naden van de banen zijn lijnen (outlines). Bewust gehouden: zonder
 *     naden leest de envelop als een gladde bal. De kabels zijn géén lijnen
 *     maar dunne staven — een kabel is een onderdeel, geen contour.
 *   - Geen transparantie of emissive; de vlampoort van de brander is een
 *     gewoon terracotta paletvlak.
 *   - Oorsprong: spil in het midden van de voetafdruk. balloon staat op Y = 0
 *     bij de hals (de scène bepaalt de zweefhoogte), balloon-basket op Y = 0
 *     onder de mand.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'taalei-kit');

const BANEN = 16;      // banen van de envelop; het maximum uit de stijlgids
const RING_ZIJDEN = 8; // branderring
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
const BRUIN = cel(12, 0);
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

/**
 * Driezijdige staaf tussen twee punten: de dunste vorm die de stijlgids
 * toestaat zonder in outlines te vervallen. `dikte` is de kleinste maat van
 * de doorsnede — bij een gelijkzijdige driehoek de afstand van een punt tot
 * de overstaande zijde, dus 1.5 × de omgeschreven straal. Rekenen met de
 * omgeschreven straal zou een staaf onder het minimum van 0.015 opleveren.
 * De uiteinden steken in de aangrenzende delen; eindkappen zijn niet nodig.
 */
function staaf(m, P0, P1, dikte, kleurCel, dv = 0) {
  const straal = dikte / 1.5;
  const d = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]];
  const dl = Math.hypot(...d) || 1;
  const richting = d.map((c) => c / dl);
  let u = [richting[1], -richting[0], 0];
  const ul = Math.hypot(...u) || 1;
  u = u.map((c) => c / ul);
  const v = [
    richting[1] * u[2] - richting[2] * u[1],
    richting[2] * u[0] - richting[0] * u[2],
    richting[0] * u[1] - richting[1] * u[0],
  ];
  const rib = (P, a) => [
    P[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * straal,
    P[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * straal,
    P[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * straal,
  ];
  for (let z = 0; z < 3; z++) {
    const a0 = (z / 3) * Math.PI * 2;
    const a1 = ((z + 1) / 3) * Math.PI * 2;
    m.vlak(rib(P0, a0), rib(P0, a1), rib(P1, a1), rib(P1, a0), uv(kleurCel, dv));
  }
}

/* -- envelop --------------------------------------------------------------- */

const RMAX = 1.888;      // grootste straal
const HOOGTE = 4.5;      // hals tot kroon
const HALS = 0.3;        // straal van de halsopening
const KROON = 0.2;       // straal van de kroonplaat
const T_MAX = 0.6;       // grootste omtrek op 60% van de hoogte
const P_ONDER = 0.85;    // vulling van de kegel onder de grootste omtrek

/**
 * Exponent van de kruinkoepel. De kruin van de ontwerpstudie is nagemeten een
 * kwartcirkel: op 49%, 69% en 85% van de koepelhoogte zit die op 0.879, 0.720
 * en 0.498 van de grootste straal, en een cirkel geeft daar 0.871, 0.723 en
 * 0.521. Vandaar exact 2 — hoger maakt de bovenkant vlak, en dat werd te veel.
 */
const N_KRUIN = 2;

/** (straal, hoogte) van hals (y = 0) naar kroon. */
function profiel() {
  const p = [];
  for (let i = 0; i <= BANDEN; i++) {
    const t = i / BANDEN;
    let r;
    if (t <= T_MAX) {
      // onderkegel: vult snel uit naar de grootste omtrek
      const v = t / T_MAX;
      r = HALS + (RMAX - HALS) * Math.pow(Math.sin((Math.PI / 2) * v), P_ONDER);
    } else {
      const u = (t - T_MAX) / (1 - T_MAX);
      r = KROON + (RMAX - KROON) * Math.pow(1 - Math.pow(u, N_KRUIN), 1 / N_KRUIN);
    }
    p.push([r, t * HOOGTE]);
  }
  p[0][0] = HALS;
  p[p.length - 1][0] = KROON;
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

/* -- mand ------------------------------------------------------------------
 * Vierkante rieten mand: het vlechtwerk als raster van 4 zijden × 3 kolommen
 * × 2 rijen, om en om een lichtere en donkerdere greep uit dezelfde bruine
 * verloopstrook, en een opgerolde rand in donkerder bruin. Het materiaal is
 * doubleSided, dus de binnenkant van de wanden is gewoon zichtbaar; binnenin
 * ligt een vloer.
 *
 * De vier hoeken staan op oplopende hoek (−45°, 45°, 135°, 225°), zodat de
 * winding dezelfde kant op loopt als bij de gedraaide vormen hierboven.
 */
const MAND_HOEKEN = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
const mandHoek = (half, y, i) => {
  const [sx, sz] = MAND_HOEKEN[i % 4];
  return [half * sx, y, half * sz];
};

/** @returns hoogte van de bovenkant van de rand */
function mand(m, half, hoogte) {
  const onder = half * 0.86;
  const halfOp = (y) => onder + (half - onder) * (y / hoogte);

  for (let i = 0; i < 4; i++) {
    const zijde = (h, y, t) => {
      const A = mandHoek(h, y, i), B = mandHoek(h, y, i + 1);
      return [A[0] + (B[0] - A[0]) * t, y, A[2] + (B[2] - A[2]) * t];
    };
    for (let rij = 0; rij < 2; rij++) {
      const y0 = (rij / 2) * hoogte, y1 = ((rij + 1) / 2) * hoogte;
      const h0 = halfOp(y0), h1 = halfOp(y1);
      for (let kol = 0; kol < 3; kol++) {
        const t0 = kol / 3, t1 = (kol + 1) / 3;
        const dv = (rij + kol) % 2 ? -12 : 12;
        m.driehoek(zijde(h0, y0, t0), zijde(h1, y1, t1), zijde(h0, y0, t1), uv(BRUIN, dv));
        m.driehoek(zijde(h0, y0, t0), zijde(h1, y1, t0), zijde(h1, y1, t1), uv(BRUIN, dv));
      }
    }
  }

  /* opgerolde rand: uitstulpen, plat bovenvlak, terugrollen naar binnen */
  const d = half * 0.15;
  const RAND = [
    [half, hoogte], [half + d, hoogte + d * 0.7], [half + d, hoogte + d * 1.4],
    [half - d * 1.3, hoogte + d * 1.4], [half - d * 1.3, hoogte],
  ];
  for (let s = 0; s < RAND.length - 1; s++) {
    const [h0, y0] = RAND[s], [h1, y1] = RAND[s + 1];
    for (let i = 0; i < 4; i++) {
      m.driehoek(mandHoek(h0, y0, i), mandHoek(h1, y1, i + 1), mandHoek(h0, y0, i + 1), uv(BRUIN, 28));
      m.driehoek(mandHoek(h0, y0, i), mandHoek(h1, y1, i), mandHoek(h1, y1, i + 1), uv(BRUIN, 28));
    }
  }

  /* bodem (naar beneden) en vloer binnenin (naar boven) */
  for (let i = 0; i < 4; i++) {
    m.driehoek([0, 0, 0], mandHoek(onder, 0, i), mandHoek(onder, 0, i + 1), uv(BRUIN, 20));
    m.driehoek([0, hoogte * 0.16, 0], mandHoek(onder, hoogte * 0.16, i + 1), mandHoek(onder, hoogte * 0.16, i), uv(BRUIN, 26));
  }

  return hoogte + d * 1.4;
}

/* -- tuig: stijlen, branderring, brander en kabels -------------------------
 * De opbouw van een echte ballon: op de mandhoeken staan vier stijlen, die
 * dragen de branderring; in het midden van de ring zit de brander; en aan de
 * ring hangen de kabels die naar de halsrand lopen.
 */
function tuig(m, { mandHalf, mandH, randTop, ringR, ringOnder, ringBoven, yHals }) {
  /* branderring: achthoekige band */
  const rIn = ringR * 0.72;
  const RING = [
    [ringR, ringOnder], [ringR, ringBoven], [rIn, ringBoven], [rIn, ringOnder], [ringR, ringOnder],
  ];
  for (let s = 0; s < RING.length - 1; s++) {
    const [r0, y0] = RING[s], [r1, y1] = RING[s + 1];
    for (let k = 0; k < RING_ZIJDEN; k++) {
      const a0 = ((k + 0.5) / RING_ZIJDEN) * Math.PI * 2;
      const a1 = ((k + 1.5) / RING_ZIJDEN) * Math.PI * 2;
      m.driehoek(punt(r0, y0, a0), punt(r1, y1, a1), punt(r0, y0, a1), uv(INKT));
      m.driehoek(punt(r0, y0, a0), punt(r1, y1, a0), punt(r1, y1, a1), uv(INKT));
    }
  }

  /* brander: blokje midden in de ring, met een terracotta bovenvlak als
   * vlampoort — gewoon een paletkleur, geen emissive */
  const bHalf = ringR * 0.42;
  const bOnder = ringOnder - 0.02, bBoven = ringBoven + (yHals - ringBoven) * 0.42;
  const b = (y, i) => mandHoek(bHalf, y, i);
  for (let i = 0; i < 4; i++) m.vlak(b(bOnder, i), b(bOnder, i + 1), b(bBoven, i + 1), b(bBoven, i), uv(INKT, 8));
  m.vlak(b(bBoven, 0), b(bBoven, 1), b(bBoven, 2), b(bBoven, 3), uv(TERRACOTTA, -20));
  m.vlak(b(bOnder, 3), b(bOnder, 2), b(bOnder, 1), b(bOnder, 0), uv(INKT, 16));

  /* stijlen: van de mandhoeken schuin omhoog naar de ring */
  for (let i = 0; i < 4; i++) {
    const [sx, sz] = MAND_HOEKEN[i];
    const hoek = Math.atan2(sz, sx);
    staaf(m, [mandHalf * 0.92 * sx, mandH * 0.9, mandHalf * 0.92 * sz],
      punt(ringR * 0.9, ringOnder + 0.02, hoek), 0.024, INKT);
  }

  /* kabels: van de ring naar de halsrand, op de naadposities van de envelop */
  for (let k = 0; k < RING_ZIJDEN; k++) {
    const hoek = ((k + 0.5) / RING_ZIJDEN) * Math.PI * 2;
    staaf(m, punt(ringR * 0.96, ringBoven, hoek), punt(HALS * 0.94, yHals + 0.02, hoek), 0.018, STAAL, -10);
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
 * waar de envelop begint; bij de complete ballon staan mand en tuig ervoor.
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

{
  const MAND_HALF = 0.24;  // mand 0.48 breed — 1 : 7.9 van de envelop,
                           //  en 0.8 × de hals, dus hij hangt er net binnen
  const MAND_H = 0.4;
  const RING_R = 0.22;     // ring net binnen de mandbreedte
  const TUIG = 0.5;        // vrije hoogte tussen mandrand en hals

  const m = maakModel();
  const randTop = mand(m, MAND_HALF, MAND_H);
  const yHals = randTop + TUIG;
  const ringOnder = randTop + TUIG * 0.42;
  tuig(m, {
    mandHalf: MAND_HALF, mandH: MAND_H, randTop,
    ringR: RING_R, ringOnder, ringBoven: ringOnder + 0.05, yHals,
  });
  const vanaf = m.posities.length / 3;
  envelop(m, PROFIEL, yHals);
  controleerEnvelop(m, vanaf);
  schrijfGlb('balloon-basket', m);
}

console.log(
  `verhoudingen: envelop ${(RMAX * 2).toFixed(2)} breed, ` +
  `hals ${(HALS * 2).toFixed(2)} (1:${(RMAX / HALS).toFixed(1)}), ` +
  `mand 0.48 (1:${(RMAX * 2 / 0.48).toFixed(1)})`,
);
