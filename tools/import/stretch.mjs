import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds } from './mesh-edit.mjs';

const HELP = `stretch.mjs --y <factor> <workfile.glb | dir> [...]

Stretches a model along its height only, about the ground plane: every vertex,
node and animated translation height is multiplied by <factor>, normals follow.
A node turned so that its height leans into another axis is refused. Use
scale.mjs --by first for the size in every direction.`;

export function stretchGlb(glb, k) {
  const { json } = glb;
  const world = worldMatrices(json);
  const tol = 1e-6;
  json.nodes.forEach((node, i) => {
    const m = world[i];
    if (!m) return;
    if (Math.abs(m[1]) > tol || Math.abs(m[9]) > tol || Math.abs(m[4]) > tol || Math.abs(m[6]) > tol) throw new Error(`node ${i} is turned off the vertical`);
    if (node.matrix) node.matrix[13] *= k;
    else if (node.translation) node.translation[1] *= k;
  });
  const pos = new Set(), nrm = new Set(), anim = new Set();
  json.nodes.forEach((node) => {
    if (node.mesh === undefined) return;
    for (const p of json.meshes[node.mesh].primitives) {
      pos.add(p.attributes.POSITION);
      if (p.attributes.NORMAL !== undefined) nrm.add(p.attributes.NORMAL);
      for (const t of p.targets ?? []) if (t.POSITION !== undefined) pos.add(t.POSITION);
    }
  });
  for (const a of json.animations ?? []) for (const ch of a.channels) {
    if (ch.target.path === 'translation') anim.add(a.samplers[ch.sampler].output);
  }
  const replaced = new Map();
  for (const index of [...pos, ...anim]) {
    const { data } = readAccessor(glb, index);
    const out = new Float32Array(data);
    for (let i = 1; i < out.length; i += 3) out[i] *= k;
    replaced.set(index, Buffer.from(out.buffer));
  }
  for (const index of nrm) {
    const { data } = readAccessor(glb, index);
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i += 3) {
      const x = data[i], y = data[i + 1] / k, z = data[i + 2];
      const l = Math.hypot(x, y, z) || 1;
      out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
    }
    replaced.set(index, Buffer.from(out.buffer));
  }
  repack(glb, replaced);
  fixBounds(glb);
}

const files = (path) => (statSync(path).isDirectory()
  ? readdirSync(path).filter((f) => f.endsWith('.glb')).map((f) => join(path, f))
  : [path]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--y');
  if (at < 0 || args.includes('--help')) { console.log(HELP); process.exit(at < 0 ? 1 : 0); }
  const k = Number(args[at + 1]);
  args.splice(at, 2);
  if (!(k > 0)) throw new Error('--y needs a positive number');
  let changed = 0, failed = 0;
  for (const file of args.flatMap(files)) {
    try {
      const glb = readGlb(file);
      stretchGlb(glb, k);
      writeGlb(file, glb.json, glb.bin, writeFileSync);
      changed++;
    } catch (e) {
      console.error(`${file}: ${e.message}`);
      failed++;
    }
  }
  console.log(`${changed} changed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
