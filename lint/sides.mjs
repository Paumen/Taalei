import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, VARS, printTally, widthsOf } from './report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX = VARS.sides.max;
const only = process.argv.slice(2);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function trs(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1];
}

function load(file) {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const g = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8);
  const acc = (i) => {
    const a = g.accessors[i], v = g.bufferViews[a.bufferView];
    const nc = { SCALAR: 1, VEC3: 3 }[a.type];
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
    const at = { 5126: (p) => bin.readFloatLE(p), 5125: (p) => bin.readUInt32LE(p), 5123: (p) => bin.readUInt16LE(p), 5121: (p) => bin.readUInt8(p) }[a.componentType];
    const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? nc * size;
    const out = [];
    for (let k = 0; k < a.count; k++) {
      const row = [];
      for (let c = 0; c < nc; c++) row.push(at(off + k * stride + c * size));
      out.push(nc === 1 ? row[0] : row);
    }
    return out;
  };
  const pos = [], tris = [];
  const walk = (ni, M) => {
    const n = g.nodes[ni], W = mul(M, trs(n));
    if (n.mesh != null) for (const p of g.meshes[n.mesh].primitives) {
      if ((p.mode ?? 4) !== 4) continue;
      const P = acc(p.attributes.POSITION), base = pos.length;
      for (const [x, y, z] of P) pos.push([W[0] * x + W[4] * y + W[8] * z + W[12], W[1] * x + W[5] * y + W[9] * z + W[13], W[2] * x + W[6] * y + W[10] * z + W[14]]);
      const I = p.indices != null ? acc(p.indices) : P.map((_, i) => i);
      for (let i = 0; i < I.length; i += 3) tris.push([I[i] + base, I[i + 1] + base, I[i + 2] + base]);
    }
    for (const c of n.children ?? []) walk(c, W);
  };
  for (const r of g.scenes[g.scene ?? 0].nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return { pos, tris };
}

function circle(a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), n = cross(ab, ac), nn = dot(n, n);
  if (nn < 1e-18) return null;
  const t1 = cross(n, ab).map((v) => v * dot(ac, ac)), t2 = cross(ac, n).map((v) => v * dot(ab, ab));
  const off = [0, 1, 2].map((i) => (t1[i] + t2[i]) / (2 * nn));
  return { c: [a[0] + off[0], a[1] + off[1], a[2] + off[2]], r: len(off), n: n.map((v) => v / Math.sqrt(nn)) };
}

function evenAround(loop, P, C) {
  const e1 = sub(P[loop[0]], C.c), e2 = cross(C.n, e1);
  const ang = loop.map((i) => { const v = sub(P[i], C.c); return Math.atan2(dot(v, e2), dot(v, e1)); });
  const step = (2 * Math.PI) / loop.length;
  for (let i = 0; i < loop.length; i++) {
    let d = ang[(i + 1) % loop.length] - ang[i];
    d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (Math.abs(d - step) > 0.2 * step) return false;
  }
  return true;
}

function mostSides(file) {
  const { pos, tris } = load(file);
  const id = new Map(), P = [];
  const w = pos.map((p) => {
    const k = p.map((v) => Math.round(v * 1e5)).join(',');
    if (!id.has(k)) { id.set(k, P.length); P.push(p); }
    return id.get(k);
  });
  const nb = P.map(() => new Set());
  for (const t of tris) for (let i = 0; i < 3; i++) {
    const a = w[t[i]], b = w[t[(i + 1) % 3]];
    if (a !== b) { nb[a].add(b); nb[b].add(a); }
  }
  let most = 0;
  const seen = new Set();
  for (let a = 0; a < P.length; a++) for (const b of nb[a]) {
    if (b < a) continue;
    for (const c of nb[b]) {
      if (c === a) continue;
      const C = circle(P[a], P[b], P[c]);
      if (!C) continue;
      const seg = len(sub(P[b], P[a]));
      if (Math.abs(len(sub(P[c], P[b])) - seg) > 0.05 * seg) continue;
      const tol = Math.max(1e-5, C.r * 0.02);
      const loop = [a, b, c];
      let prev = b, cur = c, closed = false;
      while (loop.length <= 512) {
        let next = -1;
        for (const d of nb[cur]) {
          if (d === prev) continue;
          const v = sub(P[d], C.c);
          if (Math.abs(dot(v, C.n)) > tol || Math.abs(len(v) - C.r) > tol) continue;
          if (Math.abs(len(sub(P[d], P[cur])) - seg) > 0.05 * seg) continue;
          next = d;
          break;
        }
        if (next < 0) break;
        if (next === a) { closed = true; break; }
        if (loop.includes(next)) break;
        loop.push(next);
        prev = cur;
        cur = next;
      }
      if (!closed || loop.length <= Math.max(MAX, most)) continue;
      const k = [...loop].sort((x, y) => x - y).join(',');
      if (seen.has(k)) continue;
      seen.add(k);
      if (evenAround(loop, P, C)) most = loop.length;
    }
  }
  return most;
}

const { models } = read(VARS.models);
const findings = [];
let checked = 0, skipped = 0;

for (const m of models) {
  const mid = `${m.kit}/${m.name}`;
  if (only.length && !only.includes(mid)) continue;
  if ((m.tags ?? []).some((t) => VARS.sides.exemptTags.includes(t))) { skipped++; continue; }
  const file = join(ROOT, VARS.golden.workfiles, m.kit, `${m.name}.glb`);
  if (!existsSync(file)) continue;
  checked++;
  const n = mostSides(file);
  if (n > MAX) findings.push({ level: 'warning', id: mid, kit: m.kit, kind: m.kind, sides: n });
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id));
const w = widthsOf(findings, ['id', 'kind']);
for (const f of findings) {
  console.log(`${f.level.padEnd(7)}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${String(f.sides).padStart(4)} sides  max ${MAX}`);
}

printTally(findings, 'kit');
console.log(`\n${checked} checked, ${skipped} exempt, ${findings.length} warnings, 0 errors`);
