import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['Boat',        'boat'],
  ['BoatWSail',   'boat-sail'],
  ['CruiseShip',  'ship-cruise'],
  ['Lifeboat',    'boat-life'],
  ['Sail ship',   'ship-sail'],
  ['Viking boat', 'boat-viking'],
];

await importeerKit({
  slug: 'ships-quaternius',
  bron: 'Ships Pack',
  generator: 'tools/importeer-ships-quaternius.mjs',
  schaal: 0.52,
  formaat: 'obj',
  bronDir: process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })(),
  modellen: MODELLEN,
});
