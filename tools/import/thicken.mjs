import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, measureTubes } from '../../catalog/tools/glb.mjs';

const HELP = `thicken.mjs [--min <diameter>] [--list] <workfile.glb> [...]

Widens every tube thinner than --min (0.006 by default) to just over it, around its
own centre line, keeping its length. --list prints the tubes and changes nothing.`;

const MARGIN = 1.02;

function writer(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.sparse) throw new Error('expects float VEC3');
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const step = view.byteStride ?? 12;
  return (i) => new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + i * step, 3);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function ringAt(rings, t) {
  if (t <= rings[0].t) return rings[0];
  const last = rings[rings.length - 1];
  if (t >= last.t) return last;
  const i = rings.findIndex((r) => r.t >= t);
  const a = rings[i - 1], b = rings[i];
  const f = (t - a.t) / (b.t - a.t);
  return { cu: a.cu + (b.cu - a.cu) * f, cw: a.cw + (b.cw - a.cw) * f };
}

function widen(glb, tube, factor) {
  const { center, axis, u, w, rings } = tube.frame;
  const position = writer(glb, tube.prim.attributes.POSITION);
  const normal = tube.prim.attributes.NORMAL !== undefined ? writer(glb, tube.prim.attributes.NORMAL) : null;
  for (const v of new Set(tube.vertices)) {
    const p = position(v);
    const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
    const t = dot(d, axis);
    const { cu, cw } = ringAt(rings, t);
    const a = cu + (dot(d, u) - cu) * factor;
    const b = cw + (dot(d, w) - cw) * factor;
    for (let k = 0; k < 3; k++) p[k] = center[k] + t * axis[k] + a * u[k] + b * w[k];
    if (!normal) continue;
    const n = normal(v);
    const nt = dot(n, axis), nu = dot(n, u) / factor, nw = dot(n, w) / factor;
    const len = Math.hypot(nt, nu, nw) || 1;
    for (let k = 0; k < 3; k++) n[k] = (nt * axis[k] + nu * u[k] + nw * w[k]) / len;
  }
}

function bound(glb, accessorIndex) {
  const { data, count } = readAccessor(glb, accessorIndex);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], data[i * 3 + k]);
    max[k] = Math.max(max[k], data[i * 3 + k]);
  }
  Object.assign(glb.json.accessors[accessorIndex], { min, max });
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let min = 0.006;
let list = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min') min = Number(args[++i]);
  else if (args[i] === '--list') list = true;
  else files.push(args[i]);
}
if (!(min > 0)) throw new Error('--min needs a positive number');

for (const file of files) {
  const glb = readGlb(file);
  glb.bin = Buffer.from(glb.bin);
  const tubes = measureTubes(glb);
  const thin = tubes.filter((t) => t.diameter < min);
  for (const t of tubes) {
    console.log(`${file}  shells ${t.shells.join(',')}  diameter ${t.diameter.toFixed(4)}  length ${t.length.toFixed(3)}${t.diameter < min ? '  thin' : ''}`);
  }
  if (list || !thin.length) continue;
  const touched = new Set();
  for (const t of thin) {
    widen(glb, t, (min * MARGIN) / t.diameter);
    touched.add(t.prim.attributes.POSITION);
  }
  for (const accessor of touched) bound(glb, accessor);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(`${file}: widened ${thin.length} tube(s)`);
}
