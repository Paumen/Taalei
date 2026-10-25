import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { gather, deform } from './door-open.mjs';
import { repack, fixBounds, welder, edgeKey, vertexAdder, cross, sub, dot } from './mesh-edit.mjs';

const HELP = `floor-slab.mjs [--to <thickness>] [--dry] <floor.glb> [...]

Sets the slab of a floor tile to <thickness> (0.05 by default). The slab top
is the height with the most upward-facing area; everything between the
bottom and that top is squeezed or stretched to the new thickness, and
everything above it, such as spikes, graves or rocks, moves with the top
unchanged. A tile already <thickness> high is left alone. A tile with no slab,
a flat face on the ground, is given one: the tile is lifted by <thickness> and
the ground face closed with sides and a bottom. Prints the slab before and after per file, as JSON.`;

export function slabTop(shape) {
  const areas = new Map();
  for (const part of shape.parts) for (const { world, index } of part.prims) for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map((i) => [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(...n) / 2;
    if (area < 1e-9 || n[1] / (2 * area) < 0.95) continue;
    const y = (a[1] + b[1] + c[1]) / 3;
    const key = Math.round(y / 0.005);
    const sum = areas.get(key) ?? [0, 0];
    areas.set(key, [sum[0] + area, sum[1] + area * y]);
  }
  const best = [...areas.values()].sort((p, q) => q[0] - p[0])[0];
  return best ? best[1] / best[0] : null;
}

export function setSlab(glb, to = 0.05) {
  const shape = gather(glb);
  const base = shape.min[1];
  if (Math.abs(shape.max[1] - base - to) < 0.003) return { slab: shape.max[1] - base, changed: false };
  const top = slabTop(shape);
  if (top === null || top - base < 0.003 || Math.abs(top - base - to) < 0.003) return { slab: top === null ? null : top - base, changed: false };
  const k = to / (top - base);
  const v = (y) => (y <= top ? { v: base + (y - base) * k, s: k } : { v: y - (top - base) + to, s: 1 });
  deform(glb, shape, (x) => ({ v: x, s: 1 }), v);
  return { slab: top - base, changed: Math.abs(k - 1) > 0.01 };
}

export function thicken(glb, to = 0.05) {
  const { json } = glb;
  const world = worldMatrices(json);
  const replaced = new Map();
  json.nodes.forEach((node, n) => {
    if (node.mesh === undefined) return;
    const m = world[n];
    if (m.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6 && i < 12)) throw new Error('flat tile node must not be turned or scaled');
    for (const prim of json.meshes[node.mesh].primitives) {
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      const idx = readAccessor(glb, prim.indices).data;
      let lo = Infinity;
      for (let i = 1; i < pos.length; i += 3) lo = Math.min(lo, pos[i]);
      const at = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      const ground = [];
      for (let t = 0; t < idx.length; t += 3) {
        const tri = [idx[t], idx[t + 1], idx[t + 2]];
        if (tri.some((i) => pos[i * 3 + 1] - lo > 0.001)) continue;
        if (cross(sub(at(tri[1]), at(tri[0])), sub(at(tri[2]), at(tri[0])))[1] > 0) ground.push(...tri);
      }
      const lifted = new Set();
      const { weld } = welder(pos);
      const uses = new Map();
      for (let t = 0; t < ground.length; t += 3) for (let k = 0; k < 3; k++) {
        const key = edgeKey(weld(ground[t + k]), weld(ground[t + (k + 1) % 3]));
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
      const add = vertexAdder(glb, prim);
      const low = (i, normal) => add.add(i, { NORMAL: normal });
      const out = [...idx];
      const down = [0, -1, 0];
      for (let t = 0; t < ground.length; t += 3) {
        const tri = [ground[t], ground[t + 1], ground[t + 2]];
        out.push(low(tri[0], down), low(tri[2], down), low(tri[1], down));
        for (let k = 0; k < 3; k++) {
          const [p, q, r] = [tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]];
          if (uses.get(edgeKey(weld(p), weld(q))) !== 1) continue;
          const [P, Q, R] = [at(p), at(q), at(r)];
          const l = Math.hypot(Q[0] - P[0], Q[2] - P[2]) || 1;
          let normal = [(Q[2] - P[2]) / l, 0, -(Q[0] - P[0]) / l];
          if (normal[0] * (R[0] - P[0]) + normal[2] * (R[2] - P[2]) > 0) normal = normal.map((v) => -v);
          const [pt, qt, pb, qb] = [add.add(p, { NORMAL: normal }), add.add(q, { NORMAL: normal }), low(p, normal), low(q, normal)];
          const face = cross(sub(Q, P), [0, -1, 0]);
          if (dot(face, normal) > 0) out.push(pt, qt, pb, qt, qb, pb);
          else out.push(pt, pb, qt, qt, pb, qb);
          lifted.add(pt).add(qt);
        }
      }
      for (const i of new Set(idx)) lifted.add(i);
      add.commit(out, replaced);
      const bytes = replaced.get(prim.attributes.POSITION);
      const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      for (const i of lifted) f[i * 3 + 1] += to;
    }
  });
  repack(glb, replaced);
  fixBounds(glb);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
  const dry = args.includes('--dry'); if (dry) args.splice(args.indexOf('--dry'), 1);
  const at = args.indexOf('--to'); const to = at < 0 ? 0.05 : Number(args.splice(at, 2)[1]);
  let failed = 0;
  for (const file of args) {
    try {
      const glb = readGlb(file);
      const r = setSlab(glb, to);
      if (r.slab !== null && r.slab < 0.003 && !dry) { thicken(glb, to); r.changed = true; }
      if (r.changed && !dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
      console.log(JSON.stringify({ file, slab: r.slab === null ? null : +r.slab.toFixed(3), to: r.changed ? to : null }));
    } catch (e) {
      console.log(JSON.stringify({ file, error: e.message }));
      failed++;
    }
  }
  if (failed) process.exitCode = 1;
}
