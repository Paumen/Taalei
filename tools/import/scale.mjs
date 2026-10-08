import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds } from './mesh-edit.mjs';

const HELP = `scale.mjs <workfile.glb | dir> [...]
scale.mjs --to <scale> <workfile.glb | dir> [...]
scale.mjs --by <factor> <workfile.glb | dir> [...]

A workfile carries its size in its geometry: no scene root node has a scale.
Without --to, a root's scale is built into the geometry below it and dropped.
With --to, the model is resized from the scale its taaleiland extras record to
<scale>, about its root origin, and the record is set to <scale>. --by
multiplies each model's recorded scale, keeping per-model factors apart.`;

const label = (json) => json.extras?.taaleiland ?? json.asset?.extras?.taaleiland;

function subtree(json, root) {
  const out = [];
  const walk = (i) => { out.push(i); for (const c of json.nodes[i].children ?? []) walk(c); };
  walk(root);
  return out;
}

export function scaleGlb(glb, to, by) {
  const { json } = glb;
  const roots = json.scenes[json.scene ?? 0].nodes;
  const record = label(json);
  if (by !== undefined) to = record?.schaal * by;
  if (to !== undefined) {
    if (typeof record?.schaal !== 'number' || record.schaal <= 0) throw new Error('no scale recorded');
    const r = to / record.schaal;
    for (const i of roots) {
      const node = json.nodes[i];
      if (node.matrix) throw new Error('root node with a matrix');
      if (node.translation) node.translation = node.translation.map((v) => v * r);
      node.scale = (node.scale ?? [1, 1, 1]).map((v) => v * r);
    }
    record.schaal = to;
  }

  const nodeFactor = new Map();
  const claim = (map, key, s, what) => {
    if (map.has(key) && Math.abs(map.get(key) - s) > 1e-12) throw new Error(`${what} ${key} shared between roots of different scale`);
    map.set(key, s);
  };
  for (const i of roots) {
    const node = json.nodes[i];
    if (node.matrix) throw new Error('root node with a matrix');
    const sc = node.scale ?? [1, 1, 1];
    if (sc.some((v) => Math.abs(v - sc[0]) > 1e-9 * Math.abs(sc[0]))) throw new Error('root scale is not uniform');
    for (const n of subtree(json, i)) claim(nodeFactor, n, sc[0], 'node');
  }
  const points = new Map();
  for (const a of json.animations ?? []) for (const ch of a.channels) {
    const s = nodeFactor.get(ch.target.node) ?? 1;
    if (s !== 1 && ch.target.path === 'scale' && roots.includes(ch.target.node)) claim(points, a.samplers[ch.sampler].output, 1 / s, 'accessor');
  }
  for (const [n, s] of nodeFactor) {
    const node = json.nodes[n];
    if (s !== 1 && !roots.includes(n)) {
      if (node.matrix) for (const k of [12, 13, 14]) node.matrix[k] *= s;
      else if (node.translation) node.translation = node.translation.map((v) => v * s);
    }
    if (node.mesh === undefined) continue;
    let m = s;
    if (node.skin !== undefined) {
      const skin = json.skins[node.skin];
      m = nodeFactor.get(skin.joints[0]) ?? 1;
      if (skin.joints.some((j) => (nodeFactor.get(j) ?? 1) !== m)) throw new Error('skin joints under roots of different scale');
      if (m !== 1 && skin.inverseBindMatrices !== undefined) claim(points, skin.inverseBindMatrices, m, 'accessor');
    }
    if (m === 1) continue;
    for (const prim of json.meshes[node.mesh].primitives) {
      claim(points, prim.attributes.POSITION, m, 'accessor');
      for (const t of prim.targets ?? []) if (t.POSITION !== undefined) claim(points, t.POSITION, m, 'accessor');
    }
  }
  for (const a of json.animations ?? []) for (const ch of a.channels) {
    const s = nodeFactor.get(ch.target.node) ?? 1;
    if (s === 1 || ch.target.path !== 'translation' || roots.includes(ch.target.node)) continue;
    claim(points, a.samplers[ch.sampler].output, s, 'accessor');
  }

  const replaced = new Map();
  for (const [index, s] of points) {
    const accessor = json.accessors[index];
    if (accessor.bufferView === undefined && !accessor.sparse) continue;
    if (accessor.componentType !== 5126) throw new Error(`accessor ${index} is not float`);
    const { data } = readAccessor(glb, index);
    const out = new Float32Array(data.length);
    if (accessor.type === 'MAT4') {
      for (let i = 0; i < data.length; i++) out[i] = (i % 16 >= 12 && i % 16 <= 14) ? data[i] * s : data[i];
    } else {
      for (let i = 0; i < data.length; i++) out[i] = data[i] * s;
    }
    replaced.set(index, Buffer.from(out.buffer));
  }
  for (const i of roots) delete json.nodes[i].scale;
  if (replaced.size) {
    repack(glb, replaced);
    fixBounds(glb);
  }
  return replaced.size > 0 || to !== undefined;
}

const files = (path) => (statSync(path).isDirectory()
  ? readdirSync(path).filter((f) => f.endsWith('.glb')).map((f) => join(path, f))
  : [path]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
  const option = (name) => {
    const at = args.indexOf(name);
    if (at < 0) return undefined;
    const v = Number(args[at + 1]);
    args.splice(at, 2);
    if (!(v > 0)) throw new Error(`${name} needs a positive number`);
    return v;
  };
  const to = option('--to'), by = option('--by');
  if (to !== undefined && by !== undefined) throw new Error('--to or --by, not both');
  let changed = 0, failed = 0;
  for (const file of args.flatMap(files)) {
    try {
      const glb = readGlb(file);
      const hadScale = glb.json.scenes[glb.json.scene ?? 0].nodes.some((i) => glb.json.nodes[i].scale);
      if (scaleGlb(glb, to, by) || hadScale) { writeGlb(file, glb.json, glb.bin, writeFileSync); changed++; }
    } catch (e) {
      console.error(`${file}: ${e.message}`);
      failed++;
    }
  }
  console.log(`${changed} changed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
