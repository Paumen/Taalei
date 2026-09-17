#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb } from '../../catalog/tools/glb.mjs';
import { BANDEN } from './leerbanden.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COLUMNS = 16;
const ROWS = 4;
const FLOAT = 5126;

const HELP = `reband.mjs <kit>/<model> <from>:<to> [<from>:<to> ...]
  Moves every vertex on band <from> to band <to> in kits/workfiles/<kit>/<model>.glb,
  keeping its place within the cell. Bands: ${Object.keys(BANDEN).join(' ')}`;

const [id, ...pairs] = process.argv.slice(2);
if (!id || !pairs.length) {
  console.log(HELP);
  process.exit(1);
}

const moves = pairs.map((pair) => {
  const [from, to] = pair.split(':');
  if (!BANDEN[from] || !BANDEN[to]) throw new Error(`band not known: ${pair}`);
  return { from, to, fromCell: BANDEN[from], toCell: BANDEN[to], moved: 0 };
});

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;
const bin = Buffer.from(glb.bin);

const seen = new Set();
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const index = prim.attributes?.TEXCOORD_0;
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
    const accessor = json.accessors[index];
    if (accessor.componentType !== FLOAT || accessor.type !== 'VEC2') {
      throw new Error(`${id}: TEXCOORD_0 accessor ${index} is not float VEC2`);
    }
    const view = json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const step = view.byteStride ?? 8;
    for (let i = 0; i < accessor.count; i++) {
      const at = start + i * step;
      const u = bin.readFloatLE(at);
      const v = bin.readFloatLE(at + 4);
      const column = Math.min(Math.max(Math.floor(u * COLUMNS), 0), COLUMNS - 1);
      const row = Math.min(Math.max(Math.floor(v * ROWS), 0), ROWS - 1);
      const move = moves.find((m) => m.fromCell[0] === column && m.fromCell[1] === row);
      if (!move) continue;
      bin.writeFloatLE(Math.fround(u + (move.toCell[0] - column) / COLUMNS), at);
      bin.writeFloatLE(Math.fround(v + (move.toCell[1] - row) / ROWS), at + 4);
      move.moved++;
    }
    delete accessor.min;
    delete accessor.max;
  }
}

const idle = moves.filter((m) => !m.moved);
if (idle.length) throw new Error(`${id}: no vertex on ${idle.map((m) => m.from).join(', ')}`);

writeGlb(path, json, bin, writeFileSync);
for (const m of moves) console.log(`${id}: ${m.from} → ${m.to}, ${m.moved} vertices`);
