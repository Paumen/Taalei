/**
 * Bouwt kits/taalei-kit/balloon.glb: een luchtballon met envelop en tuig.
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
 * -- tuig ------------------------------------------------------------------
 * Onder de hals hangt het tuig: zestien touwen van de halsrand naar een
 * achtkantige branderring, en de brander midden in die ring. Geen mand — de
 * ring is het onderste onderdeel en hangt aan de touwen, zoals het in het
 * echt ook gaat.
 *
 * Verhoudingen als bij een echte ballon (envelop ± 20 m, hals ± 2.5 m):
 *
 *   hals : envelop  ≈ 1 : 6      de hals is een smalle keel, geen wijde rok
 *   ring : envelop  ≈ 1 : 8.6    de envelop domineert volledig
 *   ring : hals     ≈ 0.7        de ring hangt bínnen de halsdoorsnede
 *   tuig            ≈ 0.9 × de halsdoorsnede vrije hoogte
 *
 * Het tuig mag meer detail hebben dan een gewone kit-asset: het is het enige
 * stuk waar je van dichtbij naar kijkt.
 *
 * Kleuren komen uit kits/palet.json ("gedeeld"); aan het palet is niets
 * toegevoegd. Het tuig gebruikt geen cel die de envelop niet al gebruikte.
 *
 *   gebroken wit  #f0ece3  cel 5/2   banen van de envelop, touwen
 *   terracotta    #d07b56  cel 5/0   accentbanen en kruin
 *   staalblauw    #6d738a  cel 15/3  accentbanen, halsband, naden, brander
 *   inktzwart     #3e3e44  cel 10/0  kroonplaat, halsgat, branderring
 *   amber         #ffb349  cel 6/0   de keel en de mond van de brander
 *
 * PO-notities:
 *   - De naden van de banen zijn lijnen (outlines). Bewust gehouden: zonder
 *     naden leest de envelop als een gladde bal. De touwen zijn géén lijnen
 *     maar dunne staven — een touw is een onderdeel, geen contour.
 *   - Geen transparantie of emissive; de mond van de brander is een gewoon
 *     amberkleurig paletvlak.
 *   - Oorsprong: spil in het midden van de voetafdruk, Y = 0 onder de
 *     brander. Let op: dat is verplaatst — vóór het tuig lag Y = 0 bij de
 *     hals, dus een scène die de oude balloon ophing moet hem 0.42 minder
 *     optillen.
 *   - 884 driehoeken tegenover 480 voor de kale envelop; de dichtheid blijft
 *     met 13 tri/unit³ ver onder de limiet.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'taalei-kit');

const BANEN = 16;      // banen van de envelop; het maximum uit de stijlgids
const BANDEN = 12;     // hoogtebanden van de envelop
const RING_ZIJDEN = 8; // branderring en de keel van de brander

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
const AMBER = cel(6, 0);
/** dv verschuift binnen de verloopstrook van de cel: positief = donkerder. */
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
 * As-evenwijdig blok tussen twee tegenoverliggende hoeken. Vlakken die tegen
 * een ander onderdeel aan liggen kun je weglaten; dat scheelt driehoeken
 * zonder dat je er iets van ziet.
 */
function blok(m, [x0, y0, z0], [x1, y1, z1], kleurCel, dv = 0, { onder = true, boven = true } = {}) {
  const c = uv(kleurCel, dv);
  m.vlak([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], c);   // +x
  m.vlak([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], c);   // -x
  m.vlak([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c);   // +z
  m.vlak([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c);   // -z
  if (boven) m.vlak([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], c);
  if (onder) m.vlak([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], c);
}

/**
 * Staaf tussen twee punten: de dunste vorm die de stijlgids toestaat zonder
 * in outlines te vervallen. `dikte` is de kleinste maat van de doorsnede —
 * bij een oneven aantal zijden de afstand van een punt tot de overstaande
 * zijde, bij een even aantal die tussen twee zijden. Rekenen met de
 * omgeschreven straal zou staven onder het minimum van 0.015 opleveren.
 * De uiteinden steken in de aangrenzende delen; eindkappen zijn niet nodig.
 */
function staaf(m, P0, P1, dikte, kleurCel, dv = 0, zijden = 3) {
  const straal = zijden % 2
    ? dikte / (1 + Math.cos(Math.PI / zijden))
    : dikte / (2 * Math.cos(Math.PI / zijden));
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
  for (let z = 0; z < zijden; z++) {
    const a0 = (z / zijden) * Math.PI * 2;
    const a1 = ((z + 1) / zijden) * Math.PI * 2;
    m.vlak(rib(P0, a0), rib(P0, a1), rib(P1, a1), rib(P1, a0), uv(kleurCel, dv));
  }
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

/* -- tuig: branderring, brander en touwen -----------------------------------
 * Zestien touwen hangen aan de halsrand en dragen de branderring; in het
 * midden van de ring zit de brander. De touwen staan op de naden van de
 * envelop, zodat ze de banen voortzetten in plaats van er dwars op te staan.
 */
function tuig(m, { ringR, ringOnder, ringBoven, yHals }) {
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

  /* brander: een staalblauw blok met de kranen, midden op de ring, daarboven
   * een achthoekige keel die naar amber overloopt — een gewoon paletvlak,
   * geen emissive. Staalblauw en niet zwart, anders lopen ring, stijlen en
   * brander van een afstand in elkaar over tot één donkere klont. */
  const bHalf = ringR * 0.32;
  const bOnder = ringOnder - 0.01;
  const bBoven = ringBoven + 0.05;
  blok(m, [-bHalf, bOnder, -bHalf], [bHalf, bBoven, bHalf], STAAL, 16);
  const keelR = bHalf * 0.85;
  const keelNaad = bBoven + 0.062;
  const keelTop = bBoven + 0.09;
  for (let k = 0; k < RING_ZIJDEN; k++) {
    const a0 = (k / RING_ZIJDEN) * Math.PI * 2;
    const a1 = ((k + 1) / RING_ZIJDEN) * Math.PI * 2;
    m.vlak(punt(keelR, bBoven, a0), punt(keelR, keelNaad, a0), punt(keelR, keelNaad, a1), punt(keelR, bBoven, a1), uv(STAAL, -8));
    m.vlak(punt(keelR, keelNaad, a0), punt(keelR, keelTop, a0), punt(keelR, keelTop, a1), punt(keelR, keelNaad, a1), uv(AMBER, 24));
    m.driehoek([0, keelTop, 0], punt(keelR * 0.94, keelTop, a1), punt(keelR * 0.94, keelTop, a0), uv(AMBER, -20));
  }

  /* touwen: van de ring naar de halsrand, op de naadposities van de envelop.
   *
   * Ze zijn touw en geen staal: kabelkleurig grijsblauw, kaarsrecht en in
   * één stuk lazen ze als tralies van een kooi. Nu in het zand van de
   * paletcel 5/3, dunner dan de stijlen, en in drie schotjes langs een boog
   * die halverwege iets naar buiten staat — precies de rondte die een touw
   * onder spanning aan een wijdere halsrand maakt. De knik per schotje geeft
   * bovendien een lichtverschil per stuk, zoals een gedraaide streng. */
  const TOUW_DEEL = 3;
  const BOCHT = 0.022;
  for (let baan = 0; baan < BANEN; baan++) {
    const hoek = (baan / BANEN) * Math.PI * 2;
    const [r0, y0] = [ringR * 0.99, ringBoven - 0.015];
    const [r1, y1] = [HALS * 0.97, yHals + 0.03];
    const opTouw = (t) => punt(
      r0 + (r1 - r0) * t + BOCHT * Math.sin(Math.PI * t),
      y0 + (y1 - y0) * t,
      hoek,
    );
    for (let d = 0; d < TOUW_DEEL; d++) {
      staaf(m, opTouw(d / TOUW_DEEL), opTouw((d + 1) / TOUW_DEEL), 0.015, WIT, 10 + d * 14);
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

/* -- het model ------------------------------------------------------------- */

const RING_R = 0.22;     // branderring
const RING_H = 0.05;     // hoogte van de band
const RING_ONDER = 0.01; // het branderblok steekt 0.01 onder de ring uit; zo
                         // ligt het laagste punt van het model precies op Y=0
const TUIG = 0.36;       // vrije hoogte tussen ring en hals

{
  const m = maakModel();
  const yHals = RING_ONDER + RING_H + TUIG;
  tuig(m, { ringR: RING_R, ringOnder: RING_ONDER, ringBoven: RING_ONDER + RING_H, yHals });
  const vanaf = m.posities.length / 3;
  envelop(m, PROFIEL, yHals);
  controleerEnvelop(m, vanaf);
  schrijfGlb('balloon', m);
}

console.log(
  `verhoudingen: envelop ${(RMAX * 2).toFixed(2)} breed, ` +
  `hals ${(HALS * 2).toFixed(2)} (1:${(RMAX / HALS).toFixed(1)}), ` +
  `ring ${(RING_R * 2).toFixed(2)} (1:${(RMAX / RING_R).toFixed(1)})`,
);
