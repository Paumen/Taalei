#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FLOAT = 5126;

const HELP = `ground.mjs <kit>/<model>
  Moves every vertex of kits/workfiles/<kit>/<model>.glb down or up so the lowest one
  sits on y=0, for a model left hanging in the air after a part came off.`;

const [id] = process.argv.slice(2);
if (!id) {
  console.log(HELP);
  process.exit(1);
}

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;
const bin = Buffer.from(glb.bin);
if (json.animations?.length || json.skins?.length) throw new Error(`${id}: animated or skinned models are not touched`);

const targets = [];
let floor = Infinity;
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const index = prim.attributes?.POSITION;
    if (index === undefined) continue;
    const accessor = json.accessors[index];
    if (accessor.componentType !== FLOAT || accessor.type !== 'VEC3') {
      throw new Error(`${id}: POSITION accessor ${index} is not float VEC3`);
    }
    const view = json.bufferViews[accessor.bufferView];
    const target = {
      accessor,
      start: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
      step: view.byteStride ?? 12,
      count: accessor.count,
    };
    if (targets.some((t) => t.start === target.start)) continue;
    targets.push(target);
    const { data } = readAccessor(glb, index);
    for (let i = 0; i < accessor.count; i++) floor = Math.min(floor, data[i * 3 + 1]);
  }
}
if (!Number.isFinite(floor)) throw new Error(`${id}: no position to measure`);
if (Math.abs(floor) < 1e-6) throw new Error(`${id}: already stands on y=0`);

for (const target of targets) {
  for (let i = 0; i < target.count; i++) {
    const at = target.start + i * target.step + 4;
    bin.writeFloatLE(Math.fround(bin.readFloatLE(at) - floor), at);
  }
  if (target.accessor.min) target.accessor.min[1] -= floor;
  if (target.accessor.max) target.accessor.max[1] -= floor;
}

writeGlb(path, json, bin, writeFileSync);
console.log(`${id}: moved ${floor > 0 ? 'down' : 'up'} ${Math.abs(floor).toFixed(4)} onto y=0`);
