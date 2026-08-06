/**
 * Zet de Modular Village-pack om naar kits/village-kit.
 *
 * Draai vanuit de repo-root:  node tools/importeer-village.mjs <map-met-obj>
 *
 * De bronbestanden (.obj) staan niet in de repo — alleen het resultaat.
 *
 * Anders dan de andere geïmporteerde packs is er geen stap met FBX2glTF: deze
 * pack komt als 155 losse .obj-bestanden met één gedeelde .mtl ernaast. Dit
 * script leest die twee formaten zelf en schrijft er .glb van. Dat scheelt een
 * omweg, maar belangrijker: een .obj draagt geen scèneboom, geen skinning en
 * geen materiaalinstellingen die we zouden moeten opruimen. Wat erin staat is
 * precies wat we nodig hebben — hoekpunten, normalen, driehoeken en per
 * driehoek de naam van een materiaal.
 *
 * Dit script voegt daarnaast drie kleuren toe aan de gedeelde colormap; zie
 * NIEUWE_CELLEN hieronder.
 *
 * -- kleur ----------------------------------------------------------------
 *
 * De pack heeft geen texture-atlas. De .mtl geeft elk materiaal één vlakke
 * kleur (`Kd`), en elke driehoek wijst één materiaal aan. Het hermappen dat
 * importeer-nature/-tropical/-rocks per hoekpunt doen — bronkleur uit de
 * bron-atlas opzoeken, dichtstbijzijnde doelkleur terugzoeken — kan hier dus
 * per materiaal in plaats van per hoekpunt. Het resultaat is hetzelfde soort
 * omzetting, alleen exact in plaats van bij benadering: alle hoekpunten van
 * een driehoek krijgen dezelfde UV, dus een driehoek kan per definitie niet
 * over meer dan één cel lopen. De `snap`-ronde en toetsDriehoeken() uit
 * kleurmap.mjs zijn hier daarom niet nodig.
 *
 * -- schaal ---------------------------------------------------------------
 *
 * De pack staat al op het raster van de repo en wordt dus niet geschaald
 * (stijlgids §4). Dat is niet één ijkpunt maar het hele pakket: een wandsegment
 * is 1,00 × 1,00 met een dikte van 0,06, `Stucco_Block` is 1,00 × 1,00 × 1,00,
 * de vloertegels zijn 1,00 × 1,00 en de brede deuropeningen precies 2,00 hoog —
 * twee wandhoogtes. 118 van de 155 modellen hebben een rand die exact op een
 * halve rastereenheid ligt.
 *
 * -- oorsprong ------------------------------------------------------------
 *
 * Hier wijkt deze kit bewust af van stijlgids §5, en dat is de reden dat
 * zetOpOorsprong() uit glb.mjs hier niet gebruikt wordt.
 *
 * De standaardregel — voet op y = 0, pivot op het midden van het grondvlak —
 * gaat uit van een los voorwerp dat je ergens neerzet. Een bouwpakket is dat
 * niet: de stukken moeten ten opzichte van elkáár kloppen, en de pack legt dat
 * vast in de oorsprong van elk model. Y = 0 is er het vloervlak van het raster,
 * niet de onderkant van het model:
 *
 *   - de vloertegels lopen tot y = -0,10 (hout) en -0,20 (steen en kei): hun
 *     bovenkant ligt op het vloervlak, de dikte hangt eronder;
 *   - dakstukken met een overstek hangen 0,12 tot 0,25 onder y = 0;
 *   - `waterwheel` loopt van -2,20 tot 2,20 en `windmill-blades` van -3,50 tot
 *     3,50: die staan gecentreerd op hun as, want daar draaien ze omheen;
 *   - de wandprops zitten op x ≈ 0,39, tegen het vlak van een muur aan;
 *   - `stone-pillar` en `wood-post-large` staan op een rasterhoek (x/z-midden
 *     op -0,50 / 0,50) in plaats van in het midden van een vak.
 *
 * Elk model apart centreren zou dat allemaal weggooien: elke vloertegel zou
 * 0,10 tot 0,20 omhoog springen, elk overstek 0,12 tot 0,25, het waterrad 2,20,
 * en de wandprops zouden van hun muur af komen. De stukken passen dan niet
 * meer op elkaar, en dat is het enige waar een bouwpakket voor bestaat. De
 * oorsprong van de pack blijft daarom staan zoals hij is.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene } from './glb.mjs';
import { leesPng, schrijfPng } from './png.mjs';
import { doelPunten, gevuldeCellen, voegGradientCelToe, kopieerColormap, kleurAfstand, naarHex } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'village-kit');
const COLORMAP = join(KITS, 'colormap.png');

/** Zie de kop: de pack staat al op het raster van de repo. */
const SCHAAL = 1;

/**
 * De drie kleuren die niet uit kits/colormap.png te halen waren.
 *
 * Van de 21 materialen die de pack gebruikt kwamen er elf op een bestaande cel
 * uit op een afstand die klein genoeg is om ze daar te laten (19 tot 85; de
 * grens waaronder build-catalog.mjs twee stalen als hetzelfde behandelt is
 * 120). Maar afstand per kleur is hier niet het hele verhaal. De pack zet zijn
 * materialen in families van twee tot vier tinten die op hetzelfde model naast
 * elkaar liggen — de twee dakpantinten op elk dakstuk, de vier houttinten op
 * de kar en het waterrad, de vier steentinten op elke muur en vloer. Wat je
 * ziet is niet de kleur maar het verschil ertussen, en juist dat verschil ging
 * bij het hermappen stuk:
 *
 *   - `Red_Roof` en `Dark_Red_Roof` staan in de bron 81 uit elkaar en kwamen
 *     allebei op cel [7,0] uit, 17 uit elkaar. Alle 21 dakstukken werden
 *     daarmee één vlakke rode kleur in plaats van een dakpanpatroon.
 *   - De vier houttinten braken in tweeën: `Wood_Darker` en `Wood_Dark` vielen
 *     samen op [12,0] (83 → 19) terwijl `Wood_Dark` en `Wood_Medium` over de
 *     celgrens naar [13,0] uit elkaar sprongen (75 → 135). De gelijkmatige
 *     trap van licht naar donker werd zo een sprong met twee gelijke treden
 *     ernaast.
 *   - Het steen van de pack is warm taupe; elk grijs in het gedeelde palet is
 *     blauwgrijs. De onderlinge contrasten bleven staan, maar de donkerste van
 *     de vier tinten landde op een ándere cel ([6,1]) dan de andere drie
 *     ([15,3]), dus muur en vloer kregen een blauwe tint met een losse
 *     donkergrijze vlek erin.
 *
 * Dit is dus het geval dat stijlgids §1 beschrijft: geen bestaande kleur komt
 * in de buurt van wat de pack nodig heeft, de drie banen passen binnen wat er
 * staat, en ze gaan de gedeelde colormap in — geen eigen atlas voor deze kit.
 *
 * De cellen liggen naast de kleuren waar ze bij horen: [8,0] naast het
 * bestaande rood op [7,0], [14,0] naast de bruinen op [12,0] en [13,0], en
 * [14,3] naast het blauwgrijs op [15,3]. Alle drie waren leeg.
 *
 * Elke baan loopt van de lichtste tot de donkerste tint die de pack in die
 * familie heeft. Dat de tussenliggende tinten dan vanzelf goed vallen is geen
 * toeval maar wel een meevaller: de pack heeft zijn tinten lineair gekozen, dus
 * `Wood_Medium` en `Wood_Dark` komen op 2 en 5 van hun eigen kleur uit, en
 * `Stone_Brit_Gray` en `Stone_Brit_Gray_Light` op 4 en 11. Over de twaalf
 * materialen die op deze drie banen landen is de grootste afstand 49 en de
 * gemiddelde 11.
 */
const NIEUWE_CELLEN = [
  {
    naam: 'dakrood',
    cel: [8, 0],
    boven: [147, 68, 49],   // #934431  Red_Roof
    onder: [108, 46, 30],   // #6c2e1e  Dark_Red_Roof
  },
  {
    naam: 'hout',
    cel: [14, 0],
    boven: [188, 161, 118], // #bca176  Wood_Light
    onder: [98, 80, 64],    // #625040  Wood_Darker
  },
  {
    naam: 'natuursteen',
    cel: [14, 3],
    boven: [169, 152, 139], // #a9988b  Stone_Bri_Gray_Lighter
    onder: [103, 90, 80],   // #675a50  Stone_Brit_Gray_Dark
  },
];

/**
 * Bekend en in orde: `Dirt` (afstand 49) en `Burlap` (24) komen op de nieuwe
 * houtbaan uit in plaats van op het zandbruin van [13,0].
 *
 * Dat is een gevolg van het toevoegen van die baan: het jute en de aarde van de
 * pack liggen in de bron dicht tegen `Wood_Light` aan, dus zodra die kleur er
 * precies is, is hij ook voor hun de dichtstbijzijnde. Ze vallen daarmee samen
 * met het lichtste hout. Dat is te verdedigen — het scheelt in de bron maar 24
 * respectievelijk 49 — en het alternatief zou een uitzondering per materiaal
 * zijn, iets wat geen enkele andere importeur in deze repo kent. `Wood_Light`
 * komt bovendien alleen voor op de roeispanen, de kar en het krat, en `Dirt`
 * alleen op de grond; ze staan zelden op hetzelfde model naast elkaar.
 *
 * Zo ook `Iron_Grey` en `Iron_Grey_-_Light`, die van het blauwgrijs op [15,3]
 * naar de nieuwe steenbaan verhuizen. Dat is er geen achteruitgang maar een
 * verbetering: hun afstand gaat van 47 en 53 naar 18 en 22. Het ijzer en het
 * steen van deze pack scheiden in de bron zelf nauwelijks (30 uit elkaar), dus
 * dat ze op dezelfde baan uitkomen zegt de waarheid over de pack.
 */

/**
 * Bronbestand → naam in de kit, kebab-case zoals de rest van de repo.
 *
 * De pack scheidt met liggende streepjes en nummert door vanaf 1; hier lopen de
 * varianten op letters, zoals bij de andere kits (`stone-wall-a` … `-e`). Waar
 * de pack maar één variant heeft vervalt de letter: `Waterwheel_1` is gewoon
 * `waterwheel`, want er is geen tweede.
 *
 * Drie voorvoegsels van de pack vallen weg omdat ze over de map gaan en niet
 * over het model. `Prop_`, `Wall_Prop_` en `Roof_Prop_` zeggen alleen dát het
 * een los voorwerp is en waar het hoort; `Prop_Barrel_1` heet hier dus
 * `barrel-a` en `Wall_Prop_Bell_1` `bell-a`. `Stucco_Prop_Support_` wordt
 * `stucco-support-`, en `Kit_Window_Upper_` wordt `window-upper-`: dat zijn
 * geen losse ramen maar twee kant-en-klare bovenverdiepingen.
 *
 * Vier namen zeggen niet goed wat het model is. `Prop_Well_Cobblestone`,
 * `_Dirt` en `_Grass` zijn niet drie putten maar drie grondvlakken van 1 × 1
 * om ónder de put te leggen; die heten hier `well-base-…`. En
 * `Wall_Prop_Windmill_1` is niet de molen maar alleen de wieken (7 × 7 units,
 * gecentreerd op de as), dus `windmill-blades`.
 */
const NAMEN = {
  Canopy_Beam: 'canopy-beam',
  Canopy_Beam_Short: 'canopy-beam-short',
  Canopy_Corner: 'canopy-corner',
  Canopy_Full: 'canopy-full',
  Canopy_Ramp_Corner: 'canopy-ramp-corner',
  Canopy_Ramp_Full: 'canopy-ramp-full',
  Canopy_Ramp_Mid: 'canopy-ramp-mid',
  Canopy_Side: 'canopy-side',
  Canopy_Sides_Opposite: 'canopy-sides-opposite',
  Canopy_Top: 'canopy-top',

  Cobblestone_Dirt_Transition_1: 'cobblestone-dirt-transition-a',
  Cobblestone_Dirt_Transition_2: 'cobblestone-dirt-transition-b',
  Cobblestone_Dirt_Transition_3: 'cobblestone-dirt-transition-c',
  Cobblestone_Dirt_Transition_4: 'cobblestone-dirt-transition-d',
  Cobblestone_Floor_1: 'cobblestone-floor-a',

  Dirt_Fading: 'dirt-fading',
  Dirt_Fading_from_Gathered: 'dirt-fading-gathered',
  Dirt_Gathered_Corner: 'dirt-gathered-corner',
  Dirt_Gathered_Straight: 'dirt-gathered-straight',

  Kit_Window_Upper_Convex: 'window-upper-convex',
  Kit_Window_Upper_Straight: 'window-upper-straight',

  Prop_Barrel_1: 'barrel-a',
  Prop_Barrel_1_Open: 'barrel-a-open',
  Prop_Barrel_2: 'barrel-b',
  Prop_Boat_1: 'boat-a',
  Prop_Boat_2: 'boat-b',
  Prop_Boat_Oars_1: 'boat-oars-a',
  Prop_Boat_Oars_2: 'boat-oars-b',
  Prop_Broom: 'broom',
  Prop_Cart_1: 'cart-a',
  Prop_Cart_1_Barrels: 'cart-a-barrels',
  Prop_Cart_1_Hay: 'cart-a-hay',
  Prop_Crate_1: 'crate-a',
  Prop_Crate_1_Open: 'crate-a-open',
  Prop_Hay_1: 'hay-a',
  Prop_Ladder_1: 'ladder-a',
  Prop_Lamp_Street: 'lamp-street',
  Prop_Well_1: 'well-a',
  Prop_Well_Cobblestone: 'well-base-cobblestone',
  Prop_Well_Dirt: 'well-base-dirt',
  Prop_Well_Grass: 'well-base-grass',
  Prop_Well_Inside: 'well-inside',

  Roof_Accent_Rake_Concave: 'roof-accent-rake-concave',
  Roof_Accent_Rake_Convex: 'roof-accent-rake-convex',
  Roof_Accent_Rake_Eave: 'roof-accent-rake-eave',
  Roof_Accent_Rake_Straight: 'roof-accent-rake-straight',
  Roof_Accent_Ridge: 'roof-accent-ridge',
  Roof_Accent_Ridge_End: 'roof-accent-ridge-end',
  Roof_Concave_Corner_Inner: 'roof-concave-corner-inner',
  Roof_Concave_Corner_Outer: 'roof-concave-corner-outer',
  Roof_Concave_Corner_Outer_Eave: 'roof-concave-corner-outer-eave',
  Roof_Concave_Side: 'roof-concave-side',
  Roof_Concave_Side_Eave: 'roof-concave-side-eave',
  Roof_Concave_Side_Eave_Edge: 'roof-concave-side-eave-edge',
  Roof_Concave_Side_Edge: 'roof-concave-side-edge',
  Roof_Convex_Corner_Inner: 'roof-convex-corner-inner',
  Roof_Convex_Corner_Outer: 'roof-convex-corner-outer',
  Roof_Convex_Corner_Outer_Eave: 'roof-convex-corner-outer-eave',
  Roof_Convex_Side: 'roof-convex-side',
  Roof_Convex_Side_Eave: 'roof-convex-side-eave',
  Roof_Convex_Side_Eave_Edge: 'roof-convex-side-eave-edge',
  Roof_Convex_Side_Edge: 'roof-convex-side-edge',
  Roof_Straight_Corner_Inner: 'roof-straight-corner-inner',
  Roof_Straight_Corner_Outer: 'roof-straight-corner-outer',
  Roof_Straight_Corner_Outer_Eave: 'roof-straight-corner-outer-eave',
  Roof_Straight_Side: 'roof-straight-side',
  Roof_Straight_Side_Eave: 'roof-straight-side-eave',
  Roof_Straight_Side_Eave_Edge: 'roof-straight-side-eave-edge',
  Roof_Straight_Side_Edge: 'roof-straight-side-edge',
  Roof_Prop_Chimney_Pipe: 'chimney-pipe',
  Roof_Prop_Chimney_Stone: 'chimney-stone',

  Stone_Arch: 'stone-arch',
  Stone_Arch_Outer: 'stone-arch-outer',
  Stone_Curb_1: 'stone-curb-a',
  Stone_Curb_2: 'stone-curb-b',
  Stone_Curb_3: 'stone-curb-c',
  Stone_Curb_4: 'stone-curb-d',
  Stone_Doorway_Narrow_Tall_1: 'stone-doorway-narrow-tall-a',
  Stone_Doorway_Narrow_Tall_2: 'stone-doorway-narrow-tall-b',
  Stone_Doorway_Wide_Tall_1: 'stone-doorway-wide-tall-a',
  Stone_Doorway_Wide_Tall_2: 'stone-doorway-wide-tall-b',
  Stone_Floor_1: 'stone-floor-a',
  Stone_Floor_2: 'stone-floor-b',
  Stone_Pillar: 'stone-pillar',
  Stone_Pillar_Base: 'stone-pillar-base',
  Stone_Sewer_Grate_1: 'stone-sewer-grate-a',
  Stone_Sewer_Grate_2: 'stone-sewer-grate-b',
  Stone_Stairs_Railing: 'stone-stairs-railing',
  Stone_Steps: 'stone-steps',
  Stone_Steps_Side_1: 'stone-steps-side-a',
  Stone_Steps_Side_2: 'stone-steps-side-b',
  Stone_Wall_1: 'stone-wall-a',
  Stone_Wall_2: 'stone-wall-b',
  Stone_Wall_3: 'stone-wall-c',
  Stone_Wall_4: 'stone-wall-d',
  Stone_Wall_5: 'stone-wall-e',
  Stone_to_Stucco_Doorway_Wide_Tall_1: 'stone-stucco-doorway-wide-tall-a',
  Stone_to_Stucco_Doorway_Wide_Tall_2: 'stone-stucco-doorway-wide-tall-b',

  Stucco_Arch_Half: 'stucco-arch-half',
  Stucco_Arch_Half_Outer: 'stucco-arch-half-outer',
  Stucco_Block: 'stucco-block',
  Stucco_Doorway_Narrow_Tall: 'stucco-doorway-narrow-tall',
  Stucco_Doorway_Wide_Tall: 'stucco-doorway-wide-tall',
  Stucco_Prop_Support_Angled_Large: 'stucco-support-angled-large',
  Stucco_Prop_Support_Angled_Low: 'stucco-support-angled-low',
  Stucco_Prop_Support_Angled_Small: 'stucco-support-angled-small',
  Stucco_Prop_Support_Beam_1: 'stucco-support-beam-a',
  Stucco_Prop_Support_Beam_2: 'stucco-support-beam-b',
  Stucco_Prop_Support_Beam_3: 'stucco-support-beam-c',
  Stucco_Prop_Support_Pillar_1: 'stucco-support-pillar-a',
  Stucco_Prop_Support_Pillar_2: 'stucco-support-pillar-b',
  Stucco_Prop_Support_Pillar_3: 'stucco-support-pillar-c',
  Stucco_Window_Double_Narrow: 'stucco-window-double-narrow',
  Stucco_Window_Double_Narrow_Tall: 'stucco-window-double-narrow-tall',
  Stucco_Window_Double_Wide: 'stucco-window-double-wide',
  Stucco_Window_Double_Wide_Tall: 'stucco-window-double-wide-tall',
  Stucco_Window_Rounded_Narrow: 'stucco-window-rounded-narrow',
  Stucco_Window_Rounded_Narrow_Tall: 'stucco-window-rounded-narrow-tall',
  Stucco_Window_Rounded_Wide: 'stucco-window-rounded-wide',
  Stucco_Window_Rounded_Wide_Tall: 'stucco-window-rounded-wide-tall',
  Stucco_Window_Single_Narrow: 'stucco-window-single-narrow',
  Stucco_Window_Single_Narrow_Tall: 'stucco-window-single-narrow-tall',
  Stucco_Window_Single_Wide: 'stucco-window-single-wide',
  Stucco_Window_Single_Wide_Tall: 'stucco-window-single-wide-tall',

  Wall_Prop_Bell_1: 'bell-a',
  Wall_Prop_Door_Ornate: 'door-ornate',
  Wall_Prop_Door_Simple: 'door-simple',
  Wall_Prop_Lamp: 'lamp-wall',
  Wall_Prop_Sign_1: 'sign-a',
  Wall_Prop_Windmill_1: 'windmill-blades',

  Waterwheel_1: 'waterwheel',
  Waterwheel_Flume_Curved: 'waterwheel-flume-curved',
  Waterwheel_Flume_End: 'waterwheel-flume-end',
  Waterwheel_Flume_Ramp: 'waterwheel-flume-ramp',
  Waterwheel_Flume_Ramp_Supported: 'waterwheel-flume-ramp-supported',
  Waterwheel_Flume_Straight: 'waterwheel-flume-straight',
  Waterwheel_Flume_Support_Brace: 'waterwheel-flume-brace',
  Waterwheel_Flume_Support_Brace_Double: 'waterwheel-flume-brace-double',
  Waterwheel_Flume_Support_Pillar: 'waterwheel-flume-pillar',

  Wood_Baseboard: 'wood-baseboard',
  Wood_Floor_Corner: 'wood-floor-corner',
  Wood_Floor_Straight_1: 'wood-floor-straight-a',
  Wood_Floor_Straight_2: 'wood-floor-straight-b',
  Wood_Floor_Straight_3: 'wood-floor-straight-c',
  Wood_Floor_Straight_4: 'wood-floor-straight-d',
  Wood_Post_Large: 'wood-post-large',
  Wood_Post_Small: 'wood-post-small',
  Wood_Railing_Corner: 'wood-railing-corner',
  Wood_Railing_Stairs: 'wood-railing-stairs',
  Wood_Railing_Straight: 'wood-railing-straight',
  Wood_Rope_Corner: 'wood-rope-corner',
  Wood_Rope_Stairs: 'wood-rope-stairs',
  Wood_Rope_Straight: 'wood-rope-straight',
  Wood_Steps: 'wood-steps',
  Wood_Steps_Stucco: 'wood-steps-stucco',
};

/** Het materialenbestand dat de pack meelevert; gaat niet mee de repo in. */
const BRON_MTL = 'Materials_Modular_Village.mtl';

/* -- de bronformaten lezen ------------------------------------------------ */

/**
 * De `Kd`-regel van elk materiaal uit een .mtl, als 0-255.
 *
 * Verder staat er in dit bestand niets dat we nodig hebben: `Ka` is overal
 * zwart, `Ks` overal wit, `Ns` overal 0 en `d` overal 1. Er is geen enkele
 * textuurverwijzing — vandaar dat de kleur uit `Kd` moet komen.
 *
 * @returns {Map<string, number[]>} materiaalnaam → [r, g, b]
 */
function leesMtl(pad) {
  const kleuren = new Map();
  let huidig = null;

  for (const regel of readFileSync(pad, 'utf8').split(/\r?\n/)) {
    const naam = regel.match(/^newmtl\s+(.+?)\s*$/);
    if (naam) {
      huidig = naam[1];
      continue;
    }
    const kd = regel.match(/^Kd\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (kd && huidig !== null) {
      kleuren.set(huidig, [1, 2, 3].map((i) => Math.round(Number(kd[i]) * 255)));
    }
  }
  if (kleuren.size === 0) throw new Error(`geen materialen in ${pad}`);
  return kleuren;
}

/**
 * Een .obj uitlezen tot driehoeken met een materiaalnaam.
 *
 * Wat we meenemen: `v` (hoekpunt), `vn` (normaal), `f` (vlak) en `usemtl`. De
 * pack levert overal driehoeken aan — geen enkel vlak in de 155 bestanden heeft
 * meer dan drie hoekpunten — dus er hoeft niets opgedeeld te worden; dat een
 * vierhoek hier een fout oplevert is beter dan hem stilletijgs half inlezen.
 *
 * Wat we laten liggen: `vt` en `s`. De `vt`-coördinaten wijzen naar een textuur
 * die er niet is (de .mtl noemt er geen), dus ze zeggen niets over kleur; dit
 * script maakt zijn eigen UV's uit de kleur van het materiaal. De
 * `s`-rookgroepen doen er niet toe omdat de normalen al uitgerekend in het
 * bestand staan.
 *
 * `o`/`g` slaan we over: een aantal bestanden zet zijn onderdelen in losse
 * objecten (de kar met hooi in 39 stuks), maar die worden hier toch tot één
 * mesh samengevoegd — ze delen hetzelfde materiaal en horen bij hetzelfde
 * voorwerp, en één primitive is één tekenopdracht. De indexen van een .obj
 * lopen bovendien door over het hele bestand heen, niet per object, dus ze
 * hoeven niet omgenummerd te worden.
 *
 * @returns {{posities: number[][], normalen: number[][], driehoeken: Array<{v: number[], n: number[], mtl: string}>}}
 */
function leesObj(pad) {
  const posities = [];
  const normalen = [];
  const driehoeken = [];
  let materiaal = null;

  for (const regel of readFileSync(pad, 'utf8').split(/\r?\n/)) {
    if (regel.startsWith('v ')) {
      posities.push(regel.trim().split(/\s+/).slice(1, 4).map(Number));
    } else if (regel.startsWith('vn ')) {
      normalen.push(regel.trim().split(/\s+/).slice(1, 4).map(Number));
    } else if (regel.startsWith('usemtl ')) {
      materiaal = regel.slice(7).trim();
    } else if (regel.startsWith('f ')) {
      const hoeken = regel.trim().split(/\s+/).slice(1);
      if (hoeken.length !== 3) {
        throw new Error(`${pad}: vlak met ${hoeken.length} hoekpunten, alleen driehoeken worden ondersteund`);
      }
      if (materiaal === null) throw new Error(`${pad}: vlak vóór de eerste usemtl`);
      // "v/vt/vn", 1-gebaseerd; negatieve indexen komen in deze pack niet voor.
      const ontleed = hoeken.map((h) => h.split('/').map((d) => (d === '' ? null : Number(d))));
      driehoeken.push({
        v: ontleed.map((d) => d[0] - 1),
        n: ontleed.map((d) => (d[2] ? d[2] - 1 : null)),
        mtl: materiaal,
      });
    }
  }
  if (driehoeken.length === 0) throw new Error(`geen driehoeken in ${pad}`);
  return { posities, normalen, driehoeken };
}

/* -- kleur → UV ----------------------------------------------------------- */

/** Het punt op de doel-atlas dat het dichtst bij een kleur ligt. */
function dichtstbij(kleur, punten) {
  let beste = punten[0];
  let besteAfstand = Infinity;
  for (const punt of punten) {
    const afstand = kleurAfstand(kleur, punt.kleur);
    if (afstand < besteAfstand) {
      besteAfstand = afstand;
      beste = punt;
    }
  }
  return { punt: beste, afstand: besteAfstand };
}

/* -- .glb schrijven ------------------------------------------------------- */

/**
 * Bouwt een .glb uit de driehoeken van één model.
 *
 * Hoekpunten worden ontdubbeld op de combinatie positie/normaal/UV: een .obj
 * deelt zijn `v`-indexen over materiaalgrenzen heen, en twee driehoeken van
 * verschillende kleur mogen niet hetzelfde hoekpunt delen — dan zou de kleur
 * over de naad heen lopen. Dezelfde combinatie hergebruiken doen we wél, zodat
 * een plat vlak niet meer hoekpunten kost dan nodig.
 *
 * Alles komt in één primitive terecht: elk model draagt maar één materiaal (de
 * gedeelde colormap), dus meer primitives zouden alleen meer tekenopdrachten
 * opleveren zonder dat er iets te scheiden valt.
 */
function bouwGlb({ posities, normalen, driehoeken }, uvPerMateriaal, naam) {
  const index = new Map();
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];

  for (const driehoek of driehoeken) {
    const [u, v] = uvPerMateriaal.get(driehoek.mtl);
    for (let k = 0; k < 3; k++) {
      const p = posities[driehoek.v[k]];
      const n = driehoek.n[k] === null ? [0, 1, 0] : normalen[driehoek.n[k]];
      const sleutel = `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}|${u},${v}`;
      let i = index.get(sleutel);
      if (i === undefined) {
        i = pos.length / 3;
        index.set(sleutel, i);
        pos.push(p[0], p[1], p[2]);
        nrm.push(n[0], n[1], n[2]);
        uvs.push(u, v);
      }
      idx.push(i);
    }
  }

  const aantal = pos.length / 3;
  // Onder de 65536 hoekpunten past een index in twee bytes; dat scheelt de
  // helft. Het grootste model van de pack heeft er ruim 4000, dus in de
  // praktijk is dit altijd de korte variant — de andere tak staat er voor als
  // er ooit een groter model bij komt.
  const kort = aantal < 65536;

  const posBuf = Buffer.alloc(aantal * 12);
  const nrmBuf = Buffer.alloc(aantal * 12);
  const uvBuf = Buffer.alloc(aantal * 8);
  for (let i = 0; i < aantal; i++) {
    for (let k = 0; k < 3; k++) {
      posBuf.writeFloatLE(pos[i * 3 + k], i * 12 + k * 4);
      nrmBuf.writeFloatLE(nrm[i * 3 + k], i * 12 + k * 4);
    }
    uvBuf.writeFloatLE(uvs[i * 2], i * 8);
    uvBuf.writeFloatLE(uvs[i * 2 + 1], i * 8 + 4);
  }
  const idxBuf = Buffer.alloc(idx.length * (kort ? 2 : 4));
  idx.forEach((waarde, i) => {
    if (kort) idxBuf.writeUInt16LE(waarde, i * 2);
    else idxBuf.writeUInt32LE(waarde, i * 4);
  });

  // De spec wil dat elke bufferView op een veelvoud van zijn componentgrootte
  // begint; met vier bytes per float en twee per index is uitvullen op vier
  // altijd genoeg.
  const delen = [posBuf, nrmBuf, uvBuf, idxBuf];
  const offsets = [];
  let lengte = 0;
  for (const deel of delen) {
    lengte += (4 - (lengte % 4)) % 4;
    offsets.push(lengte);
    lengte += deel.length;
  }
  const bin = Buffer.alloc(lengte);
  delen.forEach((deel, i) => deel.copy(bin, offsets[i]));

  const minMax = (bron, breedte) => {
    const min = new Array(breedte).fill(Infinity);
    const max = new Array(breedte).fill(-Infinity);
    for (let i = 0; i < bron.length; i++) {
      const as = i % breedte;
      if (bron[i] < min[as]) min[as] = bron[i];
      if (bron[i] > max[as]) max[as] = bron[i];
    }
    return { min, max };
  };
  const grens = minMax(pos, 3);

  const json = {
    asset: {
      generator: 'tools/importeer-village.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal: SCHAAL,
          tangenten: 'gestript',
          palet: 1,
          bron: 'Modular Village',
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [1] }],
    // De wortel draagt alleen de naam en de schaal: geen verschuiving, want de
    // oorsprong van de pack blijft staan (zie de kop van dit bestand).
    nodes: [
      { name: naam, mesh: 0 },
      { name: naam, scale: [SCHAAL, SCHAAL, SCHAAL], children: [0] },
    ],
    meshes: [{
      name: naam,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: aantal, type: 'VEC3', min: grens.min, max: grens.max },
      { bufferView: 1, componentType: 5126, count: aantal, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: aantal, type: 'VEC2' },
      { bufferView: 3, componentType: kort ? 5123 : 5125, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: nrmBuf.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: uvBuf.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[3], byteLength: idxBuf.length, target: 34963 },
    ],
    buffers: [{ byteLength: lengte }],
    // De standaarden uit stijlgids §1: geen metaal, volle ruwheid (de
    // standaardwaarde van de spec, dus die schrijven we niet op) en
    // ondoorzichtig.
    materials: [{
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
      doubleSided: true,
      name: 'colormap',
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
  };

  return { json, bin };
}

/* -- draaien -------------------------------------------------------------- */

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-village.mjs <map-met-obj-en-mtl>');
  process.exit(1);
}

/* De gedeelde colormap bijwerken, vóór doelPunten(): de nieuwe banen moeten
 * meedoen als doel. */
const doelAtlas = leesPng(COLORMAP);
for (const nieuw of NIEUWE_CELLEN) {
  const stond = gevuldeCellen(doelAtlas).some(([k, r]) => k === nieuw.cel[0] && r === nieuw.cel[1]);
  voegGradientCelToe(doelAtlas, nieuw.cel, nieuw.boven, nieuw.onder);
  console.log(
    `${stond ? 'bijgewerkt' : 'toegevoegd'}: cel [${nieuw.cel}] ${nieuw.naam} ` +
    `${naarHex(...nieuw.boven)} → ${naarHex(...nieuw.onder)} in kits/colormap.png`,
  );
}
schrijfPng(COLORMAP, doelAtlas);

const punten = doelPunten(doelAtlas);

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

const aanwezig = new Set(
  readdirSync(bronMap).filter((n) => n.endsWith('.obj')).map((n) => n.replace(/\.obj$/, '')),
);
const ontbreekt = Object.keys(NAMEN).filter((n) => !aanwezig.has(n));
if (ontbreekt.length) throw new Error(`niet gevonden in ${bronMap}: ${ontbreekt.join(', ')}`);
const overgeslagen = [...aanwezig].filter((n) => !NAMEN[n]).sort();

/* De materialen één keer omzetten: de hele pack deelt één .mtl, dus dezelfde
 * kleur hoeft niet 155 keer opgezocht te worden — en zo staat ook vast dat
 * hetzelfde materiaal in elk model op dezelfde cel uitkomt. */
const mtl = leesMtl(join(bronMap, BRON_MTL));
const uvPerMateriaal = new Map();
const omgezet = new Map();
for (const [naam, kleur] of mtl) {
  const { punt, afstand } = dichtstbij(kleur, punten);
  uvPerMateriaal.set(naam, [punt.u, punt.v]);
  omgezet.set(naam, { van: naarHex(...kleur), naar: naarHex(...punt.kleur), cel: punt.cel, afstand, aantal: 0 });
}

console.log();
for (const [naam, k] of [...omgezet].sort((a, b) => b[1].afstand - a[1].afstand)) {
  const nieuw = NIEUWE_CELLEN.some((n) => n.cel[0] === k.cel[0] && n.cel[1] === k.cel[1]);
  console.log(
    `${naam.padEnd(24)} ${k.van} → ${k.naar} cel [${String(k.cel).padEnd(5)}] ` +
    `afstand ${String(k.afstand.toFixed(0)).padStart(3)}${nieuw ? '  (nieuwe cel)' : ''}`,
  );
}
console.log();

let totaalDriehoeken = 0;
for (const [bron, naam] of Object.entries(NAMEN)) {
  const obj = leesObj(join(bronMap, `${bron}.obj`));
  for (const driehoek of obj.driehoeken) {
    const k = omgezet.get(driehoek.mtl);
    if (!k) throw new Error(`${bron}: materiaal '${driehoek.mtl}' staat niet in ${BRON_MTL}`);
    k.aantal++;
  }

  const glb = bouwGlb(obj, uvPerMateriaal, naam);
  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  totaalDriehoeken += na.driehoeken;
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(5)).join(' × ');
  const voet = na.min[1] < -0.001 ? ` voet ${na.min[1].toFixed(2)}` : '';
  console.log(
    `${bron.padEnd(37)} → ${naam.padEnd(33)} ${maat(na)}  ` +
    `${String(na.driehoeken).padStart(4)} tri${voet}`,
  );

  /* Stijlgids §4: maximaal 1000 driehoeken per 1×1×1 unit. Gemeten als
   * grondvlak × hoogte, allebei op minimaal 1 afgerond: een vloertegel van
   * 2 × 2 × 0,23 beslaat vier vakken van het raster en niet 0,92 kubieke unit,
   * en een emmer die kleiner is dan één vak krijgt geen korting omdat hij
   * klein is. */
  const eenheden = Math.max(1, na.wdh[0] * na.wdh[1]) * Math.max(1, na.wdh[2]);
  if (na.driehoeken / eenheden > 1000) {
    console.warn(`  ! ${naam}: ${Math.round(na.driehoeken / eenheden)} driehoeken per unit³`);
  }
}

/* Elke kit wijst met een relatief pad naar zijn eigen kopie van de atlas, dus
 * de nieuwe cellen moeten overal terechtkomen — anders ziet dezelfde kleur er
 * per kit anders uit. */
const bijgewerkt = kopieerColormap(KITS);

console.log();
if (overgeslagen.length) console.log(`niet ingeladen: ${overgeslagen.join(', ')}`);
console.log(`colormap gekopieerd naar: ${bijgewerkt.join(', ')}`);
console.log(`${Object.keys(NAMEN).length} modellen → kits/village-kit/  (${totaalDriehoeken} driehoeken)`);
