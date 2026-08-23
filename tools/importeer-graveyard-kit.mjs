// Laadt 8 modellen uit "Kenney Graveyard Kit" in als kits/workfiles/graveyard-kit.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-graveyard-kit.mjs <pack>/Models/GLB format
//
// Wat er gebeurt en waarom staat in kits/workfiles/graveyard-kit/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['debris-wood',    'debris-wood'],
  ['debris',         'debris'],
  ['pine-fall',      'pine-fall'],
  ['pine',           'pine'],
  ['rocks-tall',     'rocks-tall'],
  ['rocks',          'rocks'],
  ['shovel-dirt',    'shovel-dirt'],
  ['shovel',         'shovel'],
];

await importeerKit({
  slug: 'graveyard-kit',
  bron: 'Kenney Graveyard Kit',
  generator: 'tools/importeer-graveyard-kit.mjs',
  schaal: 1,
  formaat: 'gltf',
  bestand: (naam) => `${naam}.glb`,
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
