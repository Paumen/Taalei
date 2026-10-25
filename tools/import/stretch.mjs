import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds } from './mesh-edit.mjs';

const HELP = `stretch.mjs [--x <factor>] [--y <factor>] [--z <factor>] <workfile.glb | dir> [...]

Stretches a model along single axes. --y works about the ground plane: every
vertex, node and animated translation height is multiplied by <factor>,
normals follow. --x and --z work about the centre of the model's footprint on
its vertices only. A node turned so that its height leans into another axis
is refused, and for --x and --z also a mesh node with a scale or mesh data
shared between nodes. Use scale.mjs --by first for the size in
every direction.`;

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

export function stretchFlat(glb, fx, fz) {
  const { json } = glb;
  const world = worldMatrices(json);
  const nodes = json.nodes.map((node, i) => ({ node, m: world[i] })).filter((n) => n.node.mesh !== undefined && n.m);
  for (const { m } of nodes) {
    const cols = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
    if (cols.some((c) => Math.abs(Math.hypot(...c) - 1) > 1e-4)) throw new Error('mesh node with a scale');
    if (Math.abs(m[1]) > 1e-5 || Math.abs(m[9]) > 1e-5 || Math.abs(m[4]) > 1e-5 || Math.abs(m[6]) > 1e-5) throw new Error('mesh node turned off the vertical');
  }
  const toW = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  const toL = (m, x, y, z) => { x -= m[12]; y -= m[13]; z -= m[14]; return [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z]; };
  const dW = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  const dL = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];
  const prims = nodes.flatMap(({ node, m }) => json.meshes[node.mesh].primitives.map((p) => ({ p, m })));
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const { p, m } of prims) {
    const d = readAccessor(glb, p.attributes.POSITION).data;
    for (let i = 0; i < d.length; i += 3) { const w = toW(m, d[i], d[i + 1], d[i + 2]); lo[0] = Math.min(lo[0], w[0]); hi[0] = Math.max(hi[0], w[0]); lo[1] = Math.min(lo[1], w[2]); hi[1] = Math.max(hi[1], w[2]); }
  }
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[1] + hi[1]) / 2;
  const replaced = new Map();
  for (const { p, m } of prims) {
    if (replaced.has(p.attributes.POSITION)) throw new Error('mesh data shared between nodes');
    const d = readAccessor(glb, p.attributes.POSITION).data;
    const out = new Float32Array(d.length);
    for (let i = 0; i < d.length; i += 3) { const w = toW(m, d[i], d[i + 1], d[i + 2]); out.set(toL(m, cx + (w[0] - cx) * fx, w[1], cz + (w[2] - cz) * fz), i); }
    replaced.set(p.attributes.POSITION, Buffer.from(out.buffer));
    if (p.attributes.NORMAL === undefined) continue;
    const n = readAccessor(glb, p.attributes.NORMAL).data;
    const no = new Float32Array(n.length);
    for (let i = 0; i < n.length; i += 3) {
      const w = dW(m, n[i], n[i + 1], n[i + 2]);
      w[0] /= fx; w[2] /= fz;
      const l = Math.hypot(...w) || 1;
      no.set(dL(m, w[0] / l, w[1] / l, w[2] / l), i);
    }
    replaced.set(p.attributes.NORMAL, Buffer.from(no.buffer));
  }
  repack(glb, replaced);
  fixBounds(glb);
}

const files = (path) => (statSync(path).isDirectory()
  ? readdirSync(path).filter((f) => f.endsWith('.glb')).map((f) => join(path, f))
  : [path]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
  const take = (name) => {
    const at = args.indexOf(name);
    if (at < 0) return 1;
    const v = Number(args[at + 1]);
    args.splice(at, 2);
    if (!(v > 0)) throw new Error(`${name} needs a positive number`);
    return v;
  };
  const kx = take('--x'), k = take('--y'), kz = take('--z');
  let changed = 0, failed = 0;
  for (const file of args.flatMap(files)) {
    try {
      const glb = readGlb(file);
      if (k !== 1) stretchGlb(glb, k);
      if (kx !== 1 || kz !== 1) stretchFlat(glb, kx, kz);
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
