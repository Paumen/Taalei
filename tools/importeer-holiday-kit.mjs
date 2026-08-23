// Laadt 15 modellen uit "Kenney Holiday Kit" in als kits/workfiles/holiday-kit.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-holiday-kit.mjs <pack>/Models/GLB format
//
// Wat er gebeurt en waarom staat in kits/workfiles/holiday-kit/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['lantern-hanging', 'lantern-hanging'],
  ['lantern',         'lantern'],
  ['rocks-large',     'rocks-large'],
  ['rocks-medium',    'rocks-medium'],
  ['rocks-small',     'rocks-small'],
  ['snow-bunker',     'snow-bunker'],
  ['snow-flat-large', 'snow-flat-large'],
  ['snow-flat',       'snow-flat'],
  ['snow-pile',       'snow-pile'],
  ['snowman-hat',     'snowman-hat'],
  ['snowman',         'snowman'],
  ['tree-snow-a',     'tree-snow-a'],
  ['tree-snow-b',     'tree-snow-b'],
  ['tree-snow-c',     'tree-snow-c'],
  ['tree',            'tree'],
];

await importeerKit({
  slug: 'holiday-kit',
  bron: 'Kenney Holiday Kit',
  generator: 'tools/importeer-holiday-kit.mjs',
  schaal: 1,
  formaat: 'gltf',
  bestand: (naam) => `${naam}.glb`,
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
