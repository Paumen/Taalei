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
  schaal: 0.65,
  formaat: 'gltf',
  bestand: (naam) => `${naam}.glb`,
  bronDir: process.argv[2] ?? (() => { throw new Error('geef het pad naar de uitgepakte pack'); })(),
  modellen: MODELLEN,
});
