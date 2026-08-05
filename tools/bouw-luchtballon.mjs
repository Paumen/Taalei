/**
 * Bouwt de luchtballonnen van kits/taalei-kit: balloon.glb (envelop en tuig,
 * zonder mand) en drie mandvarianten daarop.
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
 * -- manden -----------------------------------------------------------------
 * balloon.glb houdt het bij de ring. Daarnaast staan er drie varianten mét
 * mand, zodat je er één kunt kiezen zonder de kale ballon kwijt te raken:
 *
 *   balloon-basket-round   rond, gevlochten riet, voetring en omgeslagen rand,
 *                          aan vier stijlen
 *   balloon-basket-square  afgeknot vierkant riet — de vorm van een echte
 *                          ballonmand — met hoekstukken, een gestoffeerde rand
 *                          en twee sloffen onder de bodem
 *   balloon-basket-crate   recht vrachtkrat van staande planken tussen vier
 *                          hoekstijlen, twee ijzeren banden, aan vier touwen
 *
 * De mand is ± 0.75 breed tegenover 3.78 voor de envelop (1 : 5). Dat is de
 * verhouding van een echte ballon; groter maken leest als een gondel.
 *
 * Kleuren komen uit kits/palet.json ("gedeeld").
 *
 *   gebroken wit  #f0ece3  cel 5/2   banen van de envelop, touwen
 *   terracotta    #d07b56  cel 5/0   accentbanen, kruin, planken en bodems
 *   staalblauw    #6d738a  cel 15/3  accentbanen, halsband, naden, brander
 *   inktzwart     #3e3e44  cel 10/0  kroonplaat, halsgat, ring, kratbanden
 *   amber         #ffb349  cel 6/0   de keel en de mond van de brander
 *   leerbruin     #995a41  cel 12/0  hoekstijlen en randlijst van het krat
 *   zand          #f0c59d  cel 5/3   het vlechtwerk van de twee rieten manden
 *   tan           #dd9f79  cel 13/0  het beslag van die twee: voetring, rand,
 *                                    hoekstukken, sloffen, stijlen
 *
 * PO-notities:
 *   - De twee rieten manden dragen twee kleuren uit hetzelfde warme hoekje
 *     van het palet: zand voor het vlechtwerk, tan voor alles wat eraan
 *     vastzit. Het beslag staat bovendien onderin de tancel, zodat het als
 *     beslag van de mand af leest en niet als een vierde vlechtband. Binnen
 *     één cel was dat verschil niet te halen: zowel zand als tan verlopen
 *     vlak, dus de diepte moet van de tweede cel komen. Eén materiaal, één kleur; het onderscheid komt van de
 *     banden, niet van een tweede kleur die ernaast gaat liggen. Het krat is
 *     het enige dat wél uit meer kleuren bestaat: planken, ijzer en hout.
 *   - Aan het palet is niets toegevoegd: het vlechtwerk gebruikt het tan van
 *     cel 13/0, dat de andere kits al dragen.
 *   - De naden van de banen zijn lijnen (outlines). Bewust gehouden: zonder
 *     naden leest de envelop als een gladde bal. De touwen zijn géén lijnen
 *     maar dunne staven — een touw is een onderdeel, geen contour.
 *   - Geen transparantie of emissive; de mond van de brander is een gewoon
 *     amberkleurig paletvlak.
 *   - Oorsprong: spil in het midden van de voetafdruk, Y = 0 onder het laagste
 *     punt. Bij balloon.glb is dat de brander, bij de varianten de bodem van
 *     de mand; die zijn dus 0.7 à 0.8 hoger dan balloon.glb (4.98 tegenover
 *     5.65 – 5.76 totaal). Een scène die van de ene op de andere overstapt
 *     moet het ophangpunt navenant bijstellen.
 *   - 884 driehoeken voor balloon.glb, 1112 – 1204 met mand; de dichtheid
 *     blijft met 15 tri/unit³ ver onder de limiet.
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
const LEER = cel(12, 0);
const ZAND = cel(5, 3);   // het vlechtwerk zelf
const RIET = cel(13, 0);  // het beslag van de mand
const HOUT = TERRACOTTA;

/* De rieten manden staan in één kleur: het vlechtwerk loopt in twee lichte
 * banden met een donkere ertussen, en álles wat eraan vastzit — voetring,
 * rand, hoekstukken, sloffen, stijlen — krijgt precies de tint van die
 * donkere band. Eén materiaal, één kleur; de banden doen het werk. Het
 * verloop van de tancel is vrij vlak, dus de banden staan wat verder uit
 * elkaar dan je bij een steilere cel nodig zou hebben. */
const VLECHT_LICHT = -14;
const VLECHT_DONKER = 16;
/** Alles wat geen vlechtwerk is — voetring, rand, hoekstukken, sloffen,
 *  stijlen — staat op de paletkleur van de tancel zelf. Het verschil met het
 *  vlechtwerk komt van de cel ernaast, niet van de diepte binnen deze: zand
 *  en tan verlopen allebei te vlak om dat met dv alleen te halen. */
const BESLAG = 0;
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

/* -- gereedschap voor de manden ---------------------------------------------
 * Een mand is een lage, brede vorm van vlakke stukken. Alles hieronder werkt
 * op een grondvlak: een lijst (x, z)-punten op oplopende hoek, die je op elke
 * hoogte met een schaalfactor groter of kleiner zet. Zo zijn een ronde en een
 * vierkante mand hetzelfde stukje code met een ander grondvlak.
 */

/** Regelmatige veelhoek op straal 1. */
const veelhoek = (zijden, draai = 0) =>
  Array.from({ length: zijden }, (_, i) => {
    const a = ((i + draai) / zijden) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });

/**
 * Vierkant met afgesneden hoeken, op halve zijde 1. Een echte ballonmand is
 * vierkant met ronde hoeken; afsnijden is daar de vlakke-stukken-versie van,
 * en de vier schuine hoekvlakken zijn meteen de plek voor de leren hoekstukken.
 */
function afgeknotVierkant(snee) {
  const k = 1 - snee;
  return [[1, k], [k, 1], [-k, 1], [-1, k], [-1, -k], [-k, -1], [k, -1], [1, -k]];
}

/** Wand tussen twee doorsneden van hetzelfde grondvlak. */
function schil(m, grond, y0, s0, y1, s1, kleur, binnen = false) {
  for (let i = 0; i < grond.length; i++) {
    const a = grond[i], b = grond[(i + 1) % grond.length];
    const A0 = [a[0] * s0, y0, a[1] * s0], B0 = [b[0] * s0, y0, b[1] * s0];
    const A1 = [a[0] * s1, y1, a[1] * s1], B1 = [b[0] * s1, y1, b[1] * s1];
    const c = typeof kleur === 'function' ? kleur(i) : kleur;
    if (binnen) m.vlak(A0, B0, B1, A1, c); else m.vlak(A0, A1, B1, B0, c);
  }
}

/** Vlakke ring tussen twee schalen van het grondvlak, op één hoogte. */
function krans(m, grond, y, sBuiten, sBinnen, celUv, omhoog = true) {
  for (let i = 0; i < grond.length; i++) {
    const a = grond[i], b = grond[(i + 1) % grond.length];
    const A = [a[0] * sBuiten, y, a[1] * sBuiten];
    const B = [b[0] * sBuiten, y, b[1] * sBuiten];
    const C = [b[0] * sBinnen, y, b[1] * sBinnen];
    const D = [a[0] * sBinnen, y, a[1] * sBinnen];
    if (omhoog) m.vlak(A, D, C, B, celUv); else m.vlak(A, B, C, D, celUv);
  }
}

/** Dichte bodem of deksel op één hoogte. */
function deksel(m, grond, y, s, celUv, omhoog = true) {
  for (let i = 0; i < grond.length; i++) {
    const a = grond[i], b = grond[(i + 1) % grond.length];
    const A = [a[0] * s, y, a[1] * s], B = [b[0] * s, y, b[1] * s];
    if (omhoog) m.driehoek([0, y, 0], B, A, celUv); else m.driehoek([0, y, 0], A, B, celUv);
  }
}

/** Deterministische kleurschommeling per vlak, in texels binnen de cel. */
const schommel = (i, zaad, sterkte) => Math.round((hash2(i * 5 + zaad, zaad) - 0.5) * sterkte);

/* -- de drie manden ---------------------------------------------------------
 * Elke mandfunctie bouwt vanaf Y = 0 omhoog en geeft terug hoe hoog de rand
 * komt; daarboven zet het model de stijlen, de branderring en de envelop. De
 * mand is ± 0.75 breed tegenover 3.78 voor de envelop (1 : 5), zoals de
 * verhouding bij een echte ballon.
 *
 * De drie ontwerpen verschillen in silhouet, materiaal én ophanging, zodat je
 * ze van een afstand uit elkaar houdt:
 *
 *   round   rond, gevlochten riet, leren rand, vier leren stijlen
 *   square  afgeknot vierkant, riet met leren hoekstukken en sloffen eronder
 *   crate   recht vierkant, planken met ijzeren banden, aan vier touwen
 */

const MAND_LUCHT = 0.20; // vrije hoogte tussen mandrand en branderring

/**
 * Vier stijlen of touwen van de mand naar de onderkant van de branderring, op
 * de diagonalen. Ze grijpen aan de bínnenkant van de rand aan, niet op de
 * buitenrand: daar staat de mand het dichtst bij de ring, en dat scheelt genoeg
 * spreiding om vier dragers te houden in plaats van vier spinnenpoten.
 */
function ophanging(m, { r, randHoogte, ringOnder, dikte, kleurCel, dv, zijden, voet: hoogte = -0.06 }) {
  for (let k = 0; k < 4; k++) {
    const hoek = (k / 4 + 1 / 8) * Math.PI * 2;
    const voet = punt(r, randHoogte + hoogte, hoek);
    const kop = punt(RING_R * 0.9, ringOnder + 0.02, hoek);
    staaf(m, voet, kop, dikte, kleurCel, dv, zijden);
  }
}

/**
 * Rond, gevlochten: twaalf vlakken rondom, licht uitlopend naar boven, in
 * drie vlechtlagen met per vlak een tint verschil. Zonder dat tintverschil is
 * het een gladde emmer; mét leest het als vlechtwerk zonder dat er ook maar
 * één driehoek bijkomt.
 */
function mandRond(m) {
  const grond = veelhoek(12, 0.5);
  const LAGEN = [[0.05, 0.30], [0.17, 0.325], [0.29, 0.35], [0.41, 0.365]];
  const RAND = 0.48;

  deksel(m, grond, 0, 0.30, uv(RIET, BESLAG + 10), false);  // onderkant
  schil(m, grond, 0, 0.30, 0.05, 0.30, uv(RIET, BESLAG));   // voetring
  for (let laag = 0; laag < LAGEN.length - 1; laag++) {
    const [y0, s0] = LAGEN[laag], [y1, s1] = LAGEN[laag + 1];
    // Per laag een grondtint, per vlak nog een kleine schommeling: zo lopen de
    // vlechtlagen als banden rond, maar blijft geen enkel vlak identiek.
    const basis = laag % 2 ? VLECHT_DONKER : VLECHT_LICHT;
    schil(m, grond, y0, s0, y1, s1, (i) => uv(ZAND, basis + schommel(i, laag + 1, 14)));
    schil(m, grond, y0, s0 - 0.045, y1, s1 - 0.045, uv(ZAND, 26), true);
  }
  deksel(m, grond, 0.05, 0.30, uv(RIET, BESLAG + 8));       // bodem
  // Rand: rolt over de bovenkant heen en steekt iets uit.
  schil(m, grond, 0.41, 0.385, RAND, 0.385, uv(RIET, BESLAG));
  krans(m, grond, RAND, 0.385, 0.315, uv(RIET, BESLAG));
  schil(m, grond, 0.41, 0.315, RAND, 0.315, uv(RIET, BESLAG + 8), true);
  krans(m, grond, 0.41, 0.385, 0.365, uv(RIET, BESLAG + 12), false);
  return RAND;
}

/**
 * Afgeknot vierkant, gevlochten: de vorm van een echte ballonmand. De vier
 * schuine hoekvlakken krijgen leer (hoekbeschermers), en onder de bodem lopen
 * twee houten sloffen — waar een ballonmand bij de landing op glijdt.
 */
function mandVierkantRiet(m) {
  const grond = afgeknotVierkant(0.24);
  const SLOF = 0.055;
  const LAGEN = [[SLOF, 0.33], [0.19, 0.345], [0.33, 0.355], [0.44, 0.36]];
  const RAND = 0.52;
  // Zijde i loopt van punt i naar punt i+1; de even zijden zijn de schuine
  // hoekvlakken, en die krijgen als hoekstuk de donkere bandtint.
  const isHoek = (i) => i % 2 === 0;

  deksel(m, grond, SLOF, 0.315, uv(RIET, BESLAG + 10), false);
  for (let laag = 0; laag < LAGEN.length - 1; laag++) {
    const [y0, s0] = LAGEN[laag], [y1, s1] = LAGEN[laag + 1];
    const basis = laag % 2 ? VLECHT_DONKER : VLECHT_LICHT;
    schil(m, grond, y0, s0, y1, s1, (i) => (isHoek(i)
      ? uv(RIET, BESLAG)
      : uv(ZAND, basis + schommel(i, laag + 2, 12))));
    schil(m, grond, y0, s0 - 0.04, y1, s1 - 0.04, uv(ZAND, 28), true);
  }
  deksel(m, grond, SLOF, 0.315, uv(RIET, BESLAG + 8));
  // Gestoffeerde rand: dikker dan de wand, in de donkere bandtint.
  schil(m, grond, 0.44, 0.385, RAND, 0.385, uv(RIET, BESLAG));
  krans(m, grond, RAND, 0.385, 0.30, uv(RIET, BESLAG));
  schil(m, grond, 0.44, 0.30, RAND, 0.30, uv(RIET, BESLAG + 8), true);
  krans(m, grond, 0.44, 0.385, 0.35, uv(RIET, BESLAG + 12), false);
  // Twee sloffen onder de bodem: waar een ballonmand bij de landing op glijdt.
  // Ze staan naar buiten en zijn smal genoeg om als losse balken te lezen —
  // breder gingen ze samen met de bodem op in één plint.
  for (const z of [-0.225, 0.225]) {
    blok(m, [-0.26, 0, z - 0.028], [0.26, SLOF, z + 0.028], RIET, BESLAG + 6, { boven: false });
  }
  return RAND;
}

/**
 * Recht vierkant krat: staande planken tussen vier stevige hoekstijlen, twee
 * ijzeren banden eromheen en een ijzeren randprofiel. Hangt niet aan stijlen
 * maar aan vier touwen, in dezelfde kleur als het touwwerk boven de ring —
 * vracht die je ergens afzet, geen passagiersmand.
 */
function mandKrat(m) {
  const H = 0.345;         // halve breedte tot aan de planken
  const POST = 0.08;       // dikte van een hoekstijl
  const VLOER = 0.07;
  const RAND = 0.50;
  const vierkant = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const PLANKEN = 5;

  // Vier hoekstijlen, van de grond tot net boven de rand: daar knopen de
  // touwen aan vast. Ze steken onderaan iets uit als pootjes, zodat het krat
  // op zijn hoeken staat en niet op zijn planken.
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const x = sx * (H - POST / 2), z = sz * (H - POST / 2);
    blok(m, [x - POST / 2, 0, z - POST / 2], [x + POST / 2, RAND + 0.03, z + POST / 2], LEER, 18);
  }

  // Zijwanden: per zijde vijf staande planken met elk een eigen tint.
  for (let k = 0; k < 4; k++) {
    const hoek = (k / 4) * Math.PI * 2;
    const uit = [Math.cos(hoek), 0, Math.sin(hoek)];
    const langs = [-Math.sin(hoek), 0, Math.cos(hoek)];
    const P = (u, y, d) => [uit[0] * d + langs[0] * u, y, uit[2] * d + langs[2] * u];
    const rek = H - POST;
    for (let p = 0; p < PLANKEN; p++) {
      const u0 = -rek + (2 * rek * p) / PLANKEN;
      const u1 = -rek + (2 * rek * (p + 1)) / PLANKEN;
      // Om en om een lichtere en een donkere plank, met daar bovenop nog wat
      // schommeling: zonder dat verschil is een zijde één oranje vlak en zie
      // je de planken pas als je er met je neus bovenop staat.
      const c = uv(HOUT, (p % 2 ? 26 : -6) + schommel(p, k + 3, 12));
      m.vlak(P(u0, VLOER, H), P(u0, RAND, H), P(u1, RAND, H), P(u1, VLOER, H), c);
      m.vlak(P(u0, VLOER, H - 0.035), P(u1, VLOER, H - 0.035), P(u1, RAND, H - 0.035), P(u0, RAND, H - 0.035), uv(HOUT, 26));
    }
    m.vlak(P(-rek, VLOER, H), P(-rek, VLOER, H - 0.035), P(rek, VLOER, H - 0.035), P(rek, VLOER, H), uv(HOUT, 30));
  }

  // Bodem: een dichte plaat met een donkere onderkant eronder.
  deksel(m, vierkant, VLOER, H, uv(HOUT, 14));
  deksel(m, vierkant, VLOER - 0.035, H, uv(HOUT, 30), false);
  schil(m, vierkant, VLOER - 0.035, H, VLOER, H, uv(HOUT, 26));

  // Twee ijzeren banden om de planken heen, en bovenop een houten randlijst.
  // Drie ijzeren banden was er één te veel: dan telt het oog donkere strepen
  // in plaats van dat het een krat ziet.
  for (const [y0, y1] of [[0.14, 0.175], [0.33, 0.365]]) {
    const s = H + 0.018;
    schil(m, vierkant, y0, s, y1, s, uv(INKT, 8));
    krans(m, vierkant, y1, s, H - 0.01, uv(INKT, -6));
    krans(m, vierkant, y0, s, H - 0.01, uv(INKT, 16), false);
  }
  const sRand = H + 0.022;
  schil(m, vierkant, RAND - 0.05, sRand, RAND, sRand, uv(LEER, 4));
  krans(m, vierkant, RAND, sRand, H - 0.03, uv(LEER, -8));
  krans(m, vierkant, RAND - 0.05, sRand, H - 0.01, uv(LEER, 22), false);
  return RAND;
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

/**
 * balloon.glb blijft wat het was: envelop en tuig, met de ring als onderste
 * onderdeel. De drie mandvarianten zetten er een mand onder; die groeit naar
 * beneden, dus alles bóven de mand schuift mee omhoog en Y = 0 ligt weer onder
 * het laagste punt — nu de bodem van de mand.
 */
const VARIANTEN = [
  { naam: 'balloon' },
  { naam: 'balloon-basket-round', mand: mandRond, ophangen: { r: 0.31, dikte: 0.030, kleurCel: RIET, dv: BESLAG, zijden: 4 } },
  { naam: 'balloon-basket-square', mand: mandVierkantRiet, ophangen: { r: 0.34, dikte: 0.032, kleurCel: RIET, dv: BESLAG, zijden: 4 } },
  // Het krat hangt aan touwen die aan de koppen van de hoekstijlen vastzitten;
  // die staan verder uit het midden dan een mandrand, dus krijgt het meer
  // lucht tot de ring — anders staan de touwen te ver open.
  { naam: 'balloon-basket-crate', mand: mandKrat, lucht: 0.29, ophangen: { r: 0.425, voet: 0.015, dikte: 0.022, kleurCel: WIT, dv: 12, zijden: 3 } },
];

for (const variant of VARIANTEN) {
  const m = maakModel();
  const randHoogte = variant.mand ? variant.mand(m) : 0;
  const ringOnder = variant.mand ? randHoogte + (variant.lucht ?? MAND_LUCHT) : RING_ONDER;
  const yHals = ringOnder + RING_H + TUIG;
  tuig(m, { ringR: RING_R, ringOnder, ringBoven: ringOnder + RING_H, yHals });
  if (variant.mand) ophanging(m, { ...variant.ophangen, randHoogte, ringOnder });
  const vanaf = m.posities.length / 3;
  envelop(m, PROFIEL, yHals);
  controleerEnvelop(m, vanaf);
  schrijfGlb(variant.naam, m);
}

console.log(
  `verhoudingen: envelop ${(RMAX * 2).toFixed(2)} breed, ` +
  `hals ${(HALS * 2).toFixed(2)} (1:${(RMAX / HALS).toFixed(1)}), ` +
  `ring ${(RING_R * 2).toFixed(2)} (1:${(RMAX / RING_R).toFixed(1)})`,
);
