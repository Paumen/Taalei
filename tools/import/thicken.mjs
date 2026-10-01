import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, measureTubes, measureSticks, TUBE_SLICES } from '../../catalog/tools/glb.mjs';
import { buildKindFields, withKindFields, tubeNeed } from '../../lint/rules.mjs';

const HELP = `thicken.mjs [--min <diameter>] [--max <diameter>] [--list] <workfile.glb> [...]

Widens every tube thinner than --min to just over it, around its own centre line,
keeping its length. Then widens every stick (a straight part of any cross-section,
see measureSticks) whose narrow side is under --min: each slice along it grows on
each side that is under --min, around the slice's own centre, until a fresh
measure finds none left. Without --min each model takes the diameter G27 asks of it,
from its kind in lint/kinds.json and its size in catalog/build/catalog.json. --max narrows
every tube thicker than it down to it instead, and only that; sticks are left alone.
--list prints the tubes and sticks and changes nothing.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

const MARGIN = 1.02;
const STICK_PASSES = 6;

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

function widenStick(glb, stick, min) {
  const { center, axis, u, w } = stick.frame;
  const back = invert3(stick.linear);
  const position = writer(glb, stick.prim.attributes.POSITION);
  const vertices = [...new Set(stick.vertices)];
  const local = vertices.map((v) => {
    const q = times(stick.linear, position(v));
    const d = [q[0] - center[0], q[1] - center[1], q[2] - center[2]];
    return [dot(d, axis), dot(d, u), dot(d, w)];
  });
  const t0 = Math.min(...local.map((l) => l[0]));
  const span = Math.max(...local.map((l) => l[0])) - t0;
  const binOf = local.map((l) => Math.min(TUBE_SLICES - 1, Math.floor((l[0] - t0) / span * TUBE_SLICES)));
  const line = [];
  for (let k = 0; k < TUBE_SLICES; k++) {
    const members = local.filter((_, n) => binOf[n] === k);
    if (!members.length) continue;
    const side = (j) => {
      const values = members.map((l) => l[j]);
      const lo = Math.min(...values), hi = Math.max(...values);
      return [(lo + hi) / 2, hi - lo];
    };
    const [cu, wu] = side(1), [cw, ww] = side(2);
    line.push({ t: members.reduce((sum, l) => sum + l[0], 0) / members.length, cu, cw, wu, ww });
  }
  const at = (t) => {
    if (t <= line[0].t) return line[0];
    const last = line[line.length - 1];
    if (t >= last.t) return last;
    const i = line.findIndex((r) => r.t >= t), a = line[i - 1], b = line[i], f = (t - a.t) / (b.t - a.t);
    const mix = (k) => a[k] + (b[k] - a[k]) * f;
    return { cu: mix('cu'), cw: mix('cw'), wu: mix('wu'), ww: mix('ww') };
  };
  vertices.forEach((v, n) => {
    const [t, a, b] = local[n];
    const { cu, cw, wu, ww } = at(t);
    const na = cu + (a - cu) * Math.max(1, min * MARGIN / Math.max(wu, 1e-9));
    const nb = cw + (b - cw) * Math.max(1, min * MARGIN / Math.max(ww, 1e-9));
    const moved = times(back, [0, 1, 2].map((k) => center[k] + t * axis[k] + na * u[k] + nb * w[k]));
    const p = position(v);
    for (let k = 0; k < 3; k++) p[k] = moved[k];
  });
}

function faceDirections(glb, prim, vertices, point) {
  const count = glb.json.accessors[prim.attributes.POSITION].count;
  const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices).data : Array.from({ length: count }, (_, i) => i);
  const sum = new Map([...vertices].map((v) => [v, [0, 0, 0]]));
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (!tri.some((v) => sum.has(v))) continue;
    const [p0, p1, p2] = tri.map(point);
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n);
    if (!len) continue;
    for (const v of tri) if (sum.has(v)) for (let k = 0; k < 3; k++) sum.get(v)[k] += n[k] / len;
  }
  return sum;
}

function turnNormals(glb, prim, vertices, before) {
  if (prim.attributes.NORMAL === undefined) return;
  const position = writer(glb, prim.attributes.POSITION);
  const normal = writer(glb, prim.attributes.NORMAL);
  const from = faceDirections(glb, prim, vertices, (v) => before.get(v) ?? [...position(v)]);
  const to = faceDirections(glb, prim, vertices, (v) => [...position(v)]);
  const unit = (n) => { const len = Math.hypot(...n); return len ? n.map((x) => x / len) : null; };
  for (const v of vertices) {
    const a = unit(from.get(v)), b = unit(to.get(v));
    if (!a || !b) continue;
    const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const sin = Math.hypot(...cross), cos = dot(a, b);
    if (sin < 1e-9) continue;
    const k = cross.map((x) => x / sin);
    const o = normal(v), n = [o[0], o[1], o[2]];
    const kn = [k[1] * n[2] - k[2] * n[1], k[2] * n[0] - k[0] * n[2], k[0] * n[1] - k[1] * n[0]];
    const kd = dot(k, n);
    for (let j = 0; j < 3; j++) o[j] = n[j] * cos + kn[j] * sin + k[j] * kd * (1 - cos);
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
let min = null;
let max = null;
let list = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min') min = Number(args[++i]);
  else if (args[i] === '--max') max = Number(args[++i]);
  else if (args[i] === '--list') list = true;
  else files.push(args[i]);
}
if (min !== null && !(min > 0)) throw new Error('--min needs a positive number');
if (max !== null && !(max > 0 && Number.isFinite(max))) throw new Error('--max needs a positive number');
if (min !== null && max !== null) throw new Error('give --min or --max, not both');

let models = null;
let kindFields = null;
function minOf(file) {
  if (min !== null) return min;
  if (!models) {
    models = new Map(readJson('catalog/build/catalog.json').models.map((m) => [`${m.kit}/${m.name}`, m]));
    kindFields = buildKindFields(readJson('lint/kinds.json'));
  }
  const id = `${basename(dirname(resolve(file)))}/${basename(file, '.glb')}`;
  if (!models.has(id)) throw new Error(`${file}: not in the catalogue, give --min`);
  return tubeNeed(withKindFields(models.get(id), kindFields));
}

for (const file of files) {
  const min = max === null ? minOf(file) : null;
  const glb = readGlb(file);
  glb.bin = Buffer.from(glb.bin);
  const tubes = measureTubes(glb);
  const off = (t) => (max === null ? t.diameter < min : t.diameter > max);
  const thin = tubes.filter(off);
  for (const t of tubes) {
    console.log(`${file}  tube shells ${t.shells.join(',') || '-'}  diameter ${t.diameter.toFixed(4)}  length ${t.length.toFixed(3)}${off(t) ? (max === null ? '  thin' : '  thick') : ''}`);
  }
  if (list) {
    for (const s of measureSticks(glb)) {
      console.log(`${file}  stick shells ${s.shells.join(',') || '-'}  width ${s.width.toFixed(4)}  length ${s.length.toFixed(3)}${max === null && s.width < min ? '  thin' : ''}`);
    }
    continue;
  }
  const touched = new Map();
  const touch = (part) => {
    if (!touched.has(part.prim)) touched.set(part.prim, new Set());
    for (const v of part.vertices) touched.get(part.prim).add(v);
  };
  for (const t of thin) {
    widen(glb, t, (max === null ? min * MARGIN : max) / t.diameter);
    touch(t);
  }
  for (const [prim, vertices] of touched) renormal(glb, prim, vertices);
  let sticks = 0;
  let left = [];
  const stickBefore = new Map();
  if (max === null) {
    for (let pass = 0; pass < STICK_PASSES; pass++) {
      left = measureSticks(glb).filter((s) => s.width < min);
      if (!left.length) break;
      for (const s of left) {
        if (!stickBefore.has(s.prim)) stickBefore.set(s.prim, new Map());
        const position = writer(glb, s.prim.attributes.POSITION);
        for (const v of s.vertices) if (!stickBefore.get(s.prim).has(v)) stickBefore.get(s.prim).set(v, [...position(v)]);
        widenStick(glb, s, min);
        touch(s);
      }
      if (pass === 0) sticks = left.length;
    }
    left = measureSticks(glb).filter((s) => s.width < min);
  }
  if (!touched.size) continue;
  for (const [prim, before] of stickBefore) turnNormals(glb, prim, new Set(before.keys()), before);
  for (const prim of touched.keys()) bound(glb, prim.attributes.POSITION);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(`${file}: ${max === null ? 'widened' : 'narrowed'} ${thin.length} tube(s)${max === null ? `, ${sticks} stick(s)` : ''}`);
  if (left.length) console.log(`${file}: ${left.length} stick(s) still under ${min} after ${STICK_PASSES} passes`);
}
