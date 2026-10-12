import { readFileSync, writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds } from '../import/mesh-edit.mjs';

const HELP = `slim.mjs: cut triangles from a one-mesh workfile by parts.
A part is a shell: triangles welded on shared positions.

  node tools/detail/slim.mjs parts <in.glb> [--all]
      list parts, biggest first: id, tris, size (local, PCA-aligned), centre, uv.
      Parts with the same tris and size are grouped on one line (ids listed).
  node tools/detail/slim.mjs edit <in.glb> <ops.json|inline json> --out <out.glb>
      ops, applied in order; ids are part ids from 'parts' on <in.glb>:
        {"keep":[ids]}                                keep only these (for looking at parts)
        {"drop":[ids]}                                remove parts
        {"replace":{"ids":[ids],"shape":"cyl|cone|sphere|box","segs":8,"rings":4,"axis":"auto|x|y|z|long|short","flip":false}}
                                                      flip: turn the shape end for end (cone tip side)
        {"net":{"ids":[ids],"around":12,"rows":3,"width":0.01,"thick":0.006,"steps":6}}
                                                      replace a net on a round upright surface with a
                                                      diamond lattice of straight strips
        {"add":{"from":[ids],"shape":…,"axis":…,"scale":[axis,u,w],"move":[x,y,z],"up":[x,y,z],"along":0,"uv":[u,v]}}
                                                      along: slide along the shape axis, in half-lengths of the part (-1 = base end)
                                                      up: world direction the u side follows (round parts)
                                                      a new shape per part, fitted to its box, then
                                                      scaled (axis first) and moved in metres
      replace and add fit the shape to the part's PCA box, in its biggest-area uv colour,
      keeping that colour's gradient across the part.
      After edits the model is re-grounded and re-centred in world space if it was before.
  Prints tris before/after.`;

const [cmd, input, opsArg] = process.argv.slice(2);
const outFlag = process.argv.indexOf('--out');
if (!cmd || !input || cmd === '--help') { console.log(HELP); process.exit(0); }

const glb = readGlb(input);
const { json } = glb;
if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error(`${input}: needs one mesh of one primitive`);
const prim = json.meshes[0].primitives[0];
const P = readAccessor(glb, prim.attributes.POSITION).data;
const N = prim.attributes.NORMAL === undefined ? null : readAccessor(glb, prim.attributes.NORMAL).data;
const UV = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
const I = readAccessor(glb, prim.indices).data;
const T = I.length / 3;

const key = (v) => `${Math.round(P[v * 3] * 1e5)},${Math.round(P[v * 3 + 1] * 1e5)},${Math.round(P[v * 3 + 2] * 1e5)}`;
const posId = new Map();
const vpos = new Int32Array(P.length / 3);
for (let v = 0; v < vpos.length; v++) { const k = key(v); if (!posId.has(k)) posId.set(k, posId.size); vpos[v] = posId.get(k); }
const parent = Int32Array.from({ length: posId.size }, (_, i) => i);
const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
for (let t = 0; t < T; t++) {
  const a = find(vpos[I[t * 3]]);
  for (let k = 1; k < 3; k++) { const b = find(vpos[I[t * 3 + k]]); if (a !== b) parent[b] = a; }
}
const shellOf = new Map();
const partTris = [];
for (let t = 0; t < T; t++) {
  const r = find(vpos[I[t * 3]]);
  if (!shellOf.has(r)) { shellOf.set(r, partTris.length); partTris.push([]); }
  partTris[shellOf.get(r)].push(t);
}
const order = partTris.map((_, i) => i).sort((a, b) => partTris[b].length - partTris[a].length);
const parts = order.map((i) => partTris[i]);

const vtx = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);
const norm = (a) => { const l = len(a) || 1; return a.map((x) => x / l); };

function frame(tris) {
  const vs = [...new Set(tris.flatMap((t) => [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]))].map(vtx);
  const c = [0, 1, 2].map((k) => vs.reduce((s, p) => s + p[k], 0) / vs.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of vs) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const axes = jacobi(C);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of vs) { const d = sub(p, c); axes.forEach((a, k) => { const x = dot(d, a); lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); }); }
  const mid = axes.reduce((m, a, k) => m.map((x, i) => x + a[i] * (lo[k] + hi[k]) / 2), c);
  return { centre: mid, axes, size: hi.map((h, k) => h - lo[k]) };
}

function jacobi(A) {
  const a = A.map((r) => [...r]);
  let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  const axes = [0, 1, 2].map((k) => [V[0][k], V[1][k], V[2][k]]);
  return snap(axes);
}

function snap(axes) {
  return axes.map((a) => {
    const m = a.map(Math.abs); const i = m.indexOf(Math.max(...m));
    return m[i] > 0.995 ? [0, 1, 2].map((k) => (k === i ? Math.sign(a[i]) : 0)) : a;
  });
}

function mainUV(tris) {
  const area = new Map();
  for (const t of tris) {
    const [a, b, c] = [0, 1, 2].map((k) => I[t * 3 + k]);
    const ar = len(cross(sub(vtx(b), vtx(a)), sub(vtx(c), vtx(a))));
    const k = `${UV[a * 2].toFixed(4)},${UV[a * 2 + 1].toFixed(4)}`;
    area.set(k, (area.get(k) ?? 0) + ar);
  }
  return [...area].sort((x, y) => y[1] - x[1])[0][0].split(',').map(Number);
}

function solve(M, y) {
  const n = y.length, a = M.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    const p = a.reduce((b, r, i) => (i >= c && Math.abs(r[c]) > Math.abs(a[b][c]) ? i : b), c);
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let i = 0; i < n; i++) if (i !== c) { const f = a[i][c] / a[c][c]; for (let k = c; k <= n; k++) a[i][k] -= f * a[c][k]; }
  }
  return a.map((r, i) => r[n] / r[i]);
}

function uvFit(tris) {
  const m = mainUV(tris), cell = (u, v) => `${Math.floor(u * 16)},${Math.floor(v * 4)}`, mc = cell(m[0], m[1]);
  const vs = [...new Set(tris.flatMap((t) => [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]))].filter((v) => cell(UV[v * 2], UV[v * 2 + 1]) === mc);
  const flat = () => m;
  if (vs.length < 4) return flat;
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], yu = [0, 0, 0, 0], yv = [0, 0, 0, 0];
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const v of vs) {
    const x = [...vtx(v), 1], u = UV[v * 2], w = UV[v * 2 + 1];
    for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) M[i][j] += x[i] * x[j]; yu[i] += x[i] * u; yv[i] += x[i] * w; }
    lo[0] = Math.min(lo[0], u); hi[0] = Math.max(hi[0], u); lo[1] = Math.min(lo[1], w); hi[1] = Math.max(hi[1], w);
  }
  if (hi[0] - lo[0] < 1e-4 && hi[1] - lo[1] < 1e-4) return flat;
  const cu = solve(M, yu), cv = solve(M, yv);
  if (!cu || !cv) return flat;
  const ev = (c, p) => c[0] * p[0] + c[1] * p[1] + c[2] * p[2] + c[3];
  return (p) => [Math.min(hi[0], Math.max(lo[0], ev(cu, p))), Math.min(hi[1], Math.max(lo[1], ev(cv, p)))];
}

const r3 = (a) => a.map((x) => +x.toFixed(3));

if (cmd === 'parts') {
  const rows = parts.map((tris, id) => { const f = frame(tris); return { id, tris: tris.length, size: r3([...f.size].sort((a, b) => b - a)), centre: r3(f.centre), uv: r3(mainUV(tris)) }; });
  const groups = new Map();
  for (const r of rows) { const k = `${r.tris}|${r.size.map((x) => x.toFixed(2))}|${r.uv}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  console.log(`${T} tris, ${parts.length} parts`);
  const all = process.argv.includes('--all');
  let shown = 0;
  for (const g of [...groups.values()].sort((a, b) => b.length * b[0].tris - a.length * a[0].tris)) {
    if (!all && shown++ >= 40) { console.log('… (--all for the rest)'); break; }
    const r = g[0];
    const ids = g.map((x) => x.id);
    console.log(`${String(g.length * r.tris).padStart(6)} tris  ${g.length > 1 ? `${g.length}× ${r.tris}` : r.tris}  ids ${ids.length > 12 && !all ? `${ids.slice(0, 12).join(',')},…(${ids.length})` : ids.join(',')}  size ${r.size.join('x')}  at ${r.centre.join(',')}  uv ${r.uv.join(',')}`);
  }
  process.exit(0);
}

if (cmd !== 'edit') { console.log(HELP); process.exit(1); }
let ops = opsArg.trim().startsWith('[') || opsArg.trim().startsWith('{') ? JSON.parse(opsArg) : JSON.parse(readFileSync(opsArg, 'utf8'));
if (!Array.isArray(ops)) ops = [ops];

const worldBounds = (Pa) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const W = worldMatrices(json);
  json.nodes.forEach((n, ni) => {
    if (n.mesh === undefined || !W[ni]) return;
    const M = W[ni];
    for (let i = 0; i < Pa.length; i += 3) for (let k = 0; k < 3; k++) {
      const v = M[k] * Pa[i] + M[4 + k] * Pa[i + 1] + M[8 + k] * Pa[i + 2] + M[12 + k];
      lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v);
    }
  });
  return { lo, hi };
};
const before = worldBounds(P);

let out = parts.map((tris) => ({ tris: tris.map((t) => [0, 1, 2].map((k) => I[t * 3 + k])), extra: null }));
const pos = Array.from(P), nrm = N ? Array.from(N) : null, uvs = Array.from(UV);
const addV = (p, n, uv) => { pos.push(...p); if (nrm) nrm.push(...n); uvs.push(...uv); return pos.length / 3 - 1; };

for (const op of ops) {
  if (op.keep) { const keep = new Set(op.keep); out = out.map((p, i) => (keep.has(i) ? p : null)); }
  if (op.drop) for (const i of op.drop) out[i] = null;
  if (op.replace) for (const i of op.replace.ids) if (out[i]) out[i].tris = shape(parts[i], op.replace);
  if (op.add) for (const i of op.add.from) out.push({ tris: shape(parts[i], op.add) });
  if (op.net) { const n = net(op.net); for (const i of op.net.ids) out[i] = null; out.push({ tris: n }); }
}

function faceN(a, b, c) {
  const pa = pos.slice(a * 3, a * 3 + 3), pb = pos.slice(b * 3, b * 3 + 3), pc = pos.slice(c * 3, c * 3 + 3);
  return cross(sub(pb, pa), sub(pc, pa));
}

function shape(tris, o) {
  const f = frame(tris);
  const uvAt = o.uv ? () => o.uv : uvFit(tris);
  let order = [0, 1, 2].sort((a, b) => f.size[b] - f.size[a]);
  let ax = order[0];
  if (o.axis === 'short') ax = order[2];
  else if ('xyz'.includes(o.axis ?? '-') && o.axis) { const w = [0, 1, 2].map((k) => Math.abs(f.axes[k]['xyz'.indexOf(o.axis)])); ax = w.indexOf(Math.max(...w)); }
  else if (!o.axis || o.axis === 'auto') {
    const s = [...f.size].sort((a, b) => b - a);
    if (s[0] - s[1] < s[1] - s[2]) ax = order[2];
  }
  const others = [0, 1, 2].filter((k) => k !== ax);
  const A = o.flip ? f.axes[ax].map((x) => -x) : f.axes[ax];
  let U = f.axes[others[0]], W = f.axes[others[1]];
  if (o.up) { const d = dot(o.up, A); U = norm(o.up.map((x, k) => x - d * A[k])); W = cross(A, U); others.sort((a, b) => Math.abs(dot(f.axes[b], U)) - Math.abs(dot(f.axes[a], U))); }
  const sc = o.scale ?? [1, 1, 1], mv = o.move ?? [0, 0, 0];
  const h = f.size[ax] / 2 * sc[0], ru = f.size[others[0]] / 2 * sc[1], rw = f.size[others[1]] / 2 * sc[2];
  const along = (o.along ?? 0) * f.size[ax] / 2;
  const at = (x, u, w) => [0, 1, 2].map((k) => f.centre[k] + mv[k] + A[k] * (x + along) + U[k] * u + W[k] * w);
  const dir = (x, u, w) => norm([0, 1, 2].map((k) => A[k] * x + U[k] * u + W[k] * w));
  const res = [];
  const tri = (a, b, c) => {
    const fn = cross(sub(a.p, b.p), sub(a.p, c.p));
    const ok = dot(fn, a.n) >= 0;
    const vs = [a, b, c].map((q) => addV(q.p, q.n, uvAt(q.p)));
    res.push(ok ? vs : [vs[0], vs[2], vs[1]]);
  };
  const segs = o.segs ?? 8;
  if (o.shape === 'box') {
    const s = [-1, 1];
    for (const [axis, sign] of [[0, -1], [0, 1], [1, -1], [1, 1], [2, -1], [2, 1]]) {
      const n = [0, 0, 0]; n[axis] = sign;
      const c = [];
      for (const a of s) for (const b of s) { const q = [0, 0, 0]; q[axis] = sign; q[(axis + 1) % 3] = a; q[(axis + 2) % 3] = b; c.push(q); }
      const P4 = c.map((q) => ({ p: at(q[0] * h, q[1] * ru, q[2] * rw), n: dir(n[0], n[1], n[2]) }));
      tri(P4[0], P4[1], P4[3]); tri(P4[0], P4[3], P4[2]);
    }
  } else if (o.shape === 'sphere') {
    const rings = o.rings ?? Math.max(3, Math.round(segs / 2));
    const pt = (i, j) => { const th = Math.PI * i / rings, ph = 2 * Math.PI * j / segs; const x = Math.cos(th), u = Math.sin(th) * Math.cos(ph), w = Math.sin(th) * Math.sin(ph); return { p: at(x * h, u * ru, w * rw), n: dir(x / (h || 1), u / (ru || 1), w / (rw || 1)) }; };
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (i > 0) tri(a, b, d);
      if (i < rings - 1) tri(b, c, d);
    }
  } else {
    const cone = o.shape === 'cone';
    const ring = (x, j, r) => { const ph = 2 * Math.PI * j / segs; return at(x, Math.cos(ph) * ru * r, Math.sin(ph) * rw * r); };
    const side = (j) => { const ph = 2 * Math.PI * j / segs; return dir(cone ? h / Math.max(ru, rw) * 0.5 : 0, Math.cos(ph) / (ru || 1), Math.sin(ph) / (rw || 1)); };
    for (let j = 0; j < segs; j++) {
      const a = { p: ring(-h, j, 1), n: side(j) }, b = { p: ring(-h, j + 1, 1), n: side(j + 1) };
      if (cone) {
        const tip = { p: at(h, 0, 0), n: side(j + 0.5) };
        tri(a, b, tip);
      } else {
        const c = { p: ring(h, j + 1, 1), n: side(j + 1) }, d = { p: ring(h, j, 1), n: side(j) };
        tri(a, b, c); tri(a, c, d);
      }
      const bot = dir(-1, 0, 0);
      tri({ p: at(-h, 0, 0), n: bot }, { p: ring(-h, j + 1, 1), n: bot }, { p: ring(-h, j, 1), n: bot });
      if (!cone) { const top = dir(1, 0, 0); tri({ p: at(h, 0, 0), n: top }, { p: ring(h, j, 1), n: top }, { p: ring(h, j + 1, 1), n: top }); }
    }
  }
  return res;
}

function net(o) {
  const tris = o.ids.flatMap((i) => parts[i]);
  const vs = [...new Set(tris.flatMap((t) => [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]))].map(vtx);
  const cx = vs.reduce((a, p) => a + p[0], 0) / vs.length, cz = vs.reduce((a, p) => a + p[2], 0) / vs.length;
  const ys = vs.map((p) => p[1]); const y0 = Math.min(...ys), y1 = Math.max(...ys), H = y1 - y0;
  const band = (lo, hi) => { const r = vs.filter((p) => p[1] >= lo && p[1] <= hi).map((p) => Math.hypot(p[0] - cx, p[2] - cz)); return r.reduce((a, b) => a + b, 0) / r.length; };
  const r0 = band(y0, y0 + H * 0.1), r1 = band(y1 - H * 0.1, y1);
  const uv = o.uv ?? mainUV(tris);
  const n = o.around ?? 12, rows = o.rows ?? 3, w = o.width ?? 0.01, th = o.thick ?? 0.006, steps = o.steps ?? rows * 2;
  const a = Math.PI * rows / n;
  const res = [];
  const quad = (p, q, r, s, out) => {
    let f = cross(sub(q, p), sub(r, p));
    let face = [p, q, r, s];
    if (dot(f, out) < 0) { face = [p, s, r, q]; f = f.map((x) => -x); }
    const nn = norm(f);
    const [A, B, C, D] = face.map((x) => addV(x, nn, uv));
    res.push([A, B, C], [A, C, D]);
  };
  for (const fam of [1, -1]) for (let i = 0; i < n; i++) {
    const rOff = fam * th * 0.35;
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, y = y0 + u * H, r = r0 + (r1 - r0) * u + rOff;
      const t = 2 * Math.PI * (i + (fam < 0 ? 0.5 : 0)) / n + fam * a * u;
      pts.push({ c: [cx + r * Math.cos(t), y, cz + r * Math.sin(t)], out: [Math.cos(t), 0, Math.sin(t)] });
    }
    const ring = pts.map((p, k) => {
      const d = norm(sub(pts[Math.min(k + 1, steps)].c, pts[Math.max(k - 1, 0)].c));
      const side = norm(cross(p.out, d));
      const at = (sa, sb) => p.c.map((x, c) => x + side[c] * sa * w / 2 + p.out[c] * sb * th / 2);
      return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
    });
    for (let k = 0; k < steps; k++) {
      const A = ring[k], B = ring[k + 1], mid = pts[k].c.map((x, c) => (x + pts[k + 1].c[c]) / 2);
      for (let e = 0; e < 4; e++) {
        const p = A[e], q = A[(e + 1) % 4], r = B[(e + 1) % 4], s2 = B[e];
        const fc = [p, q, r, s2].reduce((m, x) => m.map((v, c) => v + x[c] / 4), [0, 0, 0]);
        quad(p, q, r, s2, sub(fc, mid));
      }
    }
    for (const [k, sgn] of [[0, -1], [steps, 1]]) {
      const R = ring[k], d = sub(pts[Math.min(k + 1, steps)].c, pts[Math.max(k - 1, 0)].c).map((x) => x * sgn);
      quad(R[0], R[1], R[2], R[3], d);
    }
  }
  return res;
}

const flat = out.filter(Boolean).flatMap((p) => p.tris).flat();
const used = [...new Set(flat)];
const remap = new Map(used.map((v, k) => [v, k]));
const nP = new Float32Array(used.length * 3), nN = nrm ? new Float32Array(used.length * 3) : null, nU = new Float32Array(used.length * 2);
used.forEach((v, k) => {
  for (let c = 0; c < 3; c++) { nP[k * 3 + c] = pos[v * 3 + c]; if (nN) nN[k * 3 + c] = nrm[v * 3 + c]; }
  nU[k * 2] = uvs[v * 2]; nU[k * 2 + 1] = uvs[v * 2 + 1];
});
const nI = new Uint32Array(flat.map((v) => remap.get(v)));
if (nN) for (let k = 0; k < used.length; k++) { const l = Math.hypot(nN[k * 3], nN[k * 3 + 1], nN[k * 3 + 2]) || 1; for (let c = 0; c < 3; c++) nN[k * 3 + c] /= l; }

const floats = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const replaced = new Map([[prim.attributes.POSITION, floats(nP)], [prim.attributes.TEXCOORD_0, floats(nU)]]);
if (nN) replaced.set(prim.attributes.NORMAL, floats(nN));
for (const a of [prim.attributes.POSITION, prim.attributes.TEXCOORD_0, ...(nN ? [prim.attributes.NORMAL] : [])]) json.accessors[a].count = used.length;
for (const a of Object.entries(prim.attributes).filter(([n]) => !['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(n))) throw new Error(`${input}: attribute ${a[0]} is not supported`);
const big = used.length > 65535;
const idx = big ? nI : Uint16Array.from(nI);
json.accessors[prim.indices].componentType = big ? 5125 : 5123;
json.accessors[prim.indices].count = idx.length;
replaced.set(prim.indices, Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));

const after = worldBounds(nP);
const shift = [0, 0, 0];
if (Math.abs(before.lo[1]) < 1e-4) shift[1] = -after.lo[1];
for (const k of [0, 2]) if (Math.abs((before.lo[k] + before.hi[k]) / 2) < 1e-3) shift[k] = -(after.lo[k] + after.hi[k]) / 2;
for (const r of json.scenes[json.scene ?? 0].nodes) {
  const t = json.nodes[r].translation ?? [0, 0, 0];
  json.nodes[r].translation = t.map((x, k) => x + shift[k]);
}

repack(glb, replaced);
fixBounds(glb);
const outPath = process.argv[outFlag + 1];
writeGlb(outPath, json, glb.bin, writeFileSync);
console.log(`${T} -> ${nI.length / 3} tris (${Math.round(100 * nI.length / 3 / T)}%)  ${outPath}`);
