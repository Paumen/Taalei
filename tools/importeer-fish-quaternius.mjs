import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['Dolphin',   'dolphin'],
  ['Fish1',     'fish-1'],
  ['Fish2',     'fish-2'],
  ['Fish3',     'fish-3'],
  ['Manta ray', 'manta-ray'],
  ['Shark',     'shark'],
  ['Whale',     'whale'],
];

await importeerKit({
  slug: 'fish-quaternius',
  bron: 'Animated Fish Pack',
  generator: 'tools/importeer-fish-quaternius.mjs',
  schaal: 0.11,
  formaat: 'obj',
  bronDir: process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })(),
  modellen: MODELLEN,
});
