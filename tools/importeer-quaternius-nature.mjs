// Laadt 60 modellen uit "Ultimate Nature Pack" in als kits/workfiles/quaternius-nature.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-quaternius-nature.mjs <pack>/OBJ
//
// Wat er gebeurt en waarom staat in kits/workfiles/quaternius-nature/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['BirchTree_Dead_1',       'tree-birch-dead-1'],
  ['BirchTree_Dead_2',       'tree-birch-dead-2'],
  ['BirchTree_Dead_3',       'tree-birch-dead-3'],
  ['BirchTree_Dead_4',       'tree-birch-dead-4'],
  ['BirchTree_Dead_5',       'tree-birch-dead-5'],
  ['CactusFlower_1',         'cactus-flower-1'],
  ['CactusFlowers_2',        'cactus-flower-2'],
  ['CactusFlowers_3',        'cactus-flower-3'],
  ['CactusFlowers_4',        'cactus-flower-4'],
  ['CactusFlowers_5',        'cactus-flower-5'],
  ['Cactus_1',               'cactus-1'],
  ['Cactus_2',               'cactus-2'],
  ['Cactus_3',               'cactus-3'],
  ['Cactus_4',               'cactus-4'],
  ['Cactus_5',               'cactus-5'],
  ['CommonTree_Dead_1',      'tree-common-dead-1'],
  ['CommonTree_Dead_2',      'tree-common-dead-2'],
  ['CommonTree_Dead_3',      'tree-common-dead-3'],
  ['CommonTree_Dead_4',      'tree-common-dead-4'],
  ['CommonTree_Dead_5',      'tree-common-dead-5'],
  ['Corn_1',                 'corn-1'],
  ['Corn_2',                 'corn-2'],
  ['Grass',                  'grass'],
  ['Grass_2',                'grass-2'],
  ['Grass_Short',            'grass-short'],
  ['Lilypad',                'lilypad'],
  ['PineTree_1',             'tree-pine-1'],
  ['PineTree_3',             'tree-pine-3'],
  ['Plant_1',                'plant-1'],
  ['Plant_2',                'plant-2'],
  ['Plant_3',                'plant-3'],
  ['Plant_4',                'plant-4'],
  ['Plant_5',                'plant-5'],
  ['Rock_1',                 'rock-1'],
  ['Rock_2',                 'rock-2'],
  ['Rock_3',                 'rock-3'],
  ['Rock_4',                 'rock-4'],
  ['Rock_5',                 'rock-5'],
  ['Rock_6',                 'rock-6'],
  ['Rock_7',                 'rock-7'],
  ['TreeStump',              'tree-stump'],
  ['TreeStump_Moss',         'tree-stump-moss'],
  ['Wheat',                  'wheat'],
  ['Willow_Dead_1',          'tree-willow-dead-1'],
  ['Willow_Dead_2',          'tree-willow-dead-2'],
  ['Willow_Dead_3',          'tree-willow-dead-3'],
  ['Willow_Dead_4',          'tree-willow-dead-4'],
  ['Willow_Dead_5',          'tree-willow-dead-5'],
  ['WoodLog',                'log'],
  ['WoodLog_Moss',           'log-moss'],
];

await importeerKit({
  slug: 'quaternius-nature',
  bron: 'Ultimate Nature Pack',
  generator: 'tools/importeer-quaternius-nature.mjs',
  schaal: 0.4,
  formaat: 'obj',
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
