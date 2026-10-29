import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, welder, primitiveMatrix } from './mesh-edit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const WOOD = ['tan', 'camel', 'chestnut'];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mixer = (f) => (x, y) => x.map((v, k) => v + (y[k] - v) * f);

function area(poly) {
  let s = [0, 0, 0];
  for (let i = 1; i + 1 < poly.length; i++) {
    const u = poly[i].w.map((x, k) => x - poly[0].w[k]);
    const v = poly[i + 1].w.map((x, k) => x - poly[0].w[k]);
    s = s.map((x, k) => x + [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]][k]);
  }
  return Math.hypot(...s) / 2;
}

function clip(poly, n, d, keep) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = keep * (dot(a.w, n) - d);
    const sb = keep * (dot(b.w, n) - d);
    if (sa >= -1e-9) out.push(a);
    if ((sa > 1e-9 && sb < -1e-9) || (sa < -1e-9 && sb > 1e-9)) {
      const mix = mixer(sa / (sa - sb));
      const n2 = a.n && mix(a.n, b.n);
      const len = n2 && Math.hypot(...n2);
      out.push({ l: mix(a.l, b.l), w: mix(a.w, b.w), n: n2 && n2.map((x) => x / len), uv: mix(a.uv, b.uv), src: a.src, mixed: true });
    }
  }
  return out;
}

export function cutAlong(file, planesOf, bands = WOOD) {
  const glb = readGlb(file);
  const replaced = new Map();
  let added = 0;
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const nrm = prim.attributes.NORMAL === undefined ? null : readAccessor(glb, prim.attributes.NORMAL).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const m = primitiveMatrix(glb.json, prim);
    const world = (l) => [0, 1, 2].map((r) => m[r] * l[0] + m[4 + r] * l[1] + m[8 + r] * l[2] + m[12 + r]);
    const vert = (v) => {
      const l = [0, 1, 2].map((k) => pos[v * 3 + k]);
      return { l, w: world(l), n: nrm && [0, 1, 2].map((k) => nrm[v * 3 + k]), uv: [uv[v * 2], uv[v * 2 + 1]], src: v };
    };
    const bandOf = (v) => Object.keys(BANDS).find((b) => BANDS[b] === `${Math.floor(uv[v * 2] * 16)},${Math.floor(uv[v * 2 + 1] * 4)}`);
    const { weld } = welder(pos);
    const n = idx.length / 3;
    const compOf = new Map();
    for (const band of bands) {
      const parent = new Map();
      const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
      const tris = [];
      for (let t = 0; t < n; t++) if ([0, 1, 2].every((k) => bandOf(idx[t * 3 + k]) === band)) tris.push(t);
      for (const t of tris) {
        const w = [0, 1, 2].map((k) => weld(idx[t * 3 + k]));
        for (const a of w) if (!parent.has(a)) parent.set(a, a);
        parent.set(find(w[1]), find(w[0]));
        parent.set(find(w[2]), find(w[0]));
      }
      const ids = new Map();
      for (const t of tris) {
        const r = find(weld(idx[t * 3]));
        if (!ids.has(r)) ids.set(r, ids.size);
        compOf.set(t, ids.get(r));
      }
    }
    const adder = vertexAdder(glb, prim);
    const cache = new Map();
    const id = (q) => {
      if (!q.mixed) return q.src;
      const key = `${q.l.map((x) => x.toFixed(6))}|${q.uv.map((x) => x.toFixed(6))}|${q.n ? q.n.map((x) => x.toFixed(4)) : ''}`;
      if (!cache.has(key)) {
        cache.set(key, adder.add(q.src, { POSITION: q.l, ...(q.n ? { NORMAL: q.n } : {}), TEXCOORD_0: q.uv }));
        added++;
      }
      return cache.get(key);
    };
    const next = [];
    for (let t = 0; t < n; t++) {
      const tri = [0, 1, 2].map((k) => vert(idx[t * 3 + k]));
      const c = [0, 1, 2].map((i) => (tri[0].w[i] + tri[1].w[i] + tri[2].w[i]) / 3);
      const band = bands.includes(bandOf(idx[t * 3])) && compOf.has(t) ? bandOf(idx[t * 3]) : null;
      const planes = band ? planesOf({ c, band, comp: compOf.get(t) }) ?? [] : [];
      let parts = [tri];
      for (const [nv, d] of planes) parts = parts.flatMap((p) => {
        const s = p.map((q) => dot(q.w, nv) - d);
        if (s.every((x) => x > -1e-7) || s.every((x) => x < 1e-7)) return [p];
        return [clip(p, nv, d, 1), clip(p, nv, d, -1)].filter((q) => q.length >= 3 && area(q) > 1e-10);
      });
      for (const p of parts) for (let k = 1; k + 1 < p.length; k++) {
        const ids = [p[0], p[k], p[k + 1]].map(id);
        if (new Set(ids).size === 3 && area([p[0], p[k], p[k + 1]]) > 1e-10) next.push(...ids);
      }
    }
    adder.commit(next, replaced);
  }
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return added;
}
