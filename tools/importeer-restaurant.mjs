// Laadt 26 modellen uit "KayKit Restaurant Bits" in als kits/workfiles/restaurant.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-restaurant.mjs <pack>/Assets/gltf
//
// Wat er gebeurt en waarom staat in kits/workfiles/restaurant/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['bowl',                           'bowl'],
  ['bowl_small',                     'bowl-small'],
  ['chair_B',                        'chair-b'],
  ['crate',                          'crate'],
  ['crate_ham',                      'crate-ham'],
  ['crate_lid',                      'crate-lid'],
  ['crate_steak',                    'crate-steak'],
  ['cuttingboard',                   'cutting-board'],
  ['food_dinner',                    'food-dinner'],
  ['food_ingredient_cheese',         'food-ingredient-cheese'],
  ['food_ingredient_cheese_chopped', 'food-ingredient-cheese-chopped'],
  ['food_ingredient_ham',            'food-ingredient-ham'],
  ['food_ingredient_ham_cooked',     'food-ingredient-ham-cooked'],
  ['food_ingredient_ham_trash',      'food-ingredient-ham-trash'],
  ['food_ingredient_steak',          'food-ingredient-steak'],
  ['food_stew',                      'food-stew'],
  ['knife',                          'knife'],
  ['pan_006',                        'pan-006'],
  ['pan_A',                          'pan-a'],
  ['pan_B',                          'pan-b'],
  ['plate',                          'plate'],
  ['plate_small',                    'plate-small'],
  ['pot_A',                          'pot-a'],
  ['pot_B',                          'pot-b'],
  ['pot_large',                      'pot-large'],
  ['table_round_B',                  'table-round-b'],
];

await importeerKit({
  slug: 'restaurant',
  bron: 'KayKit Restaurant Bits',
  generator: 'tools/importeer-restaurant.mjs',
  schaal: 0.35,
  formaat: 'gltf',
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
