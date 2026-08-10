/**
 * Meet op hoe de stukken van kits/modulair-terrein op elkaar aansluiten en
 * schrijft dat weg als kits/modulair-terrein/aansluitingen.json.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/aansluitingen.mjs            # meet op en schrijf het bestand
 *     node tools/aansluitingen.mjs --toon     # daarbij een verslag op de console
 *
 * tools/terreinbouwer/ leest het resultaat en gebruikt het om tijdens het
 * bouwen te controleren of twee stukken echt op elkaar passen. Het bestand is
 * de enige bron van waarheid over aansluitingen: de bouwer bevat geen eigen
 * aannames over welke naam bij welke vorm hoort.
 *
 * ── Waarom meten en niet uit de naam afleiden ──────────────────────────────
 *
 * De namen van deze pack zijn beschrijvend maar niet sluitend.
 * `cliff-terrain-side-mid` en `escarpment-terrain-side-mid` heten allebei een
 * "side-mid", zijn allebei een halve laag hoog en zien er in de catalogus
 * hetzelfde uit. Hun vorm is dat niet: de steilrand ís een plat vlak op
 * x = -0,25, de klif is een geknikt vlak dat in het midden tot x = -0,125 naar
 * voren komt. Wie ze door elkaar gebruikt krijgt een golvende rotswand in
 * plaats van een rechte.
 *
 * Wat dat verschil zichtbaar maakt is de voorzijde: r068 (twee losse ribben in
 * de hoeken) tegenover r114 (een dichte rechthoek). De zijkanten waarmee ze aan
 * hun buren in dezelfde wand vastzitten zijn wél gelijk — allebei één
 * rechtopstaande ribbe op x = -0,25 — en dat is geen meetfout maar een echte
 * eigenschap van de pack.
 *
 * Daar loopt meteen de grens van wat een naadcontrole kan: hij toetst de vóég,
 * niet het oppervlak tussen twee voegen. Een wand van afwisselend klif en
 * steilrand sluit op elke naad netjes aan en golft er tussenin overheen. De
 * bouwer meldt dat dus niet, en dat hoort hij ook niet te doen: het is geen gat
 * maar een vormkeuze.
 *
 * ── Wat een stuk eigenlijk is ──────────────────────────────────────────────
 *
 * Geen massief blok maar een open vlies. `cliff-terrain-side-mid` is vier
 * driehoeken: twee panelen die een V vormen, zonder boven-, onder- of
 * zijkanten. `hilly-terrain-grass-floor` is één plat vierkant op y = 0,1.
 * `escarpment-terrain-side-mid` is één vierkant, rechtop.
 *
 * Dat bepaalt hoe je moet meten. Een straal recht omlaag — de voor de hand
 * liggende manier om een hoogteprofiel te krijgen — ziet een rechtopstaande
 * wand nooit: hij loopt er evenwijdig aan. Het hele plan van een muur zou dan
 * als "open lucht" uit de meting komen.
 *
 * Wat wél werkt is snijden. Een stuk sluit aan op zijn buurman langs een vlak
 * — de gedeelde vakrand — en wat er in dat vlak zit is precies de doorsnede van
 * het vlies met dat vlak. Dat is een verzameling lijnstukken, en twee stukken
 * passen op elkaar wanneer die verzamelingen samenvallen.
 *
 * ── Wat er gemeten wordt ───────────────────────────────────────────────────
 *
 * Zes vlakken per rastervak: de vier zijkanten (§ ZIJDEN), de onderkant en de
 * bovenkant (§ STAPELEN). Alle zes met dezelfde snijmachine (§ DOORSNEDE).
 * Gelijke doorsnedes krijgen één nummer in een catalogus; per stuk staat er
 * alleen nog een nummer per vak per zijde in het bestand.
 */

import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, leesAccessor, nodeMatrix, maalMatrix, EENHEIDSMATRIX } from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'modulair-terrein');
const UIT = join(KIT, 'aansluitingen.json');

/* -- RASTER ----------------------------------------------------------------
 * De pack is met factor 0,5 ingeladen en houdt zijn eigen oorsprong
 * (tools/importeer-modulair-terrein.mjs, § SCHAAL en § OORSPRONG). Het
 * rastervak van een 1×1-stuk ligt daardoor op x,z ∈ [-0,25 … 0,25]: een halve
 * unit, met de oorsprong in het midden. Vak (u,v) loopt van 0,5u - 0,25 tot
 * 0,5u + 0,25.
 *
 * Verticaal is de stap even groot, en dat is te controleren aan de stukken
 * zelf: `cliff-terrain-side-base`, `-mid` en `-top` staan alle drie op
 * y ∈ [0 … 0,5] en horen dus op y = 0, 0,5 en 1,0 te komen. De grasrand van een
 * `-top` steekt daar 0,1 bovenuit — precies de hoogte waarop
 * `hilly-terrain-grass-floor` als plat vlak ligt. Een kliftop op laag L eindigt
 * daarmee op dezelfde hoogte als een grasvloer op laag L+1, en dat is geen
 * toeval maar de manier waarop de pack in elkaar zit.
 */
export const VAK = 0.5;
export const LAAG = 0.5;

/**
 * Speling bij het bepalen welke vakken een stuk beslaat.
 *
 * De meeste stukken vallen exact op de vakranden, maar niet alle: de losse
 * rotsen zijn met de hand gemodelleerd en steken een paar honderdsten buiten
 * hun vak (`cliff-prop-rock-b` loopt van -0,27 tot 0,27 in plaats van -0,25 tot
 * 0,25). Zonder speling claimt zo'n rots drie vakken in plaats van één. 0,05
 * vangt die afrondingen op en ligt nog ruim onder een half vak.
 */
const VAK_SPELING = 0.05;

/**
 * Waarop coördinaten worden afgerond voordat ze vergeleken worden.
 *
 * De bron staat op 0,01, na het schalen op 0,005; daar rond ik precies op af.
 * Fijner zou de float-ruis van de matrixvermenigvuldiging meenemen en twee
 * randen die identiek gemodelleerd zijn verschillende nummers geven. Alle
 * vergelijkingen in dit bestand gebeuren op hele veelvouden van KWANT, dus op
 * gehele getallen — nooit op floats.
 */
const KWANT = 0.005;

/** Hoe ver van een vlak een hoekpunt nog "in" dat vlak ligt. */
const VLAK_TOL = KWANT / 2;

/* -- driehoeken ------------------------------------------------------------ */

/**
 * Alle driehoeken van de scène in wereldcoördinaten.
 *
 * Loopt de nodes af zoals meetScene() in glb.mjs dat doet, maar houdt de punten
 * vast in plaats van alleen hun uitersten. Deze kit is niet geskind — één
 * materiaal, één primitive, geen armaturen — dus de wereldmatrix van de node
 * volstaat.
 *
 * @returns {Float64Array} negen getallen per driehoek: x,y,z × drie hoekpunten
 */
function leesDriehoeken(glb) {
  const { json } = glb;
  const nodes = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];

  const wereld = new Array(nodes.length).fill(null);
  const zetWereld = (index, ouder) => {
    if (wereld[index]) return;
    const node = nodes[index];
    if (!node) return;
    wereld[index] = maalMatrix(ouder, nodeMatrix(node));
    for (const kind of node.children ?? []) zetWereld(kind, wereld[index]);
  };
  for (const index of scene?.nodes ?? []) zetWereld(index, EENHEIDSMATRIX);

  const uit = [];
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !wereld[index]) return;
    const m = wereld[index];

    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;

      const pos = leesAccessor(glb, prim.attributes.POSITION);
      const idx = prim.indices !== undefined ? leesAccessor(glb, prim.indices) : null;
      const aantal = idx ? idx.count : pos.count;

      for (let i = 0; i + 2 < aantal; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx.data[i + k] : i + k;
          const x = pos.data[v * 3], y = pos.data[v * 3 + 1], z = pos.data[v * 3 + 2];
          uit.push(
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
          );
        }
      }
    }
  });

  return Float64Array.from(uit);
}

/* -- DOORSNEDE -------------------------------------------------------------
 * De doorsnede van het vlies met één vlak, als verzameling lijnstukken in dat
 * vlak. Drie gevallen, en het derde is het geval waar het misgaat als je er
 * niet aan denkt:
 *
 *   1. Het vlak snijdt een driehoek dwars: één lijnstuk, van rand naar rand.
 *      Het gewone geval.
 *
 *   2. Het vlak raakt een driehoek in één hoekpunt of langs één ribbe. Een los
 *      punt zegt niets en gaat eruit; een ribbe is een echt lijnstuk en blijft.
 *      Zo levert de V van `cliff-terrain-side-mid` aan zijn noordzijde precies
 *      de ene rechtopstaande ribbe op waarmee hij zijn buurman raakt.
 *
 *   3. De driehoek ligt hélemaal in het vlak. Dan is de doorsnede geen lijn
 *      maar een vlak — een muur die precies óp de vakrand staat, zoals
 *      `escarpment-terrain-side-mid`. Daarvan wil je de omtrek, niet alle
 *      ribben: de diagonaal waarmee de muur in twee driehoeken is verdeeld is
 *      een verzinsel van de modelleur en mag de vergelijking niet beïnvloeden.
 *      Ribben die twee keer voorkomen liggen binnenin en vallen weg; wat
 *      overblijft is de omtrek. Twee muren die verschillend getrianguleerd zijn
 *      leveren daarmee dezelfde doorsnede op, en dat is precies de bedoeling.
 */

/**
 * Snijdt de driehoeken met het vlak `as = waarde` en levert de lijnstukken in
 * de twee overgebleven assen.
 *
 * @param {Float64Array} driehoeken
 * @param {number} as       0 = x, 1 = y, 2 = z
 * @param {number} waarde   waar het vlak ligt
 * @param {number[]} asA    [as, tekenrichting] voor de eerste plancoördinaat
 * @param {number[]} asB    idem voor de tweede
 * @param {number[]} nulA   waarvandaan asA geteld wordt
 * @param {number[]} nulB   idem
 * @returns {number[][]} lijnstukken als [a1, b1, a2, b2], in KWANT-eenheden
 */
function doorsnede(driehoeken, as, waarde, asA, asB, nulA, nulB) {
  const n = driehoeken.length / 9;
  const stukken = [];
  const vlakke = new Map(); // ribbe → hoe vaak, voor geval 3

  const kwant = (v) => Math.round(v / KWANT);
  const naarVlak = (p) => [
    kwant((p[asA[0]] - nulA) * asA[1]),
    kwant((p[asB[0]] - nulB) * asB[1]),
  ];
  const ribbeSleutel = (p, q) => (p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1])
    ? `${p[0]},${p[1]}|${q[0]},${q[1]}`
    : `${q[0]},${q[1]}|${p[0]},${p[1]}`);

  for (let t = 0; t < n; t++) {
    const hoek = [0, 1, 2].map((k) => [
      driehoeken[t * 9 + k * 3], driehoeken[t * 9 + k * 3 + 1], driehoeken[t * 9 + k * 3 + 2],
    ]);
    const d = hoek.map((p) => p[as] - waarde);

    /* geval 3: de hele driehoek ligt in het vlak */
    if (d.every((v) => Math.abs(v) <= VLAK_TOL)) {
      for (let k = 0; k < 3; k++) {
        const sleutel = ribbeSleutel(naarVlak(hoek[k]), naarVlak(hoek[(k + 1) % 3]));
        vlakke.set(sleutel, (vlakke.get(sleutel) ?? 0) + 1);
      }
      continue;
    }

    /* geval 1 en 2: verzamel waar de rand van de driehoek het vlak raakt.
     * Een hoekpunt óp het vlak telt één keer, niet twee keer via zijn beide
     * ribben — vandaar de controle op de ribbe zelf. */
    const punten = [];
    for (let k = 0; k < 3; k++) {
      const p = hoek[k], q = hoek[(k + 1) % 3];
      const dp = d[k], dq = d[(k + 1) % 3];

      if (Math.abs(dp) <= VLAK_TOL) punten.push(naarVlak(p));
      if (Math.abs(dp) > VLAK_TOL && Math.abs(dq) > VLAK_TOL && (dp < 0) !== (dq < 0)) {
        const s = dp / (dp - dq);
        punten.push(naarVlak([0, 1, 2].map((a) => p[a] + s * (q[a] - p[a]))));
      }
    }

    // Dubbele punten eruit; wat overblijft is een punt (raakt, telt niet) of
    // een lijnstuk.
    const uniek = [];
    for (const p of punten) {
      if (!uniek.some((q) => q[0] === p[0] && q[1] === p[1])) uniek.push(p);
    }
    if (uniek.length === 2) stukken.push([...uniek[0], ...uniek[1]]);
  }

  for (const [sleutel, aantal] of vlakke) {
    if (aantal % 2 === 0) continue; // ribbe binnenin de muur
    const [p, q] = sleutel.split('|').map((s) => s.split(',').map(Number));
    stukken.push([...p, ...q]);
  }

  return stukken;
}

/* -- opschonen -------------------------------------------------------------
 * Twee stukken die geometrisch hetzelfde zijn moeten ook letterlijk hetzelfde
 * zijn, anders krijgen ze twee nummers en past er niets meer op elkaar. Drie
 * dingen kunnen dat verpesten, en alle drie worden ze hier rechtgetrokken:
 * lijnstukken die buiten het vak steken, lijnstukken die in stukjes geknipt
 * zijn omdat er toevallig een hoekpunt in het midden lag, en lijnstukken die in
 * een andere volgorde of richting zijn opgeschreven.
 */

const ggd = (a, b) => (b === 0 ? Math.abs(a) : ggd(b, a % b));

/**
 * Knipt de lijnstukken bij op het venster [a0…a1] × [b0…b1] en voegt ze samen.
 *
 * Alles in hele KWANT-eenheden, dus zonder afrondingsruis. Het venster is het
 * rastervak: een lijnstuk dat over twee vakken doorloopt hoort bij allebei, elk
 * voor zijn eigen deel.
 *
 * @returns {number[][]} genormaliseerd en gesorteerd, klaar om te vergelijken
 */
function schoon(stukken, a0, a1, b0, b1) {
  const banen = new Map();

  for (const [pa, pb, qa, qb] of stukken) {
    let da = qa - pa;
    let db = qb - pb;
    if (da === 0 && db === 0) continue;

    /* bijknippen op het venster, met de parametervorm van het lijnstuk */
    let s0 = 0, s1 = 1;
    for (const [p, dd, laag, hoog] of [[pa, da, a0, a1], [pb, db, b0, b1]]) {
      if (dd === 0) {
        if (p < laag || p > hoog) { s0 = 1; s1 = 0; break; }
        continue;
      }
      const t0 = (laag - p) / dd;
      const t1 = (hoog - p) / dd;
      s0 = Math.max(s0, Math.min(t0, t1));
      s1 = Math.min(s1, Math.max(t0, t1));
    }
    if (s1 <= s0) continue;

    const ka = Math.round(pa + s0 * da), kb = Math.round(pb + s0 * db);
    const la = Math.round(pa + s1 * da), lb = Math.round(pb + s1 * db);
    da = la - ka; db = lb - kb;
    if (da === 0 && db === 0) continue;

    /* De baan waarop het lijnstuk ligt: richting teruggebracht tot de kleinste
     * gehele stap, met een vast teken, plus het kruisproduct met een punt erop
     * — dat laatste is constant over de hele lijn en onderscheidt evenwijdige
     * banen van elkaar. Twee lijnstukken op dezelfde baan kunnen worden
     * samengevoegd, en alleen die. */
    const deler = ggd(Math.abs(da), Math.abs(db)) || 1;
    let ra = da / deler, rb = db / deler;
    if (ra < 0 || (ra === 0 && rb < 0)) { ra = -ra; rb = -rb; }
    const sleutel = `${ra},${rb},${ra * kb - rb * ka}`;

    /* Positie langs de baan, gerekend vanaf een vast punt óp die baan. Dat
     * ankerpunt moet erbij: een lijnstuk is pas bepaald door richting én
     * ligging, en wie alleen de richting bewaart legt elke baan door de
     * oorsprong. Alle horizontale randen zouden dan op hoogte nul uitkomen en
     * de grasvloer op 0,1 zou niet meer van de zandvloer op 0 te
     * onderscheiden zijn.
     *
     * Beide uiteinden liggen op de baan en de richting is tot de kleinste
     * gehele stap teruggebracht, dus de deling gaat exact op. Welk lijnstuk
     * het anker levert doet er niet toe: er wordt in absolute coördinaten
     * teruggeschreven. */
    if (!banen.has(sleutel)) banen.set(sleutel, { ra, rb, anker: [ka, kb], delen: [] });
    const baan = banen.get(sleutel);
    const langs = (a, b) => (ra !== 0 ? (a - baan.anker[0]) / ra : (b - baan.anker[1]) / rb);
    const s = langs(ka, kb);
    const e = langs(la, lb);
    baan.delen.push([Math.min(s, e), Math.max(s, e)]);
  }

  const uit = [];
  for (const { ra, rb, anker, delen } of banen.values()) {
    const punt = (s) => [anker[0] + s * ra, anker[1] + s * rb];
    delen.sort((p, q) => p[0] - q[0]);
    let [van, tot] = delen[0];
    for (const [s, e] of delen.slice(1)) {
      if (s <= tot) { tot = Math.max(tot, e); continue; } // raken of overlappen
      uit.push([...punt(van), ...punt(tot)]);
      [van, tot] = [s, e];
    }
    uit.push([...punt(van), ...punt(tot)]);
  }

  // Vaste volgorde, zodat de tekstsleutel van twee gelijke doorsnedes gelijk is.
  uit.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  return uit;
}

/* -- ZIJDEN ----------------------------------------------------------------
 * De vier zijkanten van een vak, met hun buitennormaal en de richting waarin
 * hun doorsnede wordt gelezen.
 *
 * De leesrichting is `omhoog × normaal`: van links naar rechts gezien vanáf
 * buiten het stuk. Dat is met opzet, want het maakt draaien gratis. Draai een
 * stuk een kwartslag en de oostzijde wordt de noordzijde — inclusief zijn
 * leesrichting, want die draait mee. De doorsnede zelf verandert niet, alleen
 * het label. De bouwer hoeft voor een gedraaid stuk dus niets opnieuw te meten.
 *
 * De prijs staat in `spiegel`: twee buren staan met de rug naar elkaar, dus wie
 * de één van links naar rechts leest, leest de ander van rechts naar links.
 * Aansluiten is daarom "gelijk aan het spiegelbeeld van de buur", niet "gelijk
 * aan de buur".
 */
const ZIJDEN = [
  { naam: 'n', as: 2, kant: -1, langs: 0, richting: -1 },
  { naam: 'o', as: 0, kant: +1, langs: 2, richting: -1 },
  { naam: 'z', as: 2, kant: +1, langs: 0, richting: +1 },
  { naam: 'w', as: 0, kant: -1, langs: 2, richting: +1 },
];

/* -- STAPELEN --------------------------------------------------------------
 * Boven- en onderkant gaan door dezelfde molen, maar dan met een horizontaal
 * vlak: y = 0 voor de onderkant van een laag, y = LAAG voor de bovenkant. Wat
 * op laag L bovenaan zit en wat op laag L+1 onderaan zit, ligt in hetzelfde
 * vlak in de wereld en hoort dus gelijk te zijn.
 *
 * Hier geen spiegeling: een horizontaal vlak zie je van boven én van onder in
 * dezelfde x/z-richtingen. Boven past op onder als ze letterlijk gelijk zijn.
 */
const HORIZONTAAL = { asA: [0, +1], asB: [2, +1] };

/* -- catalogus ------------------------------------------------------------- */

/**
 * Houdt gelijke doorsnedes bij onder één nummer.
 *
 * De sleutel is de opgeschoonde doorsnede als tekst. Twee zijden met dezelfde
 * sleutel zijn niet "ongeveer gelijk" maar identiek tot op KWANT — daar is het
 * afronden op hele KWANT-eenheden voor.
 */
function catalogus(voorvoegsel) {
  const opNummer = [];
  const opSleutel = new Map();

  return {
    neem(vorm) {
      const sleutel = JSON.stringify(vorm);
      if (opSleutel.has(sleutel)) return opSleutel.get(sleutel);
      const id = `${voorvoegsel}${String(opNummer.length + 1).padStart(3, '0')}`;
      opSleutel.set(sleutel, id);
      opNummer.push({ id, vorm });
      return id;
    },
    zoek(vorm) {
      return opSleutel.get(JSON.stringify(vorm)) ?? null;
    },
    alles: opNummer,
  };
}

/* -- indeling uit de naam --------------------------------------------------
 * De naam bepaalt niets aan de meting. Hij is er om in de bouwer te kunnen
 * filteren en om een stapelfout te kunnen benoemen ("een -mid zonder -base
 * eronder"). Dat is de enige plek waar de naam meetelt, en dan nog alleen om
 * een waarschuwing leesbaar te maken.
 */
function indeling(naam) {
  const delen = naam.split('-');
  const familie = delen[0];
  const soort = delen[1] === 'terrain' ? 'terrein'
    : delen[1] === 'prop' ? 'prop'
      : familie === 'mountain' ? 'landmark' : 'terrein';
  const laatste = delen[delen.length - 1];
  const trap = ['base', 'mid', 'top'].includes(laatste) ? laatste : null;
  return { familie, soort, trap };
}

/* -- draaien --------------------------------------------------------------- */

const toon = process.argv.includes('--toon');

const bestanden = readdirSync(KIT).filter((n) => n.endsWith('.glb')).sort();
if (bestanden.length === 0) throw new Error(`geen .glb-bestanden in ${KIT}`);

const randen = catalogus('r');
const vlakken = catalogus('v');
const modellen = [];

/** Vakbereik langs één as, uit de begrenzingsdoos. */
function vakBereik(min, max, as) {
  const laag = Math.floor((min[as] + VAK / 2) / VAK + VAK_SPELING);
  const hoog = Math.ceil((max[as] + VAK / 2) / VAK - VAK_SPELING) - 1;
  return [laag, Math.max(laag, hoog)];
}

/** Een half vak, in KWANT-eenheden: het venster waarop wordt bijgeknipt. */
const half = Math.round(VAK / 2 / KWANT);

for (const bestand of bestanden) {
  const naam = bestand.replace(/\.glb$/, '');
  const driehoeken = leesDriehoeken(leesGlb(join(KIT, bestand)));
  if (driehoeken.length === 0) throw new Error(`${naam}: geen driehoeken`);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < driehoeken.length; i += 3) {
    for (let as = 0; as < 3; as++) {
      if (driehoeken[i + as] < min[as]) min[as] = driehoeken[i + as];
      if (driehoeken[i + as] > max[as]) max[as] = driehoeken[i + as];
    }
  }

  const [u0, u1] = vakBereik(min, max, 0);
  const [v0, v1] = vakBereik(min, max, 2);

  const zijden = { n: {}, o: {}, z: {}, w: {} };
  const boven = {};
  const onder = {};
  const gevuld = [];

  for (let u = u0; u <= u1; u++) {
    for (let v = v0; v <= v1; v++) {
      const sleutel = `${u},${v}`;

      /* boven en onder: het horizontale vlak, bijgeknipt op dit vak, geteld
       * vanaf het midden van het vak zodat het nummer los staat van waar het
       * vak in het raster ligt. */
      for (const [waar, doel] of [[0, onder], [LAAG, boven]]) {
        const ruw = doorsnede(driehoeken, 1, waar, HORIZONTAAL.asA, HORIZONTAAL.asB, u * VAK, v * VAK);
        doel[sleutel] = vlakken.neem(schoon(ruw, -half, half, -half, half));
      }

      for (const zijde of ZIJDEN) {
        const buiten = zijde.as === 0
          ? (zijde.kant < 0 ? u === u0 : u === u1)
          : (zijde.kant < 0 ? v === v0 : v === v1);
        if (!buiten) continue;

        // Het vlak van deze zijde, en de twee assen waarin we hem opschrijven:
        // eerst langs de rand (leesrichting), dan omhoog.
        const waarde = (zijde.as === 0 ? u : v) * VAK + zijde.kant * VAK / 2;
        const nul = (zijde.langs === 0 ? u : v) * VAK;
        const ruw = doorsnede(
          driehoeken, zijde.as, waarde,
          [zijde.langs, zijde.richting], [1, +1], nul, 0,
        );
        zijden[zijde.naam][sleutel] = randen.neem(schoon(ruw, -half, half, -Infinity, Infinity));
      }

      /* Of er in dit vak überhaupt materiaal zit. Een 2×2-buitenhoek claimt vier
       * vakken maar vult er maar drie; dat is geen fout, maar de bouwer wil het
       * kunnen laten zien. */
      const raakt = (() => {
        const xl = (u - 0.5) * VAK - 1e-6, xh = (u + 0.5) * VAK + 1e-6;
        const zl = (v - 0.5) * VAK - 1e-6, zh = (v + 0.5) * VAK + 1e-6;
        for (let t = 0; t < driehoeken.length / 9; t++) {
          let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
          for (let k = 0; k < 3; k++) {
            const x = driehoeken[t * 9 + k * 3], z = driehoeken[t * 9 + k * 3 + 2];
            a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); e = Math.max(e, z);
          }
          if (b >= xl && a <= xh && e >= zl && c <= zh) return true;
        }
        return false;
      })();
      if (raakt) gevuld.push([u, v]);
    }
  }

  modellen.push({
    naam,
    ...indeling(naam),
    vakken: [u1 - u0 + 1, v1 - v0 + 1],
    oorsprong: [u0, v0],
    gevuld,
    lagen: [Math.floor(min[1] / LAAG + 1e-6), Math.max(0, Math.ceil(max[1] / LAAG - 1e-6) - 1)],
    doos: {
      min: min.map((v) => Number(v.toFixed(4))),
      max: max.map((v) => Number(v.toFixed(4))),
    },
    driehoeken: driehoeken.length / 9,
    zijden,
    boven,
    onder,
  });
}

/* Bij elke doorsnede de doorsnede die erop past: hetzelfde, gespiegeld in de
 * leesrichting. Bestaat die nergens in de kit, dan is de zijde doodlopend —
 * geen enkel stuk kan er tegenaan. Dat is op zichzelf geen fout (de buitenrand
 * van een eiland hoort nergens tegenaan), maar het is wél het eerste dat je
 * wilt weten als een aansluiting niet lukt. */
for (const rand of randen.alles) {
  rand.spiegel = randen.zoek(
    schoon(rand.vorm.map(([a, b, c, d]) => [-a, b, -c, d]), -Infinity, Infinity, -Infinity, Infinity),
  );
}

/** KWANT-eenheden terug naar units, voor wie het bestand met de hand naleest. */
const naarUnits = (vorm) => vorm.map((s) => s.map((v) => Number((v * KWANT).toFixed(3))));

const uit = {
  gegenereerd: 'node tools/aansluitingen.mjs',
  kit: 'modulair-terrein',
  raster: { vak: VAK, laag: LAAG },
  meting: { kwant: KWANT, vlakTol: VLAK_TOL },
  /* Elke rand is een lijst lijnstukken [langs1, hoog1, langs2, hoog2] in units,
   * gelezen van links naar rechts gezien vanaf buiten het stuk; `langs` loopt
   * van -0,25 tot 0,25, `hoog` is de hoogte binnen de laag. `spiegel` is de
   * rand die hier tegenaan past. */
  randen: Object.fromEntries(randen.alles.map((r) => [r.id, { spiegel: r.spiegel, vorm: naarUnits(r.vorm) }])),
  /* Idem voor de horizontale vlakken, maar dan [x1, z1, x2, z2] ten opzichte
   * van het midden van het vak. Een bovenvlak past op een ondervlak wanneer ze
   * hetzelfde nummer hebben. */
  vlakken: Object.fromEntries(vlakken.alles.map((v) => [v.id, naarUnits(v.vorm)])),
  modellen,
};

writeFileSync(UIT, `${JSON.stringify(uit, null, 1)}\n`);

/* -- verslag --------------------------------------------------------------- */

const perRand = new Map();
for (const model of modellen) {
  for (const zijde of Object.values(model.zijden)) {
    for (const id of Object.values(zijde)) {
      if (!perRand.has(id)) perRand.set(id, new Set());
      perRand.get(id).add(model.naam);
    }
  }
}

const leeg = randen.alles.filter((r) => r.vorm.length === 0).map((r) => r.id);
const dood = randen.alles.filter((r) => !r.spiegel && perRand.has(r.id));

console.log(`${modellen.length} modellen uit kits/modulair-terrein/`);
console.log(`${randen.alles.length} verschillende zijprofielen, ${vlakken.alles.length} verschillende horizontale vlakken`);
console.log(`${dood.length} zijprofielen hebben geen tegenhanger in de kit`);
console.log(`→ ${UIT.replace(`${ROOT}/`, '')}`);

if (!toon) process.exit(0);

console.log('\nzijprofielen, meest gebruikt eerst:');
for (const rand of [...randen.alles].sort((a, b) => (perRand.get(b.id)?.size ?? 0) - (perRand.get(a.id)?.size ?? 0))) {
  const gebruikers = perRand.get(rand.id);
  if (!gebruikers) continue;
  const past = rand.spiegel === rand.id ? 'op zichzelf' : rand.spiegel ? `op ${rand.spiegel}` : 'nergens op';
  const wat = leeg.includes(rand.id) ? 'open lucht' : `${rand.vorm.length} lijnstuk(ken)`;
  console.log(`  ${rand.id}  ${String(gebruikers.size).padStart(3)} stukken  ${wat.padEnd(16)} past ${past}`);
}

console.log('\ndoodlopende zijden (geen enkel stuk past hiertegenaan):');
for (const rand of dood) {
  console.log(`  ${rand.id}  ${[...perRand.get(rand.id)].join(', ')}`);
}
