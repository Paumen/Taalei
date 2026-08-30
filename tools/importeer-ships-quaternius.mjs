import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['Boat',        'boat'],
  ['BoatWSail',   'boat-sail'],
  ['Sail ship',   'ship-sail'],
];

await importeerKit({
  slug: 'ships-quaternius',
  bron: 'Ships Pack',
  generator: 'tools/importeer-ships-quaternius.mjs',
  schaal: 1,
  formaat: 'obj',
  bronDir: process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })(),
  modellen: MODELLEN,
});
