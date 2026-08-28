import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['Bottle1',          'bottle-1'],
  ['Bottle2',          'bottle-2'],
  ['Bread',            'bread'],
  ['Bread_Slice',      'bread-slice'],
  ['ChickenLeg',       'chicken-leg'],
  ['Coconut',          'coconut'],
  ['Coconut_Half',     'coconut-half'],
  ['CookingPot',       'cooking-pot'],
  ['CookingPot2',      'cooking-pot-2'],
  ['Fish',             'fish'],
  ['FishBone',         'fish-bone'],
  ['Fork',             'fork'],
  ['FryingPan',        'frying-pan'],
  ['Knife',            'knife'],
  ['Lettuce_Whole',    'lettuce-whole'],
  ['Plate',            'plate'],
  ['Plate2',           'plate-2'],
  ['Spoon',            'spoon'],
  ['Steak',            'steak'],
];

await importeerKit({
  slug: 'food-quaternius',
  bron: 'Ultimate Food Pack',
  generator: 'tools/importeer-food-quaternius.mjs',
  schaal: 0.11,
  formaat: 'obj',
  bronDir: process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })(),
  modellen: MODELLEN,
});
