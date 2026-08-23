// Laadt 11 modellen uit "Kenney Castle Kit" in als kits/workfiles/castle-kit.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-castle-kit.mjs <pack>/Models/GLB format
//
// Wat er gebeurt en waarom staat in kits/workfiles/castle-kit/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['flag-pennant',                 'flag-pennant'],
  ['flag-wide',                    'flag-wide'],
  ['flag',                         'flag'],
  ['rocks-large',                  'rocks-large'],
  ['rocks-small',                  'rocks-small'],
  ['tower-square-mid-open-simple', 'tower-square-mid-open-simple'],
  ['tower-square-mid-open',        'tower-square-mid-open'],
  ['tree-large',                   'tree-large'],
  ['tree-log',                     'tree-log'],
  ['tree-small',                   'tree-small'],
  ['tree-trunk',                   'tree-trunk'],
];

await importeerKit({
  slug: 'castle-kit',
  bron: 'Kenney Castle Kit',
  generator: 'tools/importeer-castle-kit.mjs',
  schaal: 1,
  formaat: 'gltf',
  bestand: (naam) => `${naam}.glb`,
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
