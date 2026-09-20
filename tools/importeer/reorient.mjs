#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, measureScene } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const HELP = `reorient.mjs <kit>/<model> <turns> [...]
  Turns the root node of kits/workfiles/<kit>/<model>.glb, then puts the model back
  where it stood: a grounded, centred model is grounded and centred again, any other
  keeps the footprint centre and the lowest point it had.

  <turns> is one or more axis-angle steps separated by a comma, applied left to
  right around the world axes: x90, y-90, z180, x90,y90.`;

const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function parseTurns(spec) {
  return spec.split(',').map((step) => {
    const match = /^([xyz])(-?\d+(?:\.\d+)?)$/.exec(step.trim());
    if (!match) throw new Error(`cannot read turn "${step}"`);
    const [axis, degrees] = [AXES[match[1]], Number(match[2]) * Math.PI / 180];
    const s = Math.sin(degrees / 2);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(degrees / 2)];
  });
}

function multiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

const round = (v) => (Math.abs(v) < 1e-7 ? 0 : Math.fround(v));
const place = (glb) => {
  const { min, max } = measureScene(glb);
  return [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
};

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.log(HELP);
  process.exit(1);
}

for (let i = 0; i < args.length; i += 2) {
  const [id, spec] = [args[i], args[i + 1]];
  const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
  const glb = readGlb(path);
  const { json } = glb;

  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (roots.length !== 1) throw new Error(`${id}: wants one root node, found ${roots.length}`);
  const root = json.nodes[roots[0]];
  if (root.matrix) throw new Error(`${id}: root node carries a matrix`);
  if ((json.animations ?? []).some((a) => a.channels.some((c) => c.target.node === roots[0]))) {
    throw new Error(`${id}: an animation drives the root node`);
  }
  if ((json.skins ?? []).some((s) => (s.joints ?? []).includes(roots[0]))) {
    throw new Error(`${id}: the root node is a skin joint`);
  }

  const before = place(glb);
  const grounded = Math.abs(before[0]) < 0.02 && Math.abs(before[1]) < 0.02 && Math.abs(before[2]) < 0.02;

  let rotation = root.rotation ?? [0, 0, 0, 1];
  for (const turn of parseTurns(spec)) rotation = multiply(turn, rotation);
  root.rotation = rotation.map(round);

  const target = grounded ? [0, 0, 0] : before;
  const after = place(glb);
  const moved = (root.translation ?? [0, 0, 0]).map((v, a) => round(v + target[a] - after[a]));
  if (moved.every((v) => v === 0)) delete root.translation;
  else root.translation = moved;

  writeGlb(path, json, Buffer.from(glb.bin), writeFileSync);
  const { min, max } = measureScene(glb);
  console.log(`${id}: turned ${spec}, now ${[0, 1, 2].map((a) => (max[a] - min[a]).toFixed(2)).join(' x ')}`);
}
