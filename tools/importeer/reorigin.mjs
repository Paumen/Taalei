#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, measureScene } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOLERANCE = 0.02;

const HELP = `reorigin.mjs <kit>/<model> [...]
  Moves the root node of kits/workfiles/<kit>/<model>.glb so the lowest vertex sits
  on y=0 and the footprint centre on x=0, z=0, for a model that kept the place it
  held in the scene it was exported from.`;

const ids = process.argv.slice(2);
if (!ids.length) {
  console.log(HELP);
  process.exit(1);
}

for (const id of ids) {
  const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
  const glb = readGlb(path);
  const { json } = glb;
  if (json.animations?.length || json.skins?.length) throw new Error(`${id}: animated or skinned models are not touched`);

  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (roots.length !== 1) throw new Error(`${id}: wants one root node, found ${roots.length}`);
  const root = json.nodes[roots[0]];
  if (root.matrix) throw new Error(`${id}: root node carries a matrix`);

  const { min, max } = measureScene(glb);
  const shift = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  if (shift.every((v) => Math.abs(v) < TOLERANCE)) throw new Error(`${id}: already grounded and centred`);

  const moved = (root.translation ?? [0, 0, 0]).map((v, a) => Math.fround(v - shift[a]));
  if (moved.every((v) => Math.abs(v) < 1e-6)) delete root.translation;
  else root.translation = moved;

  writeGlb(path, json, Buffer.from(glb.bin), writeFileSync);
  console.log(`${id}: moved ${shift.map((v) => v.toFixed(3)).join(' ')} onto the origin`);
}
