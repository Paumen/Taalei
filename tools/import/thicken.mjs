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

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det);
}

const times = (m, p) => [
  m[0] * p[0] + m[3] * p[1] + m[6] * p[2],
  m[1] * p[0] + m[4] * p[1] + m[7] * p[2],
  m[2] * p[0] + m[5] * p[1] + m[8] * p[2],
];

function widen(glb, tube, factor) {
  const { center, axis, u, w, rings } = tube.frame;
  const back = invert3(tube.linear);
  const position = writer(glb, tube.prim.attributes.POSITION);
  for (const v of new Set(tube.vertices)) {
    const p = position(v);
    const q = times(tube.linear, p);
    const d = [q[0] - center[0], q[1] - center[1], q[2] - center[2]];
    const t = dot(d, axis);
    const { cu, cw } = ringAt(rings, t);
    const a = cu + (dot(d, u) - cu) * factor;
    const b = cw + (dot(d, w) - cw) * factor;
    const moved = times(back, [0, 1, 2].map((k) => center[k] + t * axis[k] + a * u[k] + b * w[k]));
    for (let k = 0; k < 3; k++) p[k] = moved[k];
  }
}

function renormal(glb, prim, vertices) {
  if (prim.attributes.NORMAL === undefined) return;
  const position = writer(glb, prim.attributes.POSITION);
  const normal = writer(glb, prim.attributes.NORMAL);
  const count = glb.json.accessors[prim.attributes.POSITION].count;
  const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices).data : Array.from({ length: count }, (_, i) => i);
  const sum = new Map([...vertices].map((v) => [v, [0, 0, 0]]));
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (!tri.some((v) => sum.has(v))) continue;
    const [p0, p1, p2] = tri.map((v) => position(v));
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of tri) if (sum.has(v)) for (let k = 0; k < 3; k++) sum.get(v)[k] += n[k];
  }
  for (const [v, n] of sum) {
    const len = Math.hypot(...n);
    if (!len) continue;
    const out = normal(v);
    for (let k = 0; k < 3; k++) out[k] = n[k] / len;
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
    console.log(`${file}  shells ${t.shells.join(',') || '-'}  diameter ${t.diameter.toFixed(4)}  length ${t.length.toFixed(3)}${t.diameter < min ? '  thin' : ''}`);
  }
  if (list || !thin.length) continue;
  const touched = new Map();
  for (const t of thin) {
    widen(glb, t, (min * MARGIN) / t.diameter);
    if (!touched.has(t.prim)) touched.set(t.prim, new Set());
    for (const v of t.vertices) touched.get(t.prim).add(v);
  }
  for (const [prim, vertices] of touched) {
    renormal(glb, prim, vertices);
    bound(glb, prim.attributes.POSITION);
  }
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(`${file}: widened ${thin.length} tube(s)`);
}
