// Laadt 3 modellen uit "Kenney Prototype Kit" in als kits/workfiles/prototype-kit.
//
// Aanroepen met het pad naar de uitgepakte pack:
//   node tools/importeer-prototype-kit.mjs <pack>/Models/GLB format
//
// Wat er gebeurt en waarom staat in kits/workfiles/prototype-kit/LICENSE.txt.

import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['coin',         'coin'],
  ['lever-double', 'lever-double'],
  ['lever-single', 'lever-single'],
];

await importeerKit({
  slug: 'prototype-kit',
  bron: 'Kenney Prototype Kit',
  generator: 'tools/importeer-prototype-kit.mjs',
  schaal: 1,
  formaat: 'gltf',
  bestand: (naam) => `${naam}.glb`,
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
