import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { leerBanden } from './leerbanden.mjs';

const USAGE = `learn-bands <pack|kit> [model...] [--raster CxR] [--per-model]

  Reads the kit's adopted workfiles back against their source models and prints,
  per source cell or source colour, the bands they were recoloured onto. Run this
  before writing an import spec: it is the kit's own answer, not a guess.

  <pack|kit>    a BRONKITS folder name or a kit slug
  model...      source model names; without any, the whole pack is learned
  --raster CxR  the source atlas grid, for a pack whose texture is a band grid
                (KayKit 8x4, Kenney 16x4, Tiny Treats 8x8). Without it the source
                colour is sampled from the texture instead.
  --per-model   one line per model rather than one table for the pack
`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(USAGE);
  process.exit(args.length ? 0 : 1);
}

let raster = null;
const perModel = args.includes('--per-model');
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--per-model') continue;
  if (args[i] === '--raster') {
    const match = /^(\d+)x(\d+)$/.exec(args[++i] ?? '');
    if (!match) throw new Error('--raster wants CxR, for example 8x4');
    raster = [Number(match[1]), Number(match[2])];
    continue;
  }
  names.push(args[i]);
}

const [target, ...wanted] = names;
const source = BRONKITS.find((b) => b.map === target || b.kit === target);
if (!source) throw new Error(`${target}: no such pack or kit in bronkits.mjs`);
if (!source.kit) throw new Error(`${source.map}: not adopted yet, so there is nothing to learn from`);

const { modellen, uitgepakt } = bronModellen(source);
const byName = new Map(modellen.map((m) => [m.naam, m]));

const missing = wanted.filter((n) => !byName.has(n));
for (const n of missing) console.log(`MISSING ${n}`);
const chosen = wanted.length ? wanted.filter((n) => byName.has(n)).map((n) => byName.get(n)) : modellen;

const format = (counts) =>
  [...counts].sort((a, b) => b[1] - a[1]).map(([band, n]) => `${band}:${n}`).join('/');

console.log(`\n${source.map} → ${source.kit}   raster ${raster ? raster.join('x') : '—'}`);

if (perModel || wanted.length) {
  for (const model of chosen) {
    const { tabel } = leerBanden(source, [model], uitgepakt, raster);
    const rows = [...tabel].map(([key, counts]) => `${key}→${format(counts)}`);
    console.log(`  ${model.naam.padEnd(34)} ${rows.join('   ') || '(no adopted workfile)'}`);
  }
} else {
  const { tabel, uit } = leerBanden(source, chosen, uitgepakt, raster);
  const total = (counts) => [...counts.values()].reduce((sum, n) => sum + n, 0);
  const rows = [...tabel].sort((a, b) => total(b[1]) - total(a[1]));
  console.log(`  learned from ${uit} workfile(s)\n`);
  for (const [key, counts] of rows) console.log(`  ${key.padEnd(10)} ${format(counts)}`);
  if (!rows.length) console.log('  nothing matched — check the raster');
}
