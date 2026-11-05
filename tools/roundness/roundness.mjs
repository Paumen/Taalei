import { readdirSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';

const HELP = `roundness.mjs [kit | kit/name ...] [--json out.json] [--render dir] [--only-problems]

Checks catalogue models for round parts that lost their roundness against
their source model (glb extras taaleiland.bron / bronmodel, from lp-sources).
Finds the clean circles of the source (rims, holes, the rings of turned parts),
lines the source up with the model, follows each circle onto the model and
fits a circle again:

  wobbly  points wander off the circle: rms > 3% of its radius more than in the source
  pointy  one point sticks out or in: > 8% of its radius more than in the source
  oval    the circle stretched: long/short axis > 1.1x the source's

Without arguments it checks every model in kits/workfiles. --render writes per
flagged model the source (.0) and the model (.1) with the flagged circles in
red, and sheets of five models each. Needs ../lp-sources (see CLAUDE.md).`;

const LIMITS = { wobbly: 0.03, pointy: 0.08, oval: 1.1 };
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WF = join(ROOT, 'kits/workfiles');

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function bounds(P) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  return { mn, mx, s: [0, 1, 2].map((k) => mx[k] - mn[k]) };
}

function loadModel(path) {
  const glb = readGlb(path), P = [], F = [];
  glb.json.nodes.forEach((node) => {
    if (node.mesh === undefined) return;
    const t = node.translation ?? [0, 0, 0];
    for (const prim of glb.json.meshes[node.mesh].primitives) {
      const o = P.length / 3, pos = readAccessor(glb, prim.attributes.POSITION).data;
      for (let i = 0; i < pos.length; i += 3) P.push(pos[i] + t[0], pos[i + 1] + t[1], pos[i + 2] + t[2]);
      const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices).data : Array.from({ length: pos.length / 3 }, (_, i) => i);
      for (const i of idx) F.push(i + o);
    }
  });
  const ex = glb.json.asset?.extras?.taaleiland ?? glb.json.extras?.taaleiland;
  return { P: Float64Array.from(P), F: Uint32Array.from(F), info: typeof ex === 'string' ? JSON.parse(ex) : ex };
}

const norm = (s) => String(s).toLowerCase().replace(/\.(glb|gltf|fbx|obj)$/, '').replace(/[^a-z0-9]/g, '');
const kitCache = new Map();
function sourceOf(info) {
  if (!info?.bron || !info?.bronmodel) return null;
  const want = norm(info.bronmodel), wantBase = norm(basename(String(info.bronmodel)));
  for (const k of BRONKITS.filter((x) => x.naam === info.bron)) {
    const key = k.map + (k.submap ?? '');
    if (!kitCache.has(key)) { try { kitCache.set(key, bronModellen(k).modellen); } catch { kitCache.set(key, []); } }
    const list = kitCache.get(key);
    const hit = list.find((m) => norm(m.bestand) === want) ?? list.find((m) => norm(basename(m.bestand)) === wantBase)
      ?? list.find((m) => norm(m.naam) === want) ?? list.find((m) => norm(m.naam) === wantBase);
    if (hit) {
      const P = [], F = [];
      for (const p of hit.primitieven) { const o = P.length / 3; for (const v of p.posities) P.push(v); for (const i of p.indices) F.push(i + o); }
      return { P: Float64Array.from(P), F: Uint32Array.from(F) };
    }
  }
  return null;
}

const ROTS = (() => {
  const out = [];
  for (const p of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const M = Array(9).fill(0), sg = [sx, sy, sz];
    for (let r = 0; r < 3; r++) M[r * 3 + p[r]] = sg[r];
    if (M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]) > 0) out.push(M);
  }
  return out;
})();

function align(P, target) {
  const pick = (Q, n) => { const out = [], step = Math.max(1, Math.floor(Q.length / 3 / n)); for (let v = 0; v < Q.length / 3; v += step) out.push([Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]]); return out; };
  const box = (pts) => { const b = bounds(pts.flat()); return pts.map((p) => p.map((x, k) => (x - b.mn[k]) / (b.s[k] || 1))); };
  const chamfer = (a, b) => { let s = 0; for (const p of a) { let m = Infinity; for (const q of b) m = Math.min(m, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2); s += m; } return s / a.length; };
  const tb = box(pick(target, 600)), ts = bounds(target).s;
  let best = null;
  for (const M of ROTS) {
    const Q = new Float64Array(P.length);
    for (let i = 0; i < P.length; i += 3) for (let r = 0; r < 3; r++) Q[i + r] = M[r * 3] * P[i] + M[r * 3 + 1] * P[i + 1] + M[r * 3 + 2] * P[i + 2];
    const qs = bounds(Q).s, qb = box(pick(Q, 600));
    const ar = [0, 1, 2].reduce((a, k) => a + Math.abs(Math.log((qs[k] + 1e-9) / Math.max(...qs) / ((ts[k] + 1e-9) / Math.max(...ts)))), 0);
    const c = chamfer(qb, tb) + chamfer(tb, qb) + 0.02 * ar;
    if (!best || c < best.c) best = { c, Q };
  }
  const b = bounds(best.Q), t = bounds(target), Q = best.Q, U = new Float64Array(Q.length), g = Math.max(...t.s) / Math.max(...b.s);
  for (let i = 0; i < Q.length; i += 3) for (let k = 0; k < 3; k++) { U[i + k] = t.mn[k] + (Q[i + k] - b.mn[k]) * g; Q[i + k] = t.mn[k] + (Q[i + k] - b.mn[k]) * (t.s[k] / (b.s[k] || 1)); }
  return { Q, U };
}

function mesh(P, F, eps) {
  const key = new Map(), V = [], id = new Int32Array(P.length / 3);
  for (let i = 0; i < id.length; i++) {
    const k = `${Math.round(P[i * 3] / eps)},${Math.round(P[i * 3 + 1] / eps)},${Math.round(P[i * 3 + 2] / eps)}`;
    if (!key.has(k)) { key.set(k, V.length); V.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); }
    id[i] = key.get(k);
  }
  const first = new Int32Array(V.length).fill(-1);
  id.forEach((g, i) => { if (first[g] < 0) first[g] = i; });
  const T = [], N = [];
  for (let t = 0; t < F.length; t += 3) {
    const f = [id[F[t]], id[F[t + 1]], id[F[t + 2]]];
    if (f[0] === f[1] || f[1] === f[2] || f[0] === f[2]) continue;
    const n = cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]]));
    if (!len(n)) continue;
    T.push(f); N.push(unit(n));
  }
  return { V, T, N, first };
}

function rayGrid(M, cell) {
  const g = new Map();
  M.T.forEach((f, t) => {
    const p = f.map((v) => M.V[v]);
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(p[0][k], p[1][k], p[2][k]) / cell)), hi = [0, 1, 2].map((k) => Math.floor(Math.max(p[0][k], p[1][k], p[2][k]) / cell));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = `${x},${y},${z}`; (g.get(k) ?? g.set(k, []).get(k)).push(t); }
  });
  return (o, d, tmax) => {
    const seen = new Set(); let best = null;
    const steps = Math.ceil((2 * tmax) / (cell / 3));
    for (let s = 0; s <= steps; s++) {
      const p = add(o, mul(d, -tmax + (2 * tmax * s) / steps));
      for (const t of g.get(`${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`) ?? []) {
        if (seen.has(t)) continue; seen.add(t);
        const f = M.T[t], v0 = M.V[f[0]], e1 = sub(M.V[f[1]], v0), e2 = sub(M.V[f[2]], v0), h = cross(d, e2), det = dot(e1, h);
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det, s0 = sub(o, v0), u = inv * dot(s0, h);
        if (u < -1e-6 || u > 1 + 1e-6) continue;
        const q = cross(s0, e1), v = inv * dot(d, q);
        if (v < -1e-6 || u + v > 1 + 1e-6) continue;
        const tt = inv * dot(e2, q);
        if (Math.abs(tt) <= tmax && (!best || Math.abs(tt) < Math.abs(best))) best = tt;
      }
    }
    return best;
  };
}

function pca(pts) {
  const c = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const vecs = [], vals = [];
  for (let n = 0; n < 2; n++) {
    let v = unit([1, 0.7, 0.3 + n]);
    for (let it = 0; it < 60; it++) { let w = [dot(C[0], v), dot(C[1], v), dot(C[2], v)]; for (const u of vecs) w = sub(w, mul(u, dot(w, u))); v = unit(w); }
    vecs.push(v); vals.push(Math.max(0, dot([dot(C[0], v), dot(C[1], v), dot(C[2], v)], v)));
  }
  vecs.push(unit(cross(vecs[0], vecs[1])));
  return { c, vecs, vals };
}

function circle(pts) {
  const { c, vecs } = pca(pts);
  const xy = pts.map((p) => { const d = sub(p, c); return [dot(d, vecs[0]), dot(d, vecs[1])]; });
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of xy) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, xy.length]], b = [sxz, syz, sz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-30) return null;
  const s = [0, 1, 2].map((k) => det(M.map((r, i) => r.map((x, j) => (j === k ? b[i] : x)))) / D);
  const cx = s[0] / 2, cy = s[1] / 2, r = Math.sqrt(Math.max(0, s[2] + cx * cx + cy * cy));
  if (!r) return null;
  let rms = 0, max = 0, off = 0;
  for (const [x, y] of xy) { const e = Math.hypot(x - cx, y - cy) - r; rms += e * e; max = Math.max(max, Math.abs(e)); }
  for (const p of pts) off = Math.max(off, Math.abs(dot(sub(p, c), vecs[2])));
  const P2 = pca(xy.map(([x, y]) => [x, y, 0]));
  const ang = xy.map(([x, y], i) => [Math.atan2(y - cy, x - cx), i]).sort((a, b2) => a[0] - b2[0]), order = ang.map(([, i]) => i);
  let gap = 2 * Math.PI - (ang[ang.length - 1][0] - ang[0][0]), distinct = 1;
  for (let i = 1; i < ang.length; i++) { const g = ang[i][0] - ang[i - 1][0]; gap = Math.max(gap, g); if (g > 0.05) distinct++; }
  return { gap, distinct, r, c, wob: Math.sqrt(rms / xy.length) / r, pointy: max / r, ratio: Math.sqrt((P2.vals[0] + 1e-30) / (P2.vals[1] + 1e-30)), flat: off / r, order };
}

function rings(S, L) {
  const out = [], E = new Map();
  S.T.forEach((f, t) => { for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3], k = a < b ? `${a},${b}` : `${b},${a}`; (E.get(k) ?? E.set(k, { a: Math.min(a, b), b: Math.max(a, b), f: [] }).get(k)).f.push(t); } });
  const sharp = [...E.values()].filter((e) => e.f.length === 2 && dot(S.N[e.f[0]], S.N[e.f[1]]) < Math.cos(Math.PI / 6));
  const adj = new Map();
  sharp.forEach((e, i) => { for (const v of [e.a, e.b]) (adj.get(v) ?? adj.set(v, []).get(v)).push(i); });
  const used = new Uint8Array(sharp.length);
  for (let e0 = 0; e0 < sharp.length; e0++) {
    if (used[e0]) continue;
    const vs = [sharp[e0].a]; let v = sharp[e0].a, e = e0;
    while (e !== undefined && !used[e]) { used[e] = 1; v = sharp[e].a === v ? sharp[e].b : sharp[e].a; vs.push(v); const nx = adj.get(v); e = nx.length === 2 ? nx.find((x) => !used[x]) : undefined; }
    if (vs.length > 6 && vs[0] === vs[vs.length - 1]) out.push(vs.slice(0, -1));
  }
  const comp = S.V.map((_, i) => i), root = (x) => { while (comp[x] !== x) x = comp[x] = comp[comp[x]]; return x; };
  for (const [a, b, c] of S.T) { comp[root(b)] = root(a); comp[root(c)] = root(a); }
  for (let ax = 0; ax < 3; ax++) {
    const grp = new Map();
    S.V.forEach((p, i) => { const k = `${root(i)}:${Math.round(p[ax] / (2e-4 * L))}`; (grp.get(k) ?? grp.set(k, []).get(k)).push(i); });
    for (const ids of grp.values()) if (ids.length >= 6) out.push(ids);
  }
  const seen = new Set(), keep = [];
  for (const ids of out) {
    const k = [...ids].sort((a, b) => a - b).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    const c = circle(ids.map((i) => S.V[i]));
    if (c && c.r >= 0.01 * L && c.wob <= 0.01 && c.flat <= 0.05 && c.distinct >= 6 && c.gap <= (75 * Math.PI) / 180) keep.push({ ids, c });
  }
  return keep;
}

export function roundness(path) {
  const cur = loadModel(path), src = sourceOf(cur.info);
  if (!src) return { err: 'no source' };
  const L = Math.max(...bounds(cur.P).s);
  const C = mesh(cur.P, cur.F, L * 1e-6), { Q, U } = align(src.P, cur.P), S = mesh(Q, src.F, L * 1e-6);
  const SU = { ...S, V: S.V.map((_, i) => [U[S.first[i] * 3], U[S.first[i] * 3 + 1], U[S.first[i] * 3 + 2]]) };
  const ray = rayGrid(C, L / 48), found = [];
  let checked = 0;
  for (const { ids, c: c0 } of rings(SU, L)) {
    const pts = ids.map((i) => S.V[i]), cs = circle(pts), n = pca(pts).vecs[2], mp = [];
    if (!cs) continue;
    for (const p of pts) {
      let d = sub(p, cs.c); d = unit(sub(d, mul(n, dot(d, n))));
      const t = ray(p, d, Math.min(0.12 * L, 0.6 * cs.r + 0.04 * L));
      if (t !== null) mp.push(add(p, mul(d, t)));
    }
    if (mp.length < 0.8 * pts.length) continue;
    const c1 = circle(mp);
    if (!c1) continue;
    checked++;
    const kinds = [];
    if (c1.wob - c0.wob > LIMITS.wobbly) kinds.push(['wobbly', c1.wob]);
    if (c1.pointy - c0.pointy > LIMITS.pointy) kinds.push(['pointy', c1.pointy]);
    if (c1.ratio / c0.ratio > LIMITS.oval) kinds.push(['oval', c1.ratio / c0.ratio]);
    if (kinds.length) found.push({ score: Math.max((c1.wob - c0.wob) / LIMITS.wobbly, (c1.pointy - c0.pointy) / LIMITS.pointy, (c1.ratio / c0.ratio - 1) / (LIMITS.oval - 1)), kinds: kinds.map(([k, v]) => `${k} ${v.toFixed(2)}`), r: +(c0.r / L).toFixed(3), at: c1.c.map((x) => +x.toFixed(4)), src: c1.order.map((i) => SU.V[ids[i]]), now: c1.order.map((i) => mp[i]) });
  }
  return { rings: checked, found, U, srcF: src.F, cur };
}

function writeMarked(path, P, F, loops, L) {
  const pos = [], col = [], w = L * 0.006;
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(...k); };
  for (let t = 0; t < F.length; t += 3) tri(...[0, 1, 2].map((j) => [P[F[t + j] * 3], P[F[t + j] * 3 + 1], P[F[t + j] * 3 + 2]]), [0.6, 0.6, 0.62, 1]);
  for (const loop of loops) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], u = unit(sub(b, a));
    const e1 = unit(cross(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(u, e1);
    const ring = [0, 1, 2].map((k) => add(mul(e1, Math.cos((k * 2 * Math.PI) / 3) * w), mul(e2, Math.sin((k * 2 * Math.PI) / 3) * w)));
    for (let k = 0; k < 3; k++) { const k2 = (k + 1) % 3; tri(add(a, ring[k]), add(b, ring[k2]), add(b, ring[k]), [0.95, 0.1, 0.05, 1]); tri(add(a, ring[k]), add(a, ring[k2]), add(b, ring[k2]), [0.95, 0.1, 0.05, 1]); }
  }
  const p32 = Float32Array.from(pos), c32 = Float32Array.from(col), nor = new Float32Array(p32.length);
  for (let i = 0; i < p32.length; i += 9) {
    const n = unit(cross([p32[i + 3] - p32[i], p32[i + 4] - p32[i + 1], p32[i + 5] - p32[i + 2]], [p32[i + 6] - p32[i], p32[i + 7] - p32[i + 1], p32[i + 8] - p32[i + 2]]));
    for (let j = 0; j < 3; j++) nor.set(n, i + j * 3);
  }
  const b = bounds(p32), bin = Buffer.concat([p32, nor, c32].map((a) => Buffer.from(a.buffer)));
  writeGlb(path, {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: p32.byteLength }, { buffer: 0, byteOffset: p32.byteLength, byteLength: nor.byteLength }, { buffer: 0, byteOffset: p32.byteLength * 2, byteLength: c32.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: p32.length / 3, type: 'VEC3', min: b.mn, max: b.mx }, { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: c32.length / 4, type: 'VEC4' }],
  }, bin, writeFileSync);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); process.exit(0); }
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const json = opt('--json'), render = opt('--render');
  const onlyProblems = args.includes('--only-problems');
  const sel = args.filter((a) => !a.startsWith('--'));
  const ids = [];
  for (const kit of readdirSync(WF)) {
    if (!existsSync(join(WF, kit)) || kit.startsWith('.')) continue;
    let files; try { files = readdirSync(join(WF, kit)); } catch { continue; }
    for (const f of files) if (f.endsWith('.glb')) { const id = `${kit}/${f.slice(0, -4)}`; if (!sel.length || sel.includes(kit) || sel.includes(id)) ids.push(id); }
  }
  const report = {};
  if (render) mkdirSync(render, { recursive: true });
  for (const id of ids) {
    let r;
    try { r = roundness(join(WF, `${id}.glb`)); } catch (e) { r = { err: e.message }; }
    report[id] = r.err ? { err: r.err } : { rings: r.rings, found: r.found.map(({ score, kinds, r: rr, at }) => ({ score: +score.toFixed(2), kinds, r: rr, at })) };
    if (r.err) { if (!onlyProblems) console.log(`${id}: ${r.err}`); continue; }
    const worst = r.found.reduce((w, f) => (f.score > (w?.score ?? 0) ? f : w), null);
    if (r.found.length || !onlyProblems) console.log(`${id}: ${r.found.length} of ${r.rings} rings lost roundness${worst ? `, worst ${worst.kinds.join(' + ')} (radius ${(worst.r * 100).toFixed(1)}% of model)` : ''}`);
    if (render && r.found.length) {
      const name = id.replace('/', '-'), L = Math.max(...bounds(r.cur.P).s);
      writeMarked(join(render, `${name}.0.glb`), r.U, r.srcF, r.found.map((f) => f.src), L);
      writeMarked(join(render, `${name}.1.glb`), r.cur.P, r.cur.F, r.found.map((f) => f.now), L);
    }
  }
  if (json) writeFileSync(json, JSON.stringify(report, null, 1));
  const flagged = Object.values(report).filter((x) => x.found?.length).length;
  console.log(`${ids.length} models, ${Object.values(report).filter((x) => x.rings !== undefined).length} with a source, ${flagged} with lost roundness`);
  if (render && flagged) {
    mkdirSync(join(render, 'Textures'), { recursive: true });
    const cm = readdirSync(WF).map((k) => join(WF, k, 'Textures/colormap.png')).find(existsSync);
    if (cm) copyFileSync(cm, join(render, 'Textures/colormap.png'));
    const names = readdirSync(render).filter((f) => f.endsWith('.0.glb')).map((f) => f.slice(0, -6));
    for (let i = 0; i < names.length; i += 5) {
      const dir = join(render, `sheet-${i / 5 + 1}`);
      mkdirSync(join(dir, 'Textures'), { recursive: true });
      if (cm) copyFileSync(cm, join(dir, 'Textures/colormap.png'));
      for (const n of names.slice(i, i + 5)) for (const k of ['0', '1']) copyFileSync(join(render, `${n}.${k}.glb`), join(dir, `${n}.${k}.glb`));
      execFileSync('node', [join(ROOT, 'tools/renders/render.mjs'), dir, '--out', dir, '--views', 'iso,front', '--modes', 'pbr', '--sheet-only', '--sheet-cols', '4'], { stdio: 'ignore' });
    }
    console.log(`marks in ${render}, sheets in ${render}/sheet-*/sheet.png (per model: source iso, front, now iso, front)`);
  }
}
