// KayKit Adventurers: de zes personages plus de losse uitrusting.
//
//   node tools/importeer-adventurers.mjs <pack-map> <animatiepack-map>
//
// De uitrusting gaat door de gewone weg — bouwGlb plet ze tot één statische
// primitief. De personages kunnen dat niet: die hebben een skelet, en zonder skin
// blijft er van een figuur niets over. Ze houden dus hun eigen opbouw en krijgen
// alleen de kleuren van de gedeelde colormap.
//
// De personages komen zelf zonder animatie: ze staan in T-houding. De clips staan
// los, in KayKit Character Animations 1.1: acht bestanden voor het middelgrote
// skelet, samen 132 clips op dezelfde 23 botten met dezelfde namen, dus ze verhuizen
// op naam naar elk personage. De twee rig-bestanden die in dit pack zelf meekomen
// zijn byte voor byte dezelfde als twee van die acht — het animatiepakket is de
// volledige verzameling en is hier de enige bron.
//
// Twee helften, één kitmap: importeerKit wist eerst elke .glb daarin, dus draait
// die eerst en gaan de personages daarna. Dit script bouwt de personages altijd
// opnieuw, ook met --alleen (dat gaat alleen over de uitrusting).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { importeerKit } from './importeer/kit.mjs';
import { schrijfModel, zetColormapKlaar } from './importeer/bouw.mjs';
import { herkleurGeanimeerd, leesBron, voegAnimatiesToe } from './importeer/geanimeerd.mjs';

const BRON = 'KayKit Adventurers';
const GENERATOR = 'tools/importeer-adventurers.mjs';
// Dezelfde maatstaf als de KayKit Dungeon: beide staan op het raster van 4 eenheden
// per tegel, en de personages zijn voor die kamers gemaakt. Een figuur wordt zo
// 0,42 hoog — naast de stoel (0,21) en de piratenbemanning (0,35–0,42).
const SCHAAL = 0.175;

const UITRUSTING = [
  ['arrow_bow',              'arrow-bow'],
  ['arrow_bow_bundle',       'arrow-bow-bundle'],
  ['arrow_crossbow',         'arrow-crossbow'],
  ['arrow_crossbow_bundle',  'arrow-crossbow-bundle'],
  ['axe_1handed',            'axe-one-handed'],
  ['axe_2handed',            'axe-two-handed'],
  ['bow',                    'bow'],
  ['bow_withString',         'bow-strung'],
  ['crossbow_1handed',       'crossbow-one-handed'],
  ['crossbow_2handed',       'crossbow-two-handed'],
  ['dagger',                 'dagger'],
  ['mug_empty',              'mug-empty'],
  ['mug_full',               'mug-full'],
  ['quiver',                 'quiver'],
  ['shield_badge',           'shield-badge'],
  ['shield_badge_color',     'shield-badge-colored'],
  ['shield_round',           'shield-round'],
  ['shield_round_barbarian', 'shield-round-barbarian'],
  ['shield_round_color',     'shield-round-colored'],
  ['shield_spikes',          'shield-spikes'],
  ['shield_spikes_color',    'shield-spikes-colored'],
  ['shield_square',          'shield-square'],
  ['shield_square_color',    'shield-square-colored'],
  ['smokebomb',              'smokebomb'],
  ['spellbook_closed',       'spellbook-closed'],
  ['spellbook_open',         'spellbook-open'],
  ['staff',                  'staff'],
  ['sword_1handed',          'sword-one-handed'],
  ['sword_2handed',          'sword-two-handed'],
  ['sword_2handed_color',    'sword-two-handed-colored'],
  ['wand',                   'wand'],
];

const PERSONAGES = [
  ['Barbarian',    'barbarian'],
  ['Knight',       'knight'],
  ['Mage',         'mage'],
  ['Ranger',       'ranger'],
  ['Rogue',        'rogue'],
  ['Rogue_Hooded', 'rogue-hooded'],
];

const packDir = process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })();
const animatieDir = process.argv[3] ?? (() => { throw new Error('provide the path to the unpacked KayKit Character Animations pack'); })();
const kitDir = 'kits/workfiles/adventurers';

await importeerKit({
  slug: 'adventurers',
  bron: BRON,
  generator: GENERATOR,
  schaal: SCHAAL,
  formaat: 'gltf',
  bronDir: join(packDir, 'Assets', 'gltf'),
  modellen: UITRUSTING,
});

zetColormapKlaar(kitDir);
// Alle Rig_Medium-bestanden van het animatiepakket: elk bestand is een groep clips
// (algemeen, lopen, gevecht, gereedschap, en voor de skeletten de bijzondere) en de
// volgorde van de bestanden is de volgorde waarin ze in het model komen te staan.
const rigDir = join(animatieDir, 'Animations', 'gltf', 'Rig_Medium');
const rigs = readdirSync(rigDir).filter((naam) => naam.endsWith('.glb')).sort()
  .map((naam) => leesBron(join(rigDir, naam)));

for (const [bronNaam, naam] of PERSONAGES) {
  const glb = voegAnimatiesToe(leesBron(join(packDir, 'Characters', 'gltf', `${bronNaam}.glb`)), rigs);
  const { json, bin, driehoeken } = herkleurGeanimeerd(glb, {
    naam, schaal: SCHAAL, bron: BRON, bronNaam, generator: GENERATOR,
  });
  schrijfModel(join(kitDir, `${naam}.glb`), { json, bin });
  console.log(`  ${naam.padEnd(14)} ${driehoeken} tri, ${json.animations.length} animaties, ${json.skins.length} skin`);
}
