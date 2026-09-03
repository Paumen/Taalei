// KayKit Skeletons: de vier skeletten plus hun uitrusting.
//
//   node tools/importeer-skeletons.mjs <pack-map> <animatiepack-map>
//
// Zelfde tweedeling als bij de adventurers: de uitrusting gaat door bouwGlb, de
// figuren houden hun skelet en krijgen alleen de kleuren van de gedeelde colormap.
// De clips komen ook hier uit KayKit Character Animations 1.1, op hetzelfde skelet
// van 23 botten; Rig_Medium_Special daarin is voor deze figuren gemaakt (opstaan uit
// de vloer, herrijzen, spotten). Dit script bouwt de figuren altijd opnieuw, ook met
// --alleen (dat gaat alleen over de uitrusting).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { importeerKit } from './importeer/kit.mjs';
import { schrijfModel, zetColormapKlaar } from './importeer/bouw.mjs';
import { herkleurGeanimeerd, leesBron, voegAnimatiesToe } from './importeer/geanimeerd.mjs';

const BRON = 'KayKit Skeletons';
const GENERATOR = 'tools/importeer-skeletons.mjs';
// Dezelfde maatstaf als de adventurers en de KayKit Dungeon: de skeletten staan op
// hetzelfde skelet en horen naast die figuren te passen.
const SCHAAL = 0.175;

const UITRUSTING = [
  ['Skeleton_Arrow',            'arrow'],
  ['Skeleton_Arrow_Broken',     'arrow-broken'],
  ['Skeleton_Arrow_Broken_Half', 'arrow-broken-half'],
  ['Skeleton_Arrow_Half',       'arrow-half'],
  ['Skeleton_Axe',              'axe'],
  ['Skeleton_Blade',            'blade'],
  ['Skeleton_Crossbow',         'crossbow'],
  ['Skeleton_Quiver',           'quiver'],
  ['Skeleton_Shield_Large_A',   'shield-large-a'],
  ['Skeleton_Shield_Large_B',   'shield-large-b'],
  ['Skeleton_Shield_Small_A',   'shield-small-a'],
  ['Skeleton_Shield_Small_B',   'shield-small-b'],
  ['Skeleton_Staff',            'staff'],
];

const PERSONAGES = [
  ['Skeleton_Mage',    'skeleton-mage'],
  ['Skeleton_Minion',  'skeleton-minion'],
  ['Skeleton_Rogue',   'skeleton-rogue'],
  ['Skeleton_Warrior', 'skeleton-warrior'],
];

const packDir = process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })();
const animatieDir = process.argv[3] ?? (() => { throw new Error('provide the path to the unpacked KayKit Character Animations pack'); })();
const kitDir = 'kits/workfiles/skeletons';

await importeerKit({
  slug: 'skeletons',
  bron: BRON,
  generator: GENERATOR,
  schaal: SCHAAL,
  formaat: 'gltf',
  bronDir: join(packDir, 'assets', 'gltf'),
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
  const glb = voegAnimatiesToe(leesBron(join(packDir, 'characters', 'gltf', `${bronNaam}.glb`)), rigs);
  const { json, bin, driehoeken } = herkleurGeanimeerd(glb, {
    naam, schaal: SCHAAL, bron: BRON, bronNaam, generator: GENERATOR,
  });
  schrijfModel(join(kitDir, `${naam}.glb`), { json, bin });
  console.log(`  ${naam.padEnd(18)} ${driehoeken} tri, ${json.animations.length} animaties, ${json.skins.length} skin`);
}
