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
  ['food_ingredient_ham',            'food-ingredient-ham'],
  ['food_ingredient_ham_cooked',     'food-ingredient-ham-cooked'],
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
];

await importeerKit({
  slug: 'restaurant',
  bron: 'KayKit Restaurant Bits',
  generator: 'tools/importeer-restaurant.mjs',
  schaal: 0.245,
  formaat: 'gltf',
  bronDir: process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })(),
  modellen: MODELLEN,
});
