/**
 * Bouwt scenes/eiland.glb: een proefscène uit kits/modulair-terrein, alleen
 * terreinstukken, geen props.
 *
 * Draai vanuit de repo-root:  node tools/bouw-scene-eiland.mjs
 *
 * -- waarom -----------------------------------------------------------------
 * De catalogus laat losse modellen zien. Deze scène beantwoordt de vraag
 * daarnaast: passen de terreinstukken van het modulaire pakket ook echt op
 * elkaar, en hoe ziet een zone eruit die er helemaal uit opgebouwd is?
 *
 * Het pakket bestaat uit families die elk hun eigen materiaal en hun eigen
 * hoogtemaat hebben. Vijf ervan staan hier naast elkaar, want juist op de
 * naden tussen die families valt te leren wat het pakket wel en niet kan:
 *
 *   hilly       gras, pad met bochten, water
 *   beach       zand, met een flauw talud naar het water
 *   cliff       rechte rotswanden en trappen dwars door die wanden heen
 *   cave        grotmond in de bovenste wand, met een nis erachter
 *   escarpment  steilrand; hier de buitenrand van het eiland
 *
 * Props horen er bewust niet bij: dit gaat over het terrein zelf.
 *
 * -- het raster -------------------------------------------------------------
 * Cel van 0,5 × 0,5 unit, hoogtestap van 0,5 unit; zie tools/terreinscene.mjs.
 * Het gras van niveau n ligt op 0,1 + 0,5·n en het pad op 0,5·n: het pad is een
 * ondiepe geul in het gras, en die 0,1 verschil zit in de kantstukken verwerkt.
 * Het gras- en het padstuk hebben dat verschil zelf al in zich, dus ze worden
 * op dezelfde hoogte 0,5·n neergezet — er 0,1 vanaf halen maakt de geul 0,2
 * diep en dan valt er naast het pad een spleet open.
 *
 * -- de plattegrond ---------------------------------------------------------
 * Veld van 30 × 45 cellen (15 × 22,5 unit). Vanaf het water klimt het in vier
 * stappen naar de grotmond, en het pad slingert er van onder naar boven
 * doorheen:
 *
 *     rij  0- 3   baai
 *     rij  4- 6   zandtalud, waar het water op het strand loopt
 *     rij  7- 8   droog strand
 *     rij  9-13   niveau 0, gras; het pad begint hier
 *     rij 14-15   trap naar niveau 1
 *     rij 16-42   niveau 1; het pad maakt hier twee bochten naar het westen
 *     rij 22-23   trap naar niveau 2
 *     rij 24-40   niveau 2; het pad maakt hier twee bochten terug naar het oosten
 *     rij 30-31   trap naar niveau 3
 *     rij 32-38   niveau 3
 *     rij 35      wand van twee stappen, met de grotmond waar het pad eindigt
 *     rij 36-37   het hoogste terras, 2,6 boven de waterlijn
 *
 * De terrassen liggen in elkaar, elk een stap hoger en aan alle kanten kleiner,
 * zodat elke terrasrand een volledige wandring krijgt en nergens de veldrand
 * raakt.
 *
 * -- hoogtes van de families ------------------------------------------------
 * De families delen het raster maar niet hun nulpunt, dus ze moeten met de hand
 * op elkaar gezet worden:
 *
 *   gras          eigen vloerstuk ligt op 0,1
 *   pad           eigen vloerstuk ligt op 0,0
 *   zand          vloer op 0,0 en "raised" op 0,25, en de stap ertussen is 0,25
 *                 in plaats van 0,5; met hoogte −0,15 komt het droge zand dus
 *                 gelijk met het gras en het natte zand 0,25 lager
 *   water         eigen vlak ligt op 0,35; met hoogte −0,4 staat het
 *                 wateroppervlak op −0,05, dus 0,1 onder het land en 0,1 boven
 *                 het natte zand
 *   klimtrap      loopt van −0,05 naar 0,5 over twee cellen, net als de
 *                 grastaluds; hij gaat op padhoogte van het niveau eronder
 *   wandstukken   een wandstuk is 0,6 hoog terwijl de stap 0,5 is: de voet zakt
 *                 0,1 onder het maaiveld eronder. Regel: hoogte van een
 *                 afsluitend wandstuk = kaphoogte − 0,6
 *
 * -- welke kant een wandstuk op kijkt ---------------------------------------
 * Elk wandstuk — steilrand, klif — heeft zijn gebeeldhouwde kant aan de
 * +x-kant en zijn platte achterwand aan de -x-kant. Het stuk ligt bovendien
 * niet midden in zijn cel maar tegen de -x-rand aan, en zijn kap raakt daar de
 * grond die eróp ligt.
 *
 * Daaruit volgt de regel: een wand die naar buiten kijkt in richting r wordt zo
 * gedraaid dat +x naar r wijst, en komt in de cel áchter de terreinrand te
 * staan — niet in de laatste terreincel zelf. Andersom hangt de grasrand als
 * een uitstekend velletje over de wand heen.
 *
 * De grotmond is de uitzondering: daar zit de wand aan de -x-kant en steekt de
 * tunnel naar +x, dus die gaat andersom en schuift een kwart cel naar achteren
 * om met de rest van de wand in één vlak te komen.
 *
 * -- hoe een bocht in het pad in elkaar zit ---------------------------------
 * Een pad van twee cellen breed draait binnen een blok van 2 × 2 cellen. Welke
 * twee randen van dat blok het pad verbindt, bepaalt alles; de rijrichting doet
 * er niet toe. Uit de meetkunde van de twee hoekstukken volgt de verdeling:
 *
 *   buitenhoek  het pad ligt als kwartschijf in de (+x,−z)-hoek van zijn cel en
 *               de rest is gras -> dit stuk hoort in de cel díé het verst van
 *               de bocht af ligt
 *   binnenhoek  een graswig in de (−x,+z)-hoek en de rest pad -> dit stuk hoort
 *               in de cel binnenin de bocht, een halve slag gedraaid
 *
 * De twee overige cellen krijgen het gewone kantje van de tak die daar begint
 * of eindigt. Het basisgeval verbindt de zuid- en de oostrand; elke kwartslag
 * verder verschuift dat een rand op.
 */

import { Scene, CEL } from './terreinscene.mjs';

const UIT = 'scenes/eiland.glb';

const VELD = { breed: 30, diep: 45 };

/* De rijen waarop de ene familie in de andere overgaat. */
const BAAI = 3; // laatste rij open water
const STRAND = { talud: 4, droog: 7, eind: 8 }; // talud 4-6, droog zand 7-8

const ZAND = -0.15; // nulpunt van de zandfamilie
const WATER = -0.4; // nulpunt van het water

/* De terrassen, van laag naar hoog; elk ligt één stap boven het vorige en past
 * er aan alle kanten ruim in. De laatste is de kop waar de grot in zit: die
 * ligt twee stappen hoger, want de grotmond is 1,0 hoog. */
const TERRAS = [
  { niveau: 1, x: [5, 24], z: [16, 42] },
  { niveau: 2, x: [7, 20], z: [24, 40] },
  { niveau: 3, x: [10, 19], z: [32, 38] },
  { niveau: 5, x: [12, 18], z: [36, 37] },
];

const grasHoogte = (niveau) => CEL * niveau;
const KOP = TERRAS[TERRAS.length - 1];

const s = new Scene();

/* -- het pad ---------------------------------------------------------------
 * Eerst de route uitschrijven, want het gras moet weten waar geen gras komt.
 * padCel houdt per cel bij op welke hoogte het pad daar ligt. */
const padCel = new Map();
const sleutel = (i, j) => `${i},${j}`;
const kantjes = [];

/** Recht stuk van twee cellen breed. `as` is 'z' of 'x'; van..tot loopt langs
 * die as, `dwars` is de laagste van de twee cellen dwars erop. */
function padRecht(as, van, tot, dwars, niveau) {
  const hoogte = grasHoogte(niveau);
  for (let k = van; k <= tot; k++) {
    const cellen = as === 'z' ? [[dwars, k], [dwars + 1, k]] : [[k, dwars], [k, dwars + 1]];
    cellen.forEach(([i, j], n) => {
      padCel.set(sleutel(i, j), hoogte);
      /* Het kantje ligt aan de buitenkant van de tak: bij een noord-zuidtak
       * links en rechts, bij een oost-westtak voor en achter. */
      const draai = as === 'z' ? (n === 0 ? 0 : 180) : (n === 0 ? 270 : 90);
      kantjes.push({ i, j, draai, hoogte });
    });
  }
}

/**
 * Bocht in een blok van 2 × 2 cellen met (i, j) als hoek met de laagste
 * coördinaten. `slag` telt kwartslagen vanaf het basisgeval zuid–oost.
 */
function padBocht(i, j, slag, niveau) {
  const hoogte = grasHoogte(niveau);
  /* Basisgeval: (0,0) kantje west, (0,1) buitenhoek, (1,0) binnenhoek,
   * (1,1) kantje noord. Een kwartslag draait de cel én het stuk mee. */
  const basis = [
    { dx: 0, dz: 0, stuk: 'hilly-terrain-path-side', draai: 0 },
    { dx: 0, dz: 1, stuk: 'hilly-terrain-path-corner-outer-1x1', draai: 0 },
    { dx: 1, dz: 0, stuk: 'hilly-terrain-path-corner-inner-1x1', draai: 180 },
    { dx: 1, dz: 1, stuk: 'hilly-terrain-path-side', draai: 90 },
  ];
  for (const deel of basis) {
    let { dx, dz } = deel;
    for (let n = 0; n < slag; n++) [dx, dz] = [dz, 1 - dx];
    padCel.set(sleutel(i + dx, j + dz), hoogte);
    s.zet(deel.stuk, i + dx, j + dz, { draai: (deel.draai + slag * 90) % 360, hoogte });
  }
}

/* De route, van het strand tot in de grot. */
padRecht('z', 9, 13, 14, 0);
padRecht('z', 16, 17, 14, 1);
padBocht(14, 18, 1, 1); // zuid -> west
padRecht('x', 10, 13, 18, 1);
padBocht(8, 18, 3, 1); // oost -> noord
padRecht('z', 20, 21, 8, 1);
padRecht('z', 24, 25, 8, 2);
padBocht(8, 26, 0, 2); // zuid -> oost
padRecht('x', 10, 14, 26, 2);
padBocht(15, 26, 2, 2); // west -> noord
padRecht('z', 28, 29, 15, 2);
padRecht('z', 32, 35, 15, 3);

/* De trappen. Een trap klimt over twee cellen één stap, met de treden in de
 * volle celbreedte en het grastalud in de -x-helft; de rechterhelft is dus een
 * spiegeling. Hij vervangt daar de wand van het terras erboven. */
const TRAP = [
  { kolom: 14, rij: 14, niveau: 0 },
  { kolom: 8, rij: 22, niveau: 1 },
  { kolom: 15, rij: 30, niveau: 2 },
];
for (const trap of TRAP) {
  const hoogte = grasHoogte(trap.niveau);
  for (const rij of [trap.rij, trap.rij + 1]) {
    padCel.set(sleutel(trap.kolom, rij), hoogte);
    padCel.set(sleutel(trap.kolom + 1, rij), hoogte);
  }
  s.zet('cliff-terrain-path-steps-grass-edge-top', trap.kolom, trap.rij, { hoogte });
  s.zet('cliff-terrain-path-steps-grass-edge-top', trap.kolom + 1, trap.rij, { hoogte, spiegel: true });
}

/* Nu pas de kantjes van de rechte stukken: die van een cel waar intussen een
 * bocht of trap ligt vervallen. */
for (const kant of kantjes) {
  s.zet('hilly-terrain-path-side', kant.i, kant.j, { draai: kant.draai, hoogte: kant.hoogte });
}

/* De vloer van het pad ligt overal onder. */
for (const [cel, hoogte] of padCel) {
  const [i, j] = cel.split(',').map(Number);
  s.zet('hilly-terrain-path-center', i, j, { hoogte });
}

/* -- de baai en het strand -------------------------------------------------
 * Het water loopt één rij het talud op, zodat de waterlijn valt waar het zand
 * het wateroppervlak kruist en niet op een celrand. Het talud begint op de
 * celrand, vandaar de halve cel in de plaatsing. */
for (let i = 0; i < VELD.breed; i++) {
  for (let j = 0; j <= BAAI + 1; j++) s.zet('hilly-terrain-water-flat', i, j, { hoogte: WATER });
  s.zet('beach-terrain-sand-side-sharp', i, STRAND.talud - 0.5, { hoogte: ZAND });
  for (let j = STRAND.droog; j <= STRAND.eind; j++) {
    s.zet('beach-terrain-sand-floor-raised', i, j, { hoogte: ZAND });
  }
}

/* -- het gras --------------------------------------------------------------
 * Van elk terras alleen het stuk dat niet door een hoger terras of door het pad
 * bedekt wordt; wat eronder ligt zie je toch niet. */
function opTerras(terras, i, j) {
  return i >= terras.x[0] && i <= terras.x[1] && j >= terras.z[0] && j <= terras.z[1];
}

for (let i = 0; i < VELD.breed; i++) {
  for (let j = STRAND.eind + 1; j < VELD.diep; j++) {
    if (padCel.has(sleutel(i, j))) continue;
    /* het hoogste terras waar deze cel op ligt bepaalt de hoogte */
    let niveau = 0;
    for (const terras of TERRAS) if (opTerras(terras, i, j)) niveau = terras.niveau;
    s.zet('hilly-terrain-grass-floor', i, j, { hoogte: grasHoogte(niveau) });
  }
}

/* -- de wanden van de terrassen --------------------------------------------
 * Rondom elk terras, in de cel erbuiten, en per hoogtestap één wandstuk. De
 * ring loopt één cel door voorbij de hoeken, zodat de vier wanden elkaar daar
 * kruisen en er geen naad openblijft. Waar een trap of een grotmond zit komt
 * geen wand. */
function wand(i, j, draai, terras) {
  if (padCel.has(sleutel(i, j))) return;
  if (terras === KOP && j === KOP.z[0] - 1 && i === PAD_GROT) return;

  const kap = grasHoogte(terras.niveau) + 0.1;
  const onder = TERRAS.filter((t) => t !== terras && opTerras(t, i, j)).reduce((m, t) => Math.max(m, t.niveau), 0);
  s.zet('cliff-terrain-side-top', i, j, { draai, hoogte: kap - 0.6 });
  for (let n = terras.niveau - 1; n > onder; n--) {
    s.zet('cliff-terrain-side-mid', i, j, { draai, hoogte: grasHoogte(n) - 0.4 });
  }
}

const PAD_GROT = 15; // de kolom waar de grotmond in de bovenste wand zit

for (const terras of TERRAS) {
  for (let i = terras.x[0] - 1; i <= terras.x[1] + 1; i++) {
    wand(i, terras.z[0] - 1, 90, terras);
    wand(i, terras.z[1] + 1, 270, terras);
  }
  for (let j = terras.z[0] - 1; j <= terras.z[1] + 1; j++) {
    wand(terras.x[0] - 1, j, 180, terras);
    wand(terras.x[1] + 1, j, 0, terras);
  }
}

/* -- de grotmond -----------------------------------------------------------
 * Eén stuk dat de hele wandhoogte van twee stappen beslaat, in de zuidwand van
 * de kop, precies waar het pad ophoudt. Erachter een nis van grotstukken,
 * anders kijk je dwars door de berg heen. */
const GROT = { rij: KOP.z[0] - 1, vloer: grasHoogte(3) };
s.zet('cave-cliff-terrain-entrance-round-top', PAD_GROT, GROT.rij + 0.25, {
  draai: 270,
  hoogte: grasHoogte(3) + 0.1,
});
s.zet('cave-terrain-floor-normal', PAD_GROT, GROT.rij + 1, { hoogte: GROT.vloer });
for (const hoogte of [GROT.vloer, GROT.vloer + CEL]) {
  for (const draai of [0, 90, 180]) {
    s.zet('cave-terrain-side-mid', PAD_GROT, GROT.rij + 1, { draai, hoogte });
  }
}

/* -- de rand van het eiland ------------------------------------------------
 * Zonder rand is het veld een vel papier: van opzij gezien heeft het gras geen
 * dikte. De ring ligt één cel buiten het veld, met de gebeeldhouwde kant naar
 * buiten, en loopt door tot en met de hoekcellen. */
for (let j = -1; j <= VELD.diep; j++) {
  s.zet('escarpment-terrain-side-top', -1, j, { draai: 180, hoogte: -CEL });
  s.zet('escarpment-terrain-side-top', VELD.breed, j, { draai: 0, hoogte: -CEL });
}
for (let i = -1; i <= VELD.breed; i++) {
  s.zet('escarpment-terrain-side-top', i, -1, { draai: 90, hoogte: -CEL });
  s.zet('escarpment-terrain-side-top', i, VELD.diep, { draai: 270, hoogte: -CEL });
}

/* -- wegschrijven ---------------------------------------------------------- */

const uit = s.schrijf(UIT, [(VELD.breed - 1) / 2, (VELD.diep - 1) / 2]);
console.log(`${uit.stukken} stukken, ${uit.driehoeken} driehoeken, ${uit.punten} punten → ${UIT}`);
console.log(`maat: ${uit.maat[0]} × ${uit.maat[1]} × ${uit.maat[2]} unit`);
