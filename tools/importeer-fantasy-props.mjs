// Laadt 37 modellen uit "Fantasy Props MegaKit" in als kits/workfiles/fantasy-props.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-fantasy-props.mjs <pack>/FantasyProps_glTF_1k
//
// Wat er gebeurt en waarom staat in kits/workfiles/fantasy-props/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['Bag',                    'bag'],
  ['Barrel',                 'barrel'],
  ['Barrel_Apples',          'barrel-apples'],
  ['Barrel_Holder',          'barrel-holder'],
  ['Bench',                  'bench'],
  ['BookGroup_Medium_1',     'book-group-medium-1'],
  ['BookGroup_Medium_2',     'book-group-medium-2'],
  ['BookGroup_Medium_3',     'book-group-medium-3'],
  ['BookGroup_Small_1',      'book-group-small-1'],
  ['BookGroup_Small_2',      'book-group-small-2'],
  ['BookGroup_Small_3',      'book-group-small-3'],
  ['Book_5',                 'book-5'],
  ['Book_7',                 'book-7'],
  ['Book_Simplified_Single', 'book-simplified-single'],
  ['Book_Stack_1',           'book-stack-1'],
  ['Book_Stack_2',           'book-stack-2'],
  ['Bottle_1',               'bottle-1'],
  ['Bucket_Wooden_1',        'bucket-wooden-1'],
  ['Cage_Small',             'cage-small'],
  ['Candle_1',               'candle-1'],
  ['Candle_2',               'candle-2'],
  ['Crate_Metal',            'crate-metal'],
  ['Crate_Wooden',           'crate-wooden'],
  ['Key_Gold',               'key-gold'],
  ['Key_Metal',              'key-metal'],
  ['Mug',                    'mug'],
  ['Pickaxe_Bronze',         'pickaxe-bronze'],
  ['Potion_2',               'potion-2'],
  ['Potion_4',               'potion-4'],
  ['Scroll_1',               'scroll-1'],
  ['Scroll_2',               'scroll-2'],
  ['Shelf_Simple',           'shelf-simple'],
  ['Table_Plate',            'table-plate'],
  ['Torch_Metal',            'torch-metal'],
  ['Vase_2',                 'vase-2'],
  ['Vase_4',                 'vase-4'],
];

await importeerKit({
  slug: 'fantasy-props',
  bron: 'Fantasy Props MegaKit',
  generator: 'tools/importeer-fantasy-props.mjs',
  schaal: 0.5,
  formaat: 'gltf',
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
