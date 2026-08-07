/**
 * Bouwt de orka en het orkakalf van kits/onderwater-kit: orca.glb en
 * orca-calf.glb.
 *
 * Draai vanuit de repo-root:  node tools/bouw-orka.mjs
 * Controleer daarna met:      node tools/toets-orka.mjs
 *
 * De twee zijn de enige modellen in deze kit die niet van Quaternius komen:
 * de pack heeft een walvis, een dolfijn en twee haaien, maar geen orka. Ze
 * horen desondanks hier en niet bij taalei-kit, omdat al het zeeleven hier
 * staat en deze kit met eigen materiaalkleuren werkt in plaats van de gedeelde
 * colormap — precies wat een zwart-witte orka nodig heeft.
 *
 * -- vorm ------------------------------------------------------------------
 * De romp is een loft: een tabel van spanten (STATIONS) geeft op elke plek
 * langs de lengte de halve breedte, de halve hoogte en de hoogte van het hart.
 * Daartussen interpoleert een monotone kubiek (PCHIP), zodat de omtreklijn
 * glad loopt zonder dat hij buiten de tabelwaarden uitschiet — een gewone
 * spline maakt van de bolle kop een bult. Elk spant wordt een ring van twintig
 * punten; de onderste helft van elke ring wordt met 0,86 platgedrukt, want de
 * buik van een orka is vlakker dan zijn rug.
 *
 * Vinnen en staart zijn platen: een 2D-omtrek, dik gemaakt in de richting
 * loodrecht op het vlak. De voor- en achterrand van de rugvin en de staart
 * komen uit dezelfde soort curve als de romp, zodat de randen krommen in
 * plaats van te knikken.
 *
 * De vlekken — buik, oogvlek, zadel — zijn geen stuk van de rompmazen maar
 * eigen schaaltjes die vlak boven de huid zweven (`lift`). Een vlek die uit
 * het rompraster wordt gesneden is een paar quads groot en blijft daardoor
 * altijd een blokje; als eigen schaal met een eigen gladde omtrek kan hij de
 * vorm hebben die hij hoort te hebben.
 *
 * -- kalf ------------------------------------------------------------------
 * Het kalf is niet de orka × 0,371: een jong dier heeft naar verhouding een
 * dikkere kop, een rondere romp en een veel kleinere rugvin. HOOFD_KALF zet
 * die verhoudingen; de rugvin heeft een eigen, lagere omtrek. Daarna gaat het
 * hele model op 0,371, wat neerkomt op een kalf van ± 2,6 m tegenover een
 * orka van 7 m.
 *
 * -- kleur -----------------------------------------------------------------
 * Geen colormap maar eigen materiaalkleuren, zoals de rest van deze kit
 * (stijlgids §1, uitzondering voor de onderwater-kit). Drie materialen:
 *
 *   Orca          #272a2f  romp, rugvin, staart, borstvinnen
 *   OrcaWhite     #f7f8f5  buikvlek, oogvlek, onderkant van de staart
 *   OrcaSaddle    #84888f  de grijze zadelvlek achter de rugvin
 *
 * Het kalf draagt dezelfde drie plekken in eigen kleuren: zijn wit is warmer
 * (#f9f7f2) en zijn zadel iets lichter (#88898e). Dat is geen slordigheid maar
 * het verschil dat je bij een pasgeboren orka ziet — die is roomkleurig tot
 * perzik waar een volwassen dier wit is. De hexen hierboven staan als cellen
 * in het `onderwater`-palet van kits/palet.json; ze komen daar uit dit script,
 * dat ze bij elke bouw afdrukt.
 *
 * PO-notities:
 *   - Geen transparantie, geen emissive, metallic 0, roughness 0,75 zoals de
 *     rest van deze kit.
 *   - Boven het driehoekbudget (stijlgids §4): 1133 per unit voor de orka,
 *     2922 voor het kalf tegen een grens van 1000. Bewust: het model is als
 *     geleverd ingeladen, met twintig segmenten per doorsnede in plaats van de
 *     zestien die §2 toestaat. Een gladde walvisrug verdraagt geen facetten van
 *     22,5°, en de kit waarin hij staat is sowieso de gladde uitzondering.
 *     Wie hem wil verlagen: SEGMENTEN en SPANTEN zijn de twee knoppen.
 *   - Acht tekenopdrachten per dier, één per lichaamsdeel. Dat is meer dan een
 *     prop nodig heeft, maar de delen dragen drie verschillende materialen en
 *     de vlekken moeten los van de romp blijven.
 *
 * -- rig -------------------------------------------------------------------
 * Acht wervels van snuit naar staart, elk met een eigen fase in de zwemslag:
 * de golf loopt naar achteren en wordt naar achteren toe groter, zodat de
 * staart slaat en de kop bijna stilstaat. Verticaal, niet horizontaal — een
 * walvis slaat op en neer, een vis heen en weer.
 *
 * De vinnen krijgen niet de gewichten van hun eigen plek in de romp maar die
 * van hun aanhechtingspunt (VINANKERS). Anders buigt de romp onder een vin
 * vandaan die aan één wervel hangt; nu blijft elke vin stijf én zit hij vast
 * aan het huidoppervlak.
 *
 * -- oorsprong --------------------------------------------------------------
 * Zoals de rest van de kit (stijlgids §5): grondvlak gecentreerd op x/z, y=0
 * onder het laagste punt. Dat zit op de wortelnode, niet in de vertexdata —
 * bij een geskind model bepalen de gewrichten waar de vertices uitkomen, dus
 * mesh én skelet moeten samen verschuiven.
 *
 * -- herkomst ---------------------------------------------------------------
 * De vorm komt uit twee Python-scripts (build_orca.py en rig_orca.py) die met
 * numpy, trimesh en scipy werkten. Die zijn hier naar Node overgezet — de
 * repo heeft die pakketten niet en al het andere gereedschap is .mjs — inclusief
 * de PCHIP-interpolatie van scipy, die de vorm van de romp bepaalt. De
 * geometrie is punt voor punt dezelfde als die van de scripts.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schrijfGlb } from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'onderwater-kit');

/* -- rekengereedschap ------------------------------------------------------ */

/** Als np.linspace: n punten van a tot b, met of zonder het eindpunt. */
function reeks(a, b, n, eindpunt = true) {
  const stap = (b - a) / (eindpunt ? n - 1 : n);
  const uit = Array.from({ length: n }, (_, i) => a + i * stap);
  if (eindpunt && n > 1) uit[n - 1] = b;
  return uit;
}

/**
 * Monotone kubieke interpolatie (PCHIP), zoals scipy's PchipInterpolator.
 *
 * Waarom monotoon en niet een gewone kubische spline: een spline legt door de
 * spanttabel een kromme die tussen twee punten hóger kan uitkomen dan allebei
 * die punten. Bij de kop van de orca — waar de tabel snel dikker wordt en dan
 * afvlakt — levert dat een zichtbare bult op. PCHIP kiest de afgeleiden zo dat
 * dat niet kan: tussen twee tabelwaarden blijft de kromme tussen die waarden.
 *
 * De afgeleide in elk binnenpunt is het gewogen harmonische gemiddelde van de
 * twee aangrenzende hellingen, en nul zodra die hellingen van teken wisselen
 * (dan ligt daar een top). De twee randpunten krijgen een eenzijdige
 * driepuntsschatting, bijgesteld als die schatting de vorm zou omkeren.
 */
function pchip(x, y) {
  const n = x.length;
  const h = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
    m.push((y[i + 1] - y[i]) / h[i]);
  }

  const d = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (Math.sign(m[i]) !== Math.sign(m[i - 1]) || m[i] === 0 || m[i - 1] === 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  }

  /* Eenzijdige driepuntsschatting voor een randpunt (Moler, Numerical
   * Computing with MATLAB §3.6): eerst schatten, dan de vorm bewaken. */
  const rand = (h0, h1, m0, m1) => {
    const g = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (Math.sign(g) !== Math.sign(m0)) return 0;
    if (Math.sign(m0) !== Math.sign(m1) && Math.abs(g) > 3 * Math.abs(m0)) return 3 * m0;
    return g;
  };
  d[0] = rand(h[0], h[1], m[0], m[1]);
  d[n - 1] = rand(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);

  /* Per interval de coëfficiënten in machten van (v - x[i]), zoals scipy ze
   * in zijn stuksgewijze polynoom zet. */
  const c = [];
  for (let i = 0; i < n - 1; i++) {
    const t = (d[i] + d[i + 1] - 2 * m[i]) / h[i];
    c.push([t / h[i], (m[i] - d[i]) / h[i] - t, d[i], y[i]]);
  }

  return (v) => {
    let i = 0;
    while (i < n - 2 && v >= x[i + 1]) i++;
    const s = v - x[i];
    const [c0, c1, c2, c3] = c[i];
    return ((c0 * s + c1) * s + c2) * s + c3;
  };
}

/* -- mazen ----------------------------------------------------------------
 * Een maas is niets meer dan { V: hoekpunten, F: driehoeken }; alles hieronder
 * werkt daarop. Pas bij het wegschrijven wordt er glTF van gemaakt.
 */

const kruis = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const min3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Genormaliseerde normaal per driehoek. */
function vlaknormalen({ V, F }) {
  return F.map(([a, b, c]) => {
    const n = kruis(min3(V[b], V[a]), min3(V[c], V[a]));
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return n.map((v) => v / l);
  });
}

/** Zwaartepunt per driehoek. */
const vlakmiddens = ({ V, F }) =>
  F.map((f) => [0, 1, 2].map((as) => (V[f[0]][as] + V[f[1]][as] + V[f[2]][as]) / 3));

/** Draait de winding om, zodat de buitenkant de andere kant op wijst. */
const keerOm = ({ V, F }) => ({ V, F: F.map(([a, b, c]) => [c, b, a]) });

/**
 * Het getekende volume van een gesloten maas: positief als de driehoeken naar
 * buiten wijzen, negatief als de maas binnenstebuiten staat.
 */
function getekendVolume({ V, F }) {
  let volume = 0;
  for (const [a, b, c] of F) {
    const [p, q, r] = [V[a], V[b], V[c]];
    volume +=
      p[0] * (q[1] * r[2] - q[2] * r[1]) -
      p[1] * (q[0] * r[2] - q[2] * r[0]) +
      p[2] * (q[0] * r[1] - q[1] * r[0]);
  }
  return volume / 6;
}

/**
 * Zet een gesloten maas met de goede kant naar buiten.
 *
 * Nodig omdat de winding afhangt van de richting waarin de omtrek of de ring
 * toevallig rondloopt, en dat per onderdeel anders uitpakt: van de aangeleverde
 * vorm stonden de romp, de borstvinnen en de staart binnenstebuiten en de
 * rugvin niet. Dat is niet onschuldig. Bij achterkantverwijdering valt de
 * dichtstbijzijnde wand weg en kijk je dwars door het dier heen — het leest als
 * doorzichtig — en de staart laat van bovenaf zijn witte onderkant zien in
 * plaats van zijn zwarte bovenkant. De normalen wijzen dan bovendien naar
 * binnen, dus ook de belichting klopt niet.
 *
 * Het volume beslist, niet een lijst met namen: zo staat elk onderdeel goed,
 * ook een dat later wordt toegevoegd. De vlekken gaan hier niet langs — dat
 * zijn open velletjes zonder volume, die richten zich op de romp (zie vlek()
 * en buikvlek()).
 */
const naarBuiten = (maas) => (getekendVolume(maas) < 0 ? keerOm(maas) : maas);

/** Spiegelt in het xy-vlak; de winding moet dan mee omkeren. */
const spiegel = ({ V, F }) => keerOm({ V: V.map(([x, y, z]) => [x, y, -z]), F });

/** Plakt mazen achter elkaar, met de driehoeken van de tweede opgeschoven. */
function samen(mazen) {
  const V = [];
  const F = [];
  for (const maas of mazen) {
    const basis = V.length;
    V.push(...maas.V);
    F.push(...maas.F.map((f) => f.map((i) => i + basis)));
  }
  return { V, F };
}

/**
 * Houdt alleen de opgegeven driehoeken over en gooit de hoekpunten weg waar
 * daarna niets meer naar wijst. De overgebleven hoekpunten houden hun
 * onderlinge volgorde.
 */
function deel({ V, F }, welke) {
  const gebruikt = [...new Set(welke.flatMap((i) => F[i]))].sort((a, b) => a - b);
  const kaart = new Map(gebruikt.map((oud, nieuw) => [oud, nieuw]));
  return {
    V: gebruikt.map((i) => V[i]),
    F: welke.map((i) => F[i].map((v) => kaart.get(v))),
  };
}

/**
 * Trekt een 2D-omtrek uit tot een dunne plaat op een eigen assenstelsel:
 * `xdir`/`ydir` spannen het vlak van de omtrek op, `zdir` is de dikte.
 * De omtrek moet in één richting rondlopen; de plaat krijgt een wand en twee
 * deksels.
 */
function plaat(omtrek, dikte, oorsprong, xdir, ydir, zdir) {
  const n = omtrek.length;
  const V = [];
  for (const kant of [1, -1]) {
    for (const [px, py] of omtrek) {
      const pz = (kant * dikte) / 2;
      V.push([0, 1, 2].map((as) => oorsprong[as] + px * xdir[as] + py * ydir[as] + pz * zdir[as]));
    }
  }

  const F = [];
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    F.push([k, n + k, k2], [k2, n + k, n + k2]);
  }
  for (let k = 1; k < n - 1; k++) F.push([0, k, k + 1], [n, n + k + 1, n + k]);
  return { V, F };
}

const graden = (d) => (d * Math.PI) / 180;

/** Draai om de x-as, daarna om de y-as — de stand van een borstvin. */
function draai(maas, omX, omY) {
  const [cx, sx] = [Math.cos(graden(omX)), Math.sin(graden(omX))];
  const [cy, sy] = [Math.cos(graden(omY)), Math.sin(graden(omY))];
  return {
    ...maas,
    V: maas.V.map(([x, y, z]) => {
      const [x1, y1, z1] = [cy * x + sy * z, y, -sy * x + cy * z];
      return [x1, cx * y1 - sx * z1, sx * y1 + cx * z1];
    }),
  };
}

const verschuif = (maas, [dx, dy, dz]) => ({
  ...maas,
  V: maas.V.map(([x, y, z]) => [x + dx, y + dy, z + dz]),
});

/* -- de romp ---------------------------------------------------------------
 * Per spant: t langs de lengte (0 = snuit, 1 = staartwortel), halve breedte,
 * halve hoogte, hoogte van het hart. De x hoort bij t als 1,05 − 2,10 t.
 */
const STATIONS = [
  [0.0, 0.05, 0.048, 0.0],
  [0.04, 0.107, 0.108, 0.004],
  [0.1, 0.149, 0.154, 0.008],
  [0.18, 0.194, 0.201, 0.008],
  [0.28, 0.222, 0.222, 0.004],
  [0.4, 0.225, 0.22, 0.0],
  [0.52, 0.208, 0.204, -0.004],
  [0.63, 0.175, 0.173, -0.008],
  [0.73, 0.132, 0.135, -0.01],
  [0.82, 0.091, 0.101, -0.01],
  [0.9, 0.057, 0.071, -0.008],
  [0.96, 0.036, 0.049, -0.005],
  [1.0, 0.022, 0.033, 0.0],
];

/** Kop-en-rompverdikking van het kalf, als factor over de spanttabel. */
const HOOFD_KALF = [
  [0.0, 1.34],
  [0.1, 1.29],
  [0.2, 1.19],
  [0.35, 1.06],
  [0.5, 1.0],
  [1.0, 1.0],
];

const SEGMENTEN = 20; // punten per doorsnede
const SPANTEN = 38; // doorsneden over de lengte
const BUIK = 0.86; // afplatting van de onderste helft van elke ring

/** De spanttabel voor één dier, met alle schaalfactoren er al in verwerkt. */
function spanten(kalf) {
  const st = STATIONS.map((rij) => [...rij]);
  if (kalf) {
    const f = pchip(
      HOOFD_KALF.map((r) => r[0]),
      HOOFD_KALF.map((r) => r[1]),
    );
    for (const rij of st) {
      const boost = f(rij[0]);
      rij[1] *= boost * 1.07;
      rij[2] *= boost * 1.05;
    }
  }
  for (const rij of st) {
    rij[1] *= 1.11; // breedte  -> 1,5 m
    rij[2] *= 1.2; //  hoogte   -> 1,5 m
  }
  return st;
}

function romp(st) {
  const tt = reeks(0, 1, SPANTEN);
  const t = st.map((r) => r[0]);
  const breed = pchip(t, st.map((r) => r[1]));
  const hoog = pchip(t, st.map((r) => r[2]));
  const hart = pchip(t, st.map((r) => r[3]));
  const hoek = reeks(0, 2 * Math.PI, SEGMENTEN, false);

  const V = [];
  for (const tv of tt) {
    const x = 1.05 - 2.1 * tv;
    const [w, h, c] = [breed(tv), hoog(tv), hart(tv)];
    for (const a of hoek) {
      const k = Math.sin(a) < 0 ? BUIK : 1.0;
      V.push([x, c + h * Math.sin(a) * k, w * Math.cos(a)]);
    }
  }

  const F = [];
  for (let i = 0; i < SPANTEN - 1; i++) {
    const [a, b] = [i * SEGMENTEN, (i + 1) * SEGMENTEN];
    for (let k = 0; k < SEGMENTEN; k++) {
      const k2 = (k + 1) % SEGMENTEN;
      F.push([a + k, b + k, a + k2], [a + k2, b + k, b + k2]);
    }
  }

  /* Snuit en staartpunt: één punt vooraan en achteraan, dichtgelegd met een
   * waaier. De ring is daar al zo klein dat een dop niet opvalt. */
  const snuit = V.length;
  V.push([1.05 + 0.02, hart(0), 0]);
  const punt = V.length;
  V.push([1.05 - 2.1 - 0.02, hart(1), 0]);
  for (let k = 0; k < SEGMENTEN; k++) {
    const k2 = (k + 1) % SEGMENTEN;
    F.push([snuit, k2, k]);
    F.push([punt, (SPANTEN - 1) * SEGMENTEN + k, (SPANTEN - 1) * SEGMENTEN + k2]);
  }
  return naarBuiten({ V, F });
}

/* -- vinnen ---------------------------------------------------------------- */

/**
 * Rugvin: hoog, smal en naar achteren hellend. Voor- en achterrand zijn eigen
 * krommes, zodat de vin bol staat in plaats van recht. Het kalf heeft er een
 * eigen, veel lagere versie van — bij een jong dier is de rugvin nauwelijks
 * meer dan een plooi, en de hoge driehoeksvin van een volwassen stier zou het
 * dier meteen groot maken.
 */
const RUGVIN = {
  orca: {
    voorY: [-0.09, 0.0, 0.12, 0.24, 0.34, 0.41, 0.451],
    voorX: [0.154, 0.15, 0.135, 0.112, 0.082, 0.046, 0.0],
    achterY: [-0.09, 0.0, 0.11, 0.22, 0.32, 0.4, 0.451],
    achterX: [-0.157, -0.152, -0.132, -0.107, -0.076, -0.04, 0.0],
  },
  kalf: {
    voorY: [-0.09, 0.0, 0.055, 0.105, 0.15, 0.18, 0.196],
    voorX: [0.15, 0.146, 0.134, 0.114, 0.084, 0.048, 0.014],
    achterY: [-0.09, 0.0, 0.05, 0.1, 0.145, 0.176, 0.196],
    achterX: [-0.152, -0.148, -0.134, -0.112, -0.08, -0.044, -0.014],
  },
};

function rugvin(kalf) {
  const { voorY, voorX, achterY, achterX } = RUGVIN[kalf ? 'kalf' : 'orca'];
  const voor = pchip(voorY, voorX);
  const achter = pchip(achterY, achterX);
  const ys = reeks(voorY[0], voorY[voorY.length - 1], 16);
  const omtrek = [
    ...ys.map((y) => [voor(y), y]),
    ...ys.slice(1, -1).reverse().map((y) => [achter(y), y]),
  ];
  return naarBuiten(plaat(omtrek, 0.058, [0.03, 0.21, 0.0], [1, 0, 0], [0, 1, 0], [0, 0, 1]));
}

/**
 * Borstvin: een brede, ronde peddel. `punt` maakt hem aan het uiteinde iets
 * spitser dan een zuivere ellips. Het kalf heeft er een die naar verhouding
 * breder en korter is.
 */
function borstvinnen(kalf) {
  const a = 0.128 * (kalf ? 1.18 : 1.0);
  const b = 0.255 * (kalf ? 0.92 : 1.0);
  const punt = 0.16;
  const omtrek = reeks(0, 2 * Math.PI, 22, false).map((th) => [
    a * Math.cos(th),
    b * Math.sin(th) * (1 + punt * Math.cos(th)) + 0.24,
  ]);

  /* Standaardpeddel: koorde langs +x, spanwijdte langs +z, dikte langs y.
   * Daarna kantelen (omlaag) en naar achteren strijken. */
  const vlak = naarBuiten(plaat(omtrek, 0.05, [0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]));
  const rechts = verschuif(draai(vlak, -16, -30), [0.4, -0.1, 0.115]);
  return samen([rechts, spiegel(rechts)]);
}

/**
 * Staartvin: twee horizontale bladen met een inkeping ertussen. Voor- en
 * achterrand komen weer van krommes; de achterrand loopt vlakker terug dan de
 * voorrand, waardoor de inkeping ondiep blijft.
 */
function staartvin() {
  const voor = pchip([0.0, 0.08, 0.16, 0.235, 0.286], [0.085, 0.048, -0.01, -0.105, -0.231]);
  const achter = pchip([0.0, 0.08, 0.155, 0.225, 0.286], [-0.135, -0.176, -0.203, -0.222, -0.231]);
  const boven = [
    ...reeks(0, 0.286, 13).map((y) => [voor(y), y]),
    ...reeks(0.286, 0, 13).slice(1).map((y) => [achter(y), y]),
  ];
  const omtrek = [...boven, ...boven.slice().reverse().slice(1, -1).map(([x, y]) => [x, -y])];
  return naarBuiten(plaat(omtrek, 0.05, [-1.03, 0.0, 0.0], [1, 0, 0], [0, 0, 1], [0, 1, 0]));
}

/* -- vlekken ---------------------------------------------------------------
 * De buikvlek, de oogvlek en het zadel liggen als eigen schaaltjes een fractie
 * boven de huid. `lift` zegt hoeveel: 1,055 zweeft duidelijk vrij, 1,0226 (het
 * zadel) ligt er bijna tegenaan omdat het over de rug loopt waar de romp
 * platter is.
 */

/** Het rompoppervlak als functie van lengte t en hoek a. */
function oppervlak(st) {
  const t = st.map((r) => r[0]);
  const breed = pchip(t, st.map((r) => r[1]));
  const hoog = pchip(t, st.map((r) => r[2]));
  const hart = pchip(t, st.map((r) => r[3]));
  const punt = (tv, a, lift) => {
    const tc = Math.min(Math.max(tv, 0), 1);
    const k = Math.sin(a) < 0 ? BUIK : 1.0;
    return [
      1.05 - 2.1 * tc,
      hart(tc) + hoog(tc) * lift * Math.sin(a) * k,
      breed(tc) * lift * Math.cos(a),
    ];
  };
  punt.hart = (tv) => hart(Math.min(Math.max(tv, 0), 1));
  return punt;
}

const OMLAAG = -Math.PI / 2;

/**
 * Buikvlek: één lange band over de onderkant. De halve hoek per plek komt uit
 * een eigen kromme — breed bij de kin en vlak voor de staart, ingesnoerd in
 * het midden. Dat is de vorm die een orka echt heeft; een band van gelijke
 * breedte leest als een streep verf.
 */
const BUIKVLEK = [
  [0.0, 0.0],
  [0.03, 0.92],
  [0.1, 1.4],
  [0.19, 1.32],
  [0.32, 1.0],
  [0.46, 0.82],
  [0.58, 0.9],
  [0.7, 1.28],
  [0.8, 1.44],
  [0.88, 1.02],
  [0.94, 0.34],
  [1.0, 0.0],
];

function buikvlek(opp, van = 0.012, tot = 0.965, nt = 56, na = 8) {
  const halfhoek = pchip(BUIKVLEK.map((r) => r[0]), BUIKVLEK.map((r) => r[1]));
  const ts = reeks(van, tot, nt);
  const V = [];
  for (const t of ts) {
    const h = Math.max(halfhoek(t), 0);
    for (const u of reeks(-1, 1, na)) V.push(opp(t, OMLAAG + u * h, 1.055));
  }
  const F = [];
  for (let i = 0; i < nt - 1; i++) {
    for (let k = 0; k < na - 1; k++) {
      const [a, b] = [i * na + k, (i + 1) * na + k];
      F.push([a, b, a + 1], [a + 1, b, b + 1]);
    }
  }
  const maas = { V, F };
  /* Naar buiten kijken is hier naar beneden kijken. */
  const gemiddeld = vlaknormalen(maas).reduce((s, n) => s + n[1], 0) / F.length;
  return gemiddeld > 0 ? keerOm(maas) : maas;
}

/**
 * Een ovale vlek op de huid: een waaier vanuit het midden naar een omtrek in
 * (t, hoek)-ruimte. `scheef` kantelt die omtrek, want de oogvlek van een orca
 * ligt schuin.
 */
function vlek(opp, t0, a0, rt, ra, { scheef = 0, n = 40, lift = 1.055 } = {}) {
  const V = [opp(t0, a0, lift)];
  for (const th of reeks(0, 2 * Math.PI, n, false)) {
    V.push(opp(t0 + rt * Math.cos(th), a0 + ra * Math.sin(th) + scheef * rt * Math.cos(th), lift));
  }
  const F = Array.from({ length: n }, (_, i) => [0, i + 1, 1 + ((i + 1) % n)]);
  const maas = { V, F };

  /* Naar buiten is hier van het hart van de romp vandaan. */
  const uit = [0, V[0][1] - opp.hart(t0), V[0][2]];
  const gemiddeld = vlaknormalen(maas)
    .reduce((s, nv) => [s[0] + nv[0], s[1] + nv[1], s[2] + nv[2]], [0, 0, 0]);
  const dot = gemiddeld[1] * uit[1] + gemiddeld[2] * uit[2];
  return dot < 0 ? keerOm(maas) : maas;
}

/* -- één dier -------------------------------------------------------------- */

/**
 * Bouwt alle onderdelen van één dier. De onderdelen blijven los: de rigger
 * moet weten wat rugvin, borstvin en staart zijn (die krijgen andere
 * gewichten), en de catalogus telt ze als aparte tekenopdrachten.
 */
function dier(kalf) {
  const st = spanten(kalf);
  const opp = oppervlak(st);

  const staart = staartvin();
  /* Onderkant van de staart is wit. Kiezen op hoogte, niet op normaal: de
   * winding van een plaat ligt niet vast. */
  const middens = vlakmiddens(staart);
  const midden = middens.reduce((s, c) => s + c[1], 0) / middens.length;
  const alle = staart.F.map((_, i) => i);
  const onder = alle.filter((i) => middens[i][1] < midden - 0.015);
  const onderIdx = new Set(onder);

  const oog = vlek(opp, 0.2, 0.3, 0.07 * (kalf ? 1.35 : 1.0), 0.34 * (kalf ? 1.25 : 1.0), {
    scheef: -3.0,
  });
  const zadel = vlek(opp, 0.585, Math.PI / 2 - 0.1, 0.105, 0.42, { lift: 1.0226 });

  return [
    { naam: 'OrcaBody', kleur: 'orka', maas: romp(st) },
    { naam: 'OrcaDorsal', kleur: 'orka', maas: rugvin(kalf) },
    { naam: 'OrcaFluke', kleur: 'orka', maas: deel(staart, alle.filter((i) => !onderIdx.has(i))) },
    { naam: 'OrcaFlukeWhite', kleur: 'wit', maas: deel(staart, onder) },
    { naam: 'OrcaPect', kleur: 'orka', maas: borstvinnen(kalf) },
    { naam: 'OrcaBelly', kleur: 'wit', maas: buikvlek(opp) },
    { naam: 'OrcaEye', kleur: 'wit', maas: samen([oog, spiegel(oog)]) },
    { naam: 'OrcaSaddle', kleur: 'zadel', maas: samen([zadel, spiegel(zadel)]) },
  ];
}

/* -- rig -------------------------------------------------------------------
 * De wervels staan op vaste x-posities van snuit naar staart. AMPLITUDE is de
 * uitslag per wervel en NASLAG de faseachterstand: samen laten ze een golf van
 * kop naar staart lopen die naar achteren toe groter wordt.
 */
const WERVELS = [0.95, 0.6, 0.28, -0.05, -0.4, -0.72, -1.0, -1.14];
const AMPLITUDE = [0.0, 0.004, 0.013, 0.032, 0.072, 0.128, 0.18, 0.205];
const NASLAG = reeks(0.0, 2.35, WERVELS.length);
const SLEUTELS = 33; // sleutelframes per zwemslag

/** Waar elke vin aan de ruggengraat hangt (x), ongeacht waar zijn punten liggen. */
const VINANKERS = {
  OrcaDorsal: 0.03,
  OrcaPect: 0.4,
  OrcaFluke: -0.985,
  OrcaFlukeWhite: -0.985,
};

/**
 * Lineaire blend over twee wervels: elk punt hangt aan het wervelpaar waar het
 * tussen ligt. Vier plekken per hoekpunt, waarvan twee leeg — dat is wat glTF
 * verwacht.
 */
function gewichten(x) {
  let seg = 0;
  while (seg < WERVELS.length - 2 && x < WERVELS[seg + 1]) seg++;
  const [x0, x1] = [WERVELS[seg], WERVELS[seg + 1]];
  const f = Math.min(Math.max((x0 - x) / Math.max(x0 - x1, 1e-6), 0), 1);
  return { j: [seg, seg + 1, 0, 0], w: [1 - f, f, 0, 0] };
}

/* -- glTF ------------------------------------------------------------------ */

const MATERIALEN = {
  /* Lineaire basiskleuren; het script drukt ze als sRGB-hex af voor palet.json. */
  orka: { naam: 'Orca', volwassen: [0.02, 0.023, 0.028], kalf: [0.02, 0.023, 0.028] },
  wit: { naam: 'OrcaWhite', volwassen: [0.93, 0.935, 0.915], kalf: [0.945, 0.928, 0.892] },
  zadel: { naam: 'OrcaSaddle', volwassen: [0.23, 0.245, 0.275], kalf: [0.245, 0.25, 0.272] },
};

/** Lineaire kleur → sRGB-hex, zoals de kleuren in palet.json staan. */
function hex(kleur) {
  return (
    '#' +
    kleur
      .map((c) => {
        const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(Math.max(s, 0), 1) * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/**
 * Bouwt het glTF van één dier: geometrie, skin, animatie en de wortelnode die
 * hem op zijn plek zet.
 */
function bouwGltf(onderdelen, kalf, schaal, maat) {
  const stukken = [];
  const bufferViews = [];
  const accessors = [];
  let lengte = 0;

  /** Zet een typed array in de buffer en geeft de accessor-index terug. */
  const zet = (data, componentType, type, target, minmax) => {
    while (lengte % 4 !== 0) {
      stukken.push(Buffer.alloc(1));
      lengte++;
    }
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    bufferViews.push({
      buffer: 0,
      byteOffset: lengte,
      byteLength: buf.length,
      ...(target ? { target } : {}),
    });
    stukken.push(buf);
    lengte += buf.length;

    const breedte = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    accessors.push({
      bufferView: bufferViews.length - 1,
      byteOffset: 0,
      componentType,
      count: data.length / breedte,
      type,
      ...(minmax ?? {}),
    });
    return accessors.length - 1;
  };

  const materialen = [];
  const materiaalIndex = new Map();
  const primitives = [];

  for (const { naam, kleur, maas } of onderdelen) {
    const { V, F } = maas;

    /* Normalen: de bijdragen van alle aanliggende driehoeken opgeteld, elk
     * gewogen met zijn oppervlak (de kruisproduct-lengte). Zonder die weging
     * trekt een sliver-driehoek de normaal van zijn buren scheef. */
    const N = V.map(() => [0, 0, 0]);
    for (const [a, b, c] of F) {
      const n = kruis(min3(V[b], V[a]), min3(V[c], V[a]));
      for (const i of [a, b, c]) for (const as of [0, 1, 2]) N[i][as] += n[as];
    }

    const anker = VINANKERS[naam];
    const pos = new Float32Array(V.length * 3);
    const nor = new Float32Array(V.length * 3);
    const joi = new Uint16Array(V.length * 4);
    const gew = new Float32Array(V.length * 4);

    V.forEach((p, i) => {
      const l = Math.hypot(N[i][0], N[i][1], N[i][2]) || 1;
      for (const as of [0, 1, 2]) {
        pos[i * 3 + as] = p[as];
        nor[i * 3 + as] = N[i][as] / l;
      }
      const { j, w } = gewichten(anker ?? p[0]);
      for (const k of [0, 1, 2, 3]) {
        joi[i * 4 + k] = j[k];
        gew[i * 4 + k] = w[k];
      }
    });

    /* min/max uit de float32-waarden zelf, niet uit de dubbele precisie
     * ervoor: de accessor moet de data omsluiten die er écht in staat. */
    const laag = [Infinity, Infinity, Infinity];
    const hoog = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) {
      const as = i % 3;
      laag[as] = Math.min(laag[as], pos[i]);
      hoog[as] = Math.max(hoog[as], pos[i]);
    }

    const idx = new Uint32Array(F.flat());
    if (!materiaalIndex.has(kleur)) {
      materiaalIndex.set(kleur, materialen.length);
      materialen.push({
        name: MATERIALEN[kleur].naam,
        pbrMetallicRoughness: {
          baseColorFactor: [...MATERIALEN[kleur][kalf ? 'kalf' : 'volwassen'], 1],
          metallicFactor: 0.0,
          roughnessFactor: 0.75,
        },
        alphaMode: 'OPAQUE',
      });
    }

    primitives.push({
      attributes: {
        POSITION: zet(pos, 5126, 'VEC3', 34962, { min: laag, max: hoog }),
        NORMAL: zet(nor, 5126, 'VEC3', 34962),
        JOINTS_0: zet(joi, 5123, 'VEC4', 34962),
        WEIGHTS_0: zet(gew, 5126, 'VEC4', 34962),
      },
      indices: zet(idx, 5125, 'SCALAR', 34963),
      material: materiaalIndex.get(kleur),
    });
  }

  /* Bindpose: elke wervel schuift zijn eigen x-positie weg. Kolom-major. */
  const bind = new Float32Array(WERVELS.length * 16);
  WERVELS.forEach((bx, b) => {
    bind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -bx, 0, 0, 1], b * 16);
  });

  /* Zwemslag: een kwartslag korter voor het kalf, dat sneller peddelt. */
  const duur = schaal < 0.9 ? 1.75 : 2.4;
  const tijd = new Float32Array(reeks(0, duur, SLEUTELS));
  const draaiingen = WERVELS.map((_, b) => {
    const q = new Float32Array(SLEUTELS * 4);
    for (let k = 0; k < SLEUTELS; k++) {
      const a = AMPLITUDE[b] * Math.sin((2 * Math.PI * tijd[k]) / duur - NASLAG[b]);
      q[k * 4 + 2] = Math.sin(a / 2); // om de z-as: op en neer
      q[k * 4 + 3] = Math.cos(a / 2);
    }
    return q;
  });

  const iBind = zet(bind, 5126, 'MAT4');
  const iTijd = zet(tijd, 5126, 'SCALAR', undefined, { min: [0], max: [duur] });
  const iDraai = draaiingen.map((q) => zet(q, 5126, 'VEC4'));

  /* Node 0 draagt schaal én plaatsing; daaronder de mesh en de ruggengraat. */
  const nodes = [
    {
      name: 'OrcaRoot',
      children: [1, 2],
      scale: [schaal, schaal, schaal],
      translation: [
        (-schaal * (maat.min[0] + maat.max[0])) / 2,
        -schaal * maat.min[1],
        (-schaal * (maat.min[2] + maat.max[2])) / 2,
      ].map((v) => Math.round(v * 1e6) / 1e6),
    },
    { name: 'Orca', mesh: 0, skin: 0 },
  ];
  WERVELS.forEach((bx, b) => {
    nodes.push({
      name: `Spine${String(b).padStart(2, '0')}`,
      translation: [bx - (b ? WERVELS[b - 1] : 0), 0, 0],
      ...(b < WERVELS.length - 1 ? { children: [3 + b] } : {}),
    });
  });

  const json = {
    asset: { version: '2.0', generator: 'tools/bouw-orka.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ name: 'Orca', primitives }],
    materials: materialen,
    skins: [
      {
        name: 'OrcaRig',
        joints: WERVELS.map((_, b) => 2 + b),
        skeleton: 2,
        inverseBindMatrices: iBind,
      },
    ],
    animations: [
      {
        name: 'Swim',
        samplers: iDraai.map((out) => ({ input: iTijd, output: out, interpolation: 'LINEAR' })),
        channels: iDraai.map((_, b) => ({ sampler: b, target: { node: 2 + b, path: 'rotation' } })),
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: lengte }],
  };

  return { json, bin: Buffer.concat(stukken) };
}

/* -- bouwen ---------------------------------------------------------------- */

/**
 * Het kalf is ± 2,6 m tegenover 7 m voor de orka. Eén factor over het hele
 * dier; de verhoudingen binnen het kalf zitten al in spanten() en RUGVIN.
 */
const KALFSCHAAL = 0.371;

for (const [bestand, kalf, schaal] of [
  ['orca', false, 1.0],
  ['orca-calf', true, KALFSCHAAL],
]) {
  const onderdelen = dier(kalf);

  /* Bounding box in rustpose. Die is gelijk aan de bindpose: alle wervels
   * staan in rust op hun eigen x, dus gewricht × inverse bindmatrix is de
   * eenheidsmatrix en de skinning verplaatst niets. */
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const { maas } of onderdelen) {
    for (const p of maas.V) {
      for (const as of [0, 1, 2]) {
        laag[as] = Math.min(laag[as], p[as]);
        hoog[as] = Math.max(hoog[as], p[as]);
      }
    }
  }

  const glb = bouwGltf(onderdelen, kalf, schaal, { min: laag, max: hoog });
  schrijfGlb(join(DOEL, `${bestand}.glb`), glb.json, glb.bin, writeFileSync);

  const driehoeken = onderdelen.reduce((s, o) => s + o.maas.F.length, 0);
  const maat = [0, 2, 1].map((as) => ((hoog[as] - laag[as]) * schaal).toFixed(3));
  console.log(
    `kits/onderwater-kit/${bestand}.glb — ${driehoeken} driehoeken, ` +
      `${onderdelen.length} tekenopdrachten, ${maat.join(' × ')} units`,
  );
  for (const [id, mat] of Object.entries(MATERIALEN)) {
    console.log(`  ${hex(mat[kalf ? 'kalf' : 'volwassen'])}  ${mat.naam.padEnd(11)} (${id})`);
  }
}
