import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds } from '../import/mesh-edit.mjs';

export const BINS = 100;

export function loadModel(path) {
  const glb = readGlb(path);
  const { json } = glb;
  if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1 || json.nodes.length !== 1) {
    throw new Error(`${path}: needs one node with one mesh of one primitive`);
  }
  const node = json.nodes[0];
  if (node.rotation || node.scale || node.matrix) throw new Error(`${path}: node carries more than a translation`);
  const prim = json.meshes[0].primitives[0];
  const t = node.translation ?? [0, 0, 0];
  const P = readAccessor(glb, prim.attributes.POSITION).data;
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) P[i + k] += t[k];
  const N = readAccessor(glb, prim.attributes.NORMAL).data;
  const F = readAccessor(glb, prim.indices).data;
  const UV = prim.attributes.TEXCOORD_0 === undefined ? null : readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  return { glb, prim, P, N, F, UV };
}

export function bounds(P) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], P[i + k]);
    max[k] = Math.max(max[k], P[i + k]);
  }
  return { min, max, size: [0, 1, 2].map((k) => max[k] - min[k]) };
}

export const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function saveModel(model, Q, M, scale, centre, out) {
  const { glb, prim } = model;
  const b = bounds(Q);
  const shift = [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];
  const pos = new Float32Array(Q.length);
  for (let i = 0; i < Q.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = (Q[i + k] - shift[k]) * scale;
  const height = bounds(pos).max[1];
  const node = [centre[0], height / 2, centre[2]];
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += centre[0] - node[0];
    pos[i + 1] -= node[1];
    pos[i + 2] += centre[2] - node[2];
  }
  const replaced = new Map([[prim.attributes.POSITION, Buffer.from(pos.buffer)]]);
  if (M) {
    const nor = new Float32Array(M.length);
    for (let i = 0; i < M.length; i += 3) {
      const l = Math.hypot(M[i], M[i + 1], M[i + 2]) || 1;
      for (let k = 0; k < 3; k++) nor[i + k] = M[i + k] / l;
    }
    replaced.set(prim.attributes.NORMAL, Buffer.from(nor.buffer));
  }
  repack(glb, replaced);
  fixBounds(glb);
  glb.json.nodes[0].translation = node;
  writeGlb(out, glb.json, glb.bin, writeFileSync);
  return bounds(pos).size;
}

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function samples(P, F, count = 30000) {
  const tris = F.length / 3;
  const area = new Float64Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = [F[t * 3] * 3, F[t * 3 + 1] * 3, F[t * 3 + 2] * 3];
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    total += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    area[t] = total;
  }
  const rnd = random(1);
  const S = new Float64Array((count + P.length / 3) * 3);
  for (let s = 0; s < count; s++) {
    const x = rnd() * total;
    let lo = 0, hi = tris - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (area[m] < x) lo = m + 1; else hi = m; }
    let r1 = rnd(), r2 = rnd();
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    const [a, b, c] = [F[lo * 3] * 3, F[lo * 3 + 1] * 3, F[lo * 3 + 2] * 3];
    for (let k = 0; k < 3; k++) S[s * 3 + k] = P[a + k] + (P[b + k] - P[a + k]) * r1 + (P[c + k] - P[a + k]) * r2;
  }
  S.set(P, count * 3);
  return S;
}

export function profile(S) {
  const b = bounds(S);
  const y0 = b.min[1], H = b.size[1];
  const lo = [[], []].map(() => new Array(BINS).fill(Infinity));
  const hi = [[], []].map(() => new Array(BINS).fill(-Infinity));
  const n = new Array(BINS).fill(0);
  for (let i = 0; i < S.length; i += 3) {
    const bin = clamp(Math.floor(((S[i + 1] - y0) / H) * BINS), 0, BINS - 1);
    n[bin]++;
    [0, 2].forEach((ax, j) => {
      lo[j][bin] = Math.min(lo[j][bin], S[i + ax]);
      hi[j][bin] = Math.max(hi[j][bin], S[i + ax]);
    });
  }
  const has = n.map((c) => c > 3);
  const fill = (j) => {
    const w = lo[j].map((l, i) => hi[j][i] - l);
    const idx = has.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    return w.map((_, i) => {
      if (has[i]) return w[i];
      const after = idx.find((k) => k > i), before = [...idx].reverse().find((k) => k < i);
      if (before === undefined) return w[after];
      if (after === undefined) return w[before];
      return w[before] + ((w[after] - w[before]) * (i - before)) / (after - before);
    });
  };
  return { y0, H, wx: fill(0), wz: fill(1), cx: (b.min[0] + b.max[0]) / 2, cz: (b.min[2] + b.max[2]) / 2 };
}

export function straightRuns({ wx, wz, H }, tol = 0.12) {
  const mask = new Array(BINS).fill(false);
  const runs = [];
  let i = 0;
  while (i < BINS) {
    let j = i;
    const spread = (w, a, b) => { const s = w.slice(a, b); return Math.max(...s) > Math.min(...s) * (1 + tol); };
    while (j + 1 < BINS && !spread(wx, i, j + 2) && !spread(wz, i, j + 2)) j++;
    const length = ((j - i + 1) / BINS) * H;
    const width = Math.max(median(wx.slice(i, j + 1)), median(wz.slice(i, j + 1)));
    if (length >= width && j > i) {
      for (let k = i; k <= j; k++) mask[k] = true;
      runs.push({ i, j, length, width });
    }
    i = j + 1;
  }
  return { mask, runs };
}

const lerp = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  const i = Math.min(xs.length - 2, Math.floor(x - xs[0]));
  const f = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + (ys[i + 1] - ys[i]) * f;
};

export function warp(Q, M, { y0, H, cx, cz }, fx, fy, fz) {
  const edges = Array.from({ length: BINS + 1 }, (_, i) => i);
  const cum = [0];
  for (const f of fy) cum.push(cum[cum.length - 1] + (f * H) / BINS);
  const mids = Array.from({ length: BINS }, (_, i) => i + 0.5);
  const R = Q.slice(), Nn = M.slice();
  for (let v = 0; v < Q.length; v += 3) {
    const u = clamp(((Q[v + 1] - y0) / H) * BINS, 0, BINS);
    const sx = lerp(mids, fx, u), sy = lerp(mids, fy, u), sz = lerp(mids, fz, u);
    R[v] = cx + (Q[v] - cx) * sx;
    R[v + 1] = y0 + lerp(edges, cum, u);
    R[v + 2] = cz + (Q[v + 2] - cz) * sz;
    Nn[v] /= sx; Nn[v + 1] /= sy; Nn[v + 2] /= sz;
  }
  return [R, Nn];
}

export function weldedNormals(Q, F) {
  const key = new Map();
  const group = new Int32Array(Q.length / 3);
  for (let v = 0; v < group.length; v++) {
    const k = `${Math.round(Q[v * 3] / 1e-5)},${Math.round(Q[v * 3 + 1] / 1e-5)},${Math.round(Q[v * 3 + 2] / 1e-5)}`;
    if (!key.has(k)) key.set(k, key.size);
    group[v] = key.get(k);
  }
  const G = new Float64Array(key.size * 3);
  for (let t = 0; t < F.length; t += 3) {
    const [a, b, c] = [F[t] * 3, F[t + 1] * 3, F[t + 2] * 3];
    const u = [Q[b] - Q[a], Q[b + 1] - Q[a + 1], Q[b + 2] - Q[a + 2]];
    const w = [Q[c] - Q[a], Q[c + 1] - Q[a + 1], Q[c + 2] - Q[a + 2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [F[t], F[t + 1], F[t + 2]]) for (let k = 0; k < 3; k++) G[group[v] * 3 + k] += n[k];
  }
  const out = new Float64Array(Q.length);
  for (let v = 0; v < group.length; v++) {
    const g = group[v] * 3;
    const l = Math.hypot(G[g], G[g + 1], G[g + 2]) || 1;
    for (let k = 0; k < 3; k++) out[v * 3 + k] = G[g + k] / l;
  }
  return out;
}
