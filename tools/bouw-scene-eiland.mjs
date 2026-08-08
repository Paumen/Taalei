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
 * hoogtemaat hebben. Vier ervan staan hier naast elkaar, want juist op de
 * naden tussen die families valt te leren wat het pakket wel en niet kan:
 *
 *   hilly       gras, pad, glooiende heuvels, water
 *   beach       zand, met een flauw talud naar het water
 *   cliff       rechte rotswand
 *   cave        grotmond in die wand, met een nis erachter
 *   escarpment  steilrand; hier de buitenrand van het eiland
 *
 * Props horen er bewust niet bij: dit gaat over het terrein zelf.
 *
 * -- het raster -------------------------------------------------------------
 * Cel van 0,5 × 0,5 unit, hoogtestap van 0,5 unit; zie tools/terreinscene.mjs.
 * Het gras ligt op y=0,1 en het pad op y=0,0: het pad is een ondiepe geul in
 * het gras, en die 0,1 verschil zit in de kantstukken verwerkt. Alle hoogtes
 * hieronder zijn ten opzichte daarvan, met y=0 als padhoogte.
 *
 * -- de plattegrond ---------------------------------------------------------
 * Veld van 20 × 30 cellen (10 × 15 unit). Van voor naar achter:
 *
 *     rij  0- 3   baai
 *     rij  4- 6   zandtalud, waar het water op het strand loopt
 *     rij  7- 8   droog strand
 *     rij  9-10   gras
 *     rij 11-12   talud omhoog, met de trap in het pad
 *     rij 13-20   plateau, pad op y=0,5
 *     rij 21-22   talud omlaag, met de trap in het pad
 *     rij 23-25   gras, tot aan de voet van de wand
 *     rij 25      klifwand van twee stappen, met de grotmond
 *     rij 26-29   terras op y=1,0
 *
 * Het pad loopt van het strand tot in de grot en rijgt alles aan elkaar: het
 * klimt over het plateau en eindigt bij de grotmond. Zo raakt elk soort stuk
 * minstens één keer aan een ander soort, en is in één oogopslag te zien of de
 * naden kloppen.
 *
 * -- hoogtes van de families ------------------------------------------------
 * De families delen het raster maar niet hun nulpunt, dus ze moeten met de
 * hand op elkaar gezet worden:
 *
 *   gras          eigen vloerstuk ligt op 0,1
 *   pad           eigen vloerstuk ligt op 0,0
 *   zand          vloer op 0,0 en "raised" op 0,25, en de stap ertussen is
 *                 0,25 in plaats van 0,5; met hoogte −0,15 komt het droge zand
 *                 dus gelijk met het gras te liggen en het natte zand 0,25
 *                 lager
 *   water         eigen vlak ligt op 0,35; met hoogte −0,4 staat het
 *                 wateroppervlak op −0,05, dus 0,1 onder het land en 0,1 boven
 *                 het natte zand
 *   wandstukken   een wandstuk is 0,6 hoog terwijl de stap 0,5 is: de voet
 *                 zakt 0,1 onder het maaiveld eronder. Regel: hoogte van een
 *                 afsluitend wandstuk = kaphoogte − 0,6
 *
 * -- welke kant een wandstuk op kijkt ---------------------------------------
 * Elk wandstuk — steilrand, klif, grotmond — heeft zijn gebeeldhouwde kant aan
 * de +x-kant en zijn platte achterwand aan de -x-kant. Het stuk ligt bovendien
 * niet midden in zijn cel maar tegen de -x-rand aan, en zijn kap raakt daar de
 * grond die eróp ligt.
 *
 * Daaruit volgt de regel: een wand die naar buiten kijkt in richting r wordt
 * zo gedraaid dat +x naar r wijst, en komt in de cel áchter de terreinrand te
 * staan — niet in de laatste terreincel zelf. Andersom (achterwand naar
 * buiten) hangt de grasrand als een uitstekend velletje over de wand heen; dat
 * is precies hoe het er fout uitziet.
 *
 * De grotmond is de uitzondering: daar zit de wand aan de -x-kant en steekt de
 * tunnel naar +x, dus die gaat andersom en schuift een kwart cel naar achteren
 * om met de rest van de wand in één vlak te komen.
 */

import { Scene, CEL } from './terreinscene.mjs';

const UIT = 'scenes/eiland.glb';

const VELD = { breed: 20, diep: 30 };

/* Het plateau in celcoördinaten, en het pad in kolommen. Beide staan midden op
 * de breedte: 6..13 en 9..10 hebben allebei 9,5 als middelpunt, net als het
 * veld zelf (0..19). */
const PLATEAU = { x: [6, 13], z: [13, 20] };
const PAD = { west: 9, oost: 10 };

/* De grens van het plateau ligt op de celrand, niet op het celmiddelpunt. Een
 * talud van twee cellen breed hangt eronder; deze vier rijen en kolommen zijn
 * de buitenste daarvan. */
const TALUD = {
  zuid: PLATEAU.z[0] - 2,
  noord: PLATEAU.z[1] + 2,
  west: PLATEAU.x[0] - 2,
  oost: PLATEAU.x[1] + 2,
};

/* De rijen waarop de ene familie in de andere overgaat. */
const BAAI = 3; // laatste rij open water
const STRAND = { talud: 4, droog: 7, eind: 8 }; // talud 4-6, droog zand 7-8
const KLIF = 25; // rij met de wand; het terras ligt daarachter

const ZAND = -0.15; // nulpunt van de zandfamilie
const WATER = -0.4; // nulpunt van het water
const TERRAS = 2 * CEL; // het terras ligt twee stappen boven het gras

const s = new Scene();

const inPlateau = (i, j) =>
  i >= PLATEAU.x[0] && i <= PLATEAU.x[1] && j >= PLATEAU.z[0] && j <= PLATEAU.z[1];
const opPad = (i) => i === PAD.west || i === PAD.oost;

/* -- de baai en het strand -------------------------------------------------
 * Het water loopt één rij het talud op, zodat de waterlijn valt waar het zand
 * het wateroppervlak kruist en niet op een celrand. */
for (let i = 0; i < VELD.breed; i++) {
  for (let j = 0; j <= BAAI + 1; j++) s.zet('hilly-terrain-water-flat', i, j, { hoogte: WATER });

  /* Het talud loopt van zijn oorsprong 1,5 unit naar +z omhoog — drie cellen,
   * maar beginnend op de celrand. Vandaar de halve cel in de plaatsing. */
  s.zet('beach-terrain-sand-side-sharp', i, STRAND.talud - 0.5, { hoogte: ZAND });

  for (let j = STRAND.droog; j <= STRAND.eind; j++) {
    s.zet('beach-terrain-sand-floor-raised', i, j, { hoogte: ZAND });
  }
}

/* -- het gras --------------------------------------------------------------
 * Van het einde van het strand tot aan de klifwand. Niet onder het plateau
 * (daar ligt gras een stap hoger) en niet in de padkolommen: die liggen van
 * voor tot achter lager, en een grasvlak op 0,1 zou dwars door het pad en de
 * trap heen steken. Wél onder de taluds: die staan met hun voet precies op
 * grashoogte, en de ronde buitenhoeken laten anders een gat in de hoek. */
for (let i = 0; i < VELD.breed; i++) {
  if (opPad(i)) continue;
  for (let j = STRAND.eind + 1; j <= KLIF; j++) {
    if (inPlateau(i, j)) continue;
    s.zet('hilly-terrain-grass-floor', i, j);
  }
}

/* Gras op het plateau, behalve waar het pad ligt. */
for (let i = PLATEAU.x[0]; i <= PLATEAU.x[1]; i++) {
  if (opPad(i)) continue;
  for (let j = PLATEAU.z[0]; j <= PLATEAU.z[1]; j++) s.zet('hilly-terrain-grass-floor', i, j, { hoogte: CEL });
}

/* -- de taluds van het plateau ---------------------------------------------
 * Het stuk loopt ongedraaid omhoog naar +z over twee cellen, dus het hangt met
 * zijn hoge kant aan de plateaurand. */
for (let i = PLATEAU.x[0]; i <= PLATEAU.x[1]; i++) {
  if (opPad(i)) continue;
  s.zet('hilly-terrain-hill-side-sharp', i, TALUD.zuid);
  s.zet('hilly-terrain-hill-side-sharp', i, TALUD.noord, { draai: 180 });
}
for (let j = PLATEAU.z[0]; j <= PLATEAU.z[1]; j++) {
  s.zet('hilly-terrain-hill-side-sharp', TALUD.west, j, { draai: 90 });
  s.zet('hilly-terrain-hill-side-sharp', TALUD.oost, j, { draai: 270 });
}

/* De vier buitenhoeken. De ongedraaide hoek heeft zijn plateau links-achter
 * (-x, +z); elke draai van 90° verzet dat een kwartslag. De oorsprong ligt één
 * cel diagonaal buiten de plateauhoek. */
s.zet('hilly-terrain-hill-corner-outer-2x2', PLATEAU.x[0] - 1, PLATEAU.z[0] - 1, { draai: 90 });
s.zet('hilly-terrain-hill-corner-outer-2x2', PLATEAU.x[1] + 1, PLATEAU.z[0] - 1, { draai: 0 });
s.zet('hilly-terrain-hill-corner-outer-2x2', PLATEAU.x[1] + 1, PLATEAU.z[1] + 1, { draai: 270 });
s.zet('hilly-terrain-hill-corner-outer-2x2', PLATEAU.x[0] - 1, PLATEAU.z[1] + 1, { draai: 180 });

/* -- het pad ---------------------------------------------------------------
 * Het kantstuk beslaat de -x-helft van zijn eigen cel; twee kolommen met elk
 * hun kantje laten daartussen 0,5 unit vlak pad over. Het rechterkantje
 * bestaat niet los in de kit en komt uit een spiegeling in x. */
function padTegel(j, hoogte) {
  for (const i of [PAD.west, PAD.oost]) {
    s.zet('hilly-terrain-path-center', i, j, { hoogte });
    s.zet('hilly-terrain-path-side', i, j, { hoogte, spiegel: i === PAD.oost });
  }
}

for (let j = STRAND.eind + 1; j < TALUD.zuid; j++) padTegel(j, 0);
for (let j = PLATEAU.z[0]; j <= PLATEAU.z[1]; j++) padTegel(j, CEL);
/* Het pad loopt één rij de wand in, tot onder de grotmond: de mond zelf begint
 * pas op grashoogte, en zonder vloer eronder kijk je door die 0,1 onder het
 * eiland door. */
for (let j = TALUD.noord + 1; j <= KLIF; j++) padTegel(j, 0);

/* De twee trappen. Het trapstuk bevat zowel de treden als het grastalud
 * ernaast, dus het vervangt daar zowel de padtegel als het gewone talud. */
s.zet('hilly-terrain-path-hill-sharp-steps-side', PAD.west, TALUD.zuid);
s.zet('hilly-terrain-path-hill-sharp-steps-side', PAD.oost, TALUD.zuid, { spiegel: true });
s.zet('hilly-terrain-path-hill-sharp-steps-side', PAD.west, TALUD.noord, { draai: 180, spiegel: true });
s.zet('hilly-terrain-path-hill-sharp-steps-side', PAD.oost, TALUD.noord, { draai: 180 });

/* -- de klifwand met de grotmond -------------------------------------------
 * Een wand van twee stappen: een vlak tussenstuk op 0,0 en het sluitstuk op
 * 0,5, samen een kap op 1,1 — het maaiveld van het terras. De wand kijkt naar
 * -z, dus +x moet naar -z wijzen: een kwartslag met de klok mee. De kap ligt
 * dan in de +z-helft van rij KLIF, en het terras begint pas in de rij daarna.
 *
 * Niet cliff-terrain-side-base onderaan, hoe logisch die naam ook klinkt: dat
 * stuk is het puinhellinkje aan de voet van een wand en loopt van beneden-binnen
 * naar boven-buiten. Gebruik je het als onderste laag, dan blijft er tussen het
 * gras en het sluitstuk een spleet van 0,4 open waar je onder het eiland door
 * kijkt.
 *
 * De grotmond is één stuk dat de hele wandhoogte beslaat. Hij is één cel breed
 * en het pad twee, dus hij staat op de westelijke padkolom; twee monden naast
 * elkaar zetten werkt niet, want de stukken steken over hun cel heen en lopen
 * dan in elkaar. Hij draait de andere kant op dan de wand — zie de regel
 * bovenaan — en staat een kwart cel naar achteren, zodat zijn voorvlak in het
 * vlak van de rotswand valt.
 *
 * De wand loopt één cel door voorbij het veld, tot in de rand, zodat er aan de
 * uiteinden geen naad openblijft. */
for (let i = -1; i <= VELD.breed; i++) {
  if (i === PAD.west) {
    s.zet('cave-cliff-terrain-entrance-round-top', i, KLIF + 0.25, { draai: 270, hoogte: 0.1 });
  } else {
    s.zet('cliff-terrain-side-mid', i, KLIF, { draai: 90, hoogte: 0 });
    s.zet('cliff-terrain-side-top', i, KLIF, { draai: 90, hoogte: CEL });
  }
  if (i < 0 || i >= VELD.breed) continue;
  for (let j = KLIF + 1; j < VELD.diep; j++) s.zet('hilly-terrain-grass-floor', i, j, { hoogte: TERRAS });
}

/* Een nis achter de mond, anders kijk je dwars door de berg heen het gras aan
 * de andere kant. Drie grotwanden en een grotvloer; het gras van het terras is
 * het plafond. Donker wordt het er niet van — de viewer heeft geen
 * omgevingsocclusie — maar het is wel rots waar je tegenaan kijkt. */
s.zet('cave-terrain-floor-normal', PAD.west, KLIF + 1, { hoogte: 0 });
for (const hoogte of [0, CEL]) {
  for (const draai of [0, 90, 180]) {
    s.zet('cave-terrain-side-mid', PAD.west, KLIF + 1, { draai, hoogte });
  }
}

/* -- de rand van het eiland ------------------------------------------------
 * Zonder rand is het veld een vel papier: van opzij gezien heeft het gras geen
 * dikte. De steilrandstukken staan zo laag dat hun kap precies op maaiveldhoogte
 * uitkomt.
 *
 * De ring ligt één cel búiten het veld: de kap van een steilrandstuk zit tegen
 * de rand van zijn eigen cel en draagt daar de grond die erop ligt, dus het
 * stuk hoort naast de laatste terreincel en niet erin. De gebeeldhouwde kant
 * wijst naar buiten (zie de regel bovenaan).
 *
 * Langs het terras ligt de kap twee stappen hoger; daar gaan er twee vlakke
 * tussenstukken onder, anders staat de wand op niets.
 *
 * De losse buitenhoek van de kit beslaat alleen het hoekje zelf en laat een
 * gat als de rechte stukken er niet tot op de millimeter tegenaan eindigen.
 * Hier lopen de vier wanden door tot en met de hoekcel en kruisen ze elkaar
 * daar: een haakse hoek in plaats van een afgeronde, en geen naad die opengaat.
 */
function rand(i, j, draai) {
  if (j <= KLIF) {
    s.zet('escarpment-terrain-side-top', i, j, { draai, hoogte: -CEL });
    return;
  }
  s.zet('escarpment-terrain-side-mid', i, j, { draai, hoogte: -CEL });
  s.zet('escarpment-terrain-side-mid', i, j, { draai, hoogte: 0 });
  s.zet('escarpment-terrain-side-top', i, j, { draai, hoogte: CEL });
}

for (let j = -1; j <= VELD.diep; j++) {
  rand(-1, j, 180);
  rand(VELD.breed, j, 0);
}
for (let i = -1; i <= VELD.breed; i++) {
  rand(i, -1, 90);
  rand(i, VELD.diep, 270);
}

/* -- wegschrijven ---------------------------------------------------------- */

const uit = s.schrijf(UIT, [(VELD.breed - 1) / 2, (VELD.diep - 1) / 2]);
console.log(`${uit.stukken} stukken, ${uit.driehoeken} driehoeken, ${uit.punten} punten → ${UIT}`);
console.log(`maat: ${uit.maat[0]} × ${uit.maat[1]} × ${uit.maat[2]} unit`);
