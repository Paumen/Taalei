import { importeerKit } from './importeer/kit.mjs';

const MODELLEN = [
  ['Arch',                   'arch'],
  ['Arch_Door',              'arch-door'],
  ['Bucket',                 'bucket'],
  ['Cobweb',                 'cobweb'],
  ['Cobweb2',                'cobweb-2'],
  ['Column',                 'column'],
  ['Floor_BricksSeparate',   'floor-bricks-separate'],
  ['Floor_Modular',          'floor-modular'],
  ['Skull',                  'skull'],
  ['Stairs_Modular',         'stairs-modular'],
  ['Stairs_SideCover',       'stairs-side-cover'],
  ['Stairs_SideCoverWall',   'stairs-side-cover-wall'],
  ['WallCover_Modular',      'wall-cover-modular'],
  ['Wall_Modular',           'wall-modular'],
];

await importeerKit({
  slug: 'dungeon-quaternius',
  bron: 'Modular Dungeons Pack',
  generator: 'tools/importeer-dungeon-quaternius.mjs',
  schaal: 0.35,
  formaat: 'obj',
  bronDir: process.argv[2] ?? (() => { throw new Error('provide the path to the unpacked pack'); })(),
  modellen: MODELLEN,
});
