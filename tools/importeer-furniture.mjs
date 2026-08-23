// Laadt 11 modellen uit "KayKit Furniture Bits" in als kits/workfiles/furniture.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-furniture.mjs <pack>/Assets/gltf
//
// Wat er gebeurt en waarom staat in kits/workfiles/furniture/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['book_set',                'book-set'],
  ['book_single',             'book-single'],
  ['shelf_A_big',             'shelf-a-big'],
  ['shelf_A_small',           'shelf-a-small'],
  ['shelf_B_large',           'shelf-b-large'],
  ['shelf_B_large_decorated', 'shelf-b-large-decorated'],
  ['shelf_B_small',           'shelf-b-small'],
  ['table_low',               'table-low'],
  ['table_medium',            'table-medium'],
  ['table_medium_long',       'table-medium-long'],
  ['table_small',             'table-small'],
];

await importeerKit({
  slug: 'furniture',
  bron: 'KayKit Furniture Bits',
  generator: 'tools/importeer-furniture.mjs',
  schaal: 0.35,
  formaat: 'gltf',
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
