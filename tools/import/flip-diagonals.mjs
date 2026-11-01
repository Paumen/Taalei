import { readFileSync, writeFileSync } from 'node:fs';
import { parseGlb, readAccessor, writeGlb } from '../../catalog/tools/glb.mjs';
import { repack } from './mesh-edit.mjs';

const HELP = `flip-diagonals.mjs <workfile.glb> [...]
Turns the diagonal of two triangles that lie flat in one plane when the other
diagonal gives less spiky triangles (a smaller widest angle). Only where both
triangles share the same flat normals, colormap cell and an even colour across
the four corners, so the look does not change. No points are added or removed.
Writes a file only when something flipped; prints the flips per file.`;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const PLANE = Math.cos((0.26 * Math.PI) / 180);
const NORMAL = Math.cos(Math.PI / 180);

export function flipDiagonals(glb) {
  const { json } = glb;
  const replaced = new Map();
  let flips = 0;
  for (const mesh of json.meshes ?? []) for (const pr of mesh.primitives) {
    if ((pr.mode ?? 4) !== 4 || pr.indices === undefined || replaced.has(pr.indices)) continue;
    const P = readAccessor(glb, pr.attributes.POSITION).data;
    const N = pr.attributes.NORMAL !== undefined ? readAccessor(glb, pr.attributes.NORMAL).data : null;
    const U = pr.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, pr.attributes.TEXCOORD_0).data : null;
    if (!N) continue;
    const I = Array.from(readAccessor(glb, pr.indices).data);
    const nv = P.length / 3, nt = I.length / 3;
    let ext = 0;
    for (const x of P) ext = Math.max(ext, Math.abs(x));
    const eps = ext * 1e-5, w = new Int32Array(nv), keys = new Map();
    for (let v = 0; v < nv; v++) {
      const k = [0, 1, 2].map((c) => Math.round(P[3 * v + c] / eps)).join();
      if (!keys.has(k)) keys.set(k, keys.size);
      w[v] = keys.get(k);
    }
    const pv = (v) => [P[3 * v], P[3 * v + 1], P[3 * v + 2]];
    const nrm = (v) => [N[3 * v], N[3 * v + 1], N[3 * v + 2]];
    const same = (a, b) => a === b || (len(sub(nrm(a), nrm(b))) < 1e-4 && (!U || Math.abs(U[2 * a] - U[2 * b]) + Math.abs(U[2 * a + 1] - U[2 * b + 1]) < 1e-5));
    const cellOf = (v) => `${Math.floor(U[2 * v] * 16)},${Math.floor(U[2 * v + 1] * 4)}`;
    const faceN = (f) => {
      const n = cross(sub(pv(I[3 * f + 1]), pv(I[3 * f])), sub(pv(I[3 * f + 2]), pv(I[3 * f])));
      const l = len(n);
      return l > 1e-14 ? n.map((x) => x / l) : null;
    };
    const widest = (a, b, c) => {
      const p = [pv(a), pv(b), pv(c)];
      let m = 0;
      for (let k = 0; k < 3; k++) {
        const u = sub(p[(k + 1) % 3], p[k]), v = sub(p[(k + 2) % 3], p[k]);
        m = Math.max(m, Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v) || 1)))));
      }
      return m;
    };
    let changed = 0;
    for (let pass = 0; pass < 20; pass++) {
      const edges = new Map();
      for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) {
        const a = w[I[3 * f + k]], b = w[I[3 * f + ((k + 1) % 3)]], ek = a < b ? `${a},${b}` : `${b},${a}`;
        if (!edges.has(ek)) edges.set(ek, []);
        edges.get(ek).push([f, k]);
      }
      const touched = new Set();
      const tri = (a, b, c) => [w[a], w[b], w[c]].sort((x, y) => x - y).join();
      const used = new Set();
      for (let f = 0; f < nt; f++) used.add(tri(I[3 * f], I[3 * f + 1], I[3 * f + 2]));
      let now = 0;
      for (const L of edges.values()) {
        if (L.length !== 2) continue;
        const [[f, k], [g, j]] = L;
        if (touched.has(f) || touched.has(g)) continue;
        const nf = faceN(f), ng = faceN(g);
        if (!nf || !ng || dot(nf, ng) < PLANE) continue;
        const a = I[3 * f + k], b = I[3 * f + ((k + 1) % 3)], c = I[3 * f + ((k + 2) % 3)];
        const b2 = I[3 * g + j], a2 = I[3 * g + ((j + 1) % 3)], d = I[3 * g + ((j + 2) % 3)];
        if (w[a] !== w[a2] || w[b] !== w[b2] || !same(a, a2) || !same(b, b2)) continue;
        if ([a, b, c, d].some((v) => dot(nrm(v), nf) < NORMAL * len(nrm(v)))) continue;
        if (U) {
          if (new Set([a, b, c, d].map(cellOf)).size > 1) continue;
          const e1 = sub(pv(b), pv(a)), e2 = sub(pv(c), pv(a)), q = sub(pv(d), pv(a));
          const d11 = dot(e1, e1), d12 = dot(e1, e2), d22 = dot(e2, e2), den = d11 * d22 - d12 * d12;
          const s1 = (d22 * dot(q, e1) - d12 * dot(q, e2)) / den, s2 = (d11 * dot(q, e2) - d12 * dot(q, e1)) / den;
          if ([0, 1].some((m) => Math.abs(U[2 * a + m] + s1 * (U[2 * b + m] - U[2 * a + m]) + s2 * (U[2 * c + m] - U[2 * a + m]) - U[2 * d + m]) > 1e-4)) continue;
        }
        const n1 = cross(sub(pv(d), pv(a)), sub(pv(c), pv(a))), n2 = cross(sub(pv(b), pv(d)), sub(pv(c), pv(d)));
        if (dot(n1, nf) <= 0 || dot(n2, nf) <= 0 || len(n1) < 1e-14 || len(n2) < 1e-14) continue;
        if (used.has(tri(a, d, c)) || used.has(tri(d, b, c))) continue;
        if (Math.max(widest(a, d, c), widest(d, b, c)) < Math.max(widest(a, b, c), widest(b2, a2, d)) - 1e-3) {
          used.add(tri(a, d, c));
          used.add(tri(d, b, c));
          I.splice(3 * f, 3, a, d, c);
          I.splice(3 * g, 3, d, b, c);
          touched.add(f);
          touched.add(g);
          now++;
        }
      }
      changed += now;
      if (!now) break;
    }
    if (!changed) continue;
    flips += changed;
    const type = json.accessors[pr.indices].componentType;
    const Arr = type === 5125 ? Uint32Array : type === 5121 ? Uint8Array : Uint16Array;
    replaced.set(pr.indices, Buffer.from(new Arr(I).buffer));
  }
  if (flips) repack(glb, replaced);
  return flips;
}

const files = process.argv.slice(2);
if (!files.length || files.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
for (const file of files) {
  const glb = parseGlb(readFileSync(file), file);
  const flips = flipDiagonals(glb);
  if (flips) writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(`${file}: ${flips}`);
}
