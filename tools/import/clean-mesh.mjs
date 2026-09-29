import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { COMPONENT, repack, faceNormal, fixBounds } from './mesh-edit.mjs';

const HELP = `clean-mesh.mjs [--dry] <workfile.glb> [...]

Removes triangles with no area, and of two triangles on the same three corners
turning the same way and showing the same colour removes the later one.
Back-to-back twins stay. A normal of zero length becomes the area-weighted normal of the
triangles on that corner, or +Y on a corner no triangle uses; every other normal
is scaled to unit length. Stored min and max are set to the data. A primitive
that shares an accessor with another keeps its triangles. --dry reports without
writing.`;

const WELD = 1e-5;
const SAME_COLOUR = 0.02;
const UNIT = 1e-4;

function keptTriangles(glb, prim) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const idx = readAccessor(glb, prim.indices).data;
  const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, prim.attributes.TEXCOORD_0).data : null;

  let extent = 0;
  for (const v of pos) extent = Math.max(extent, Math.abs(v));
  const eps = Math.max(1e-7, extent * WELD);
  const ids = new Map();
  const weld = (v) => {
    const key = [0, 1, 2].map((k) => Math.round(pos[v * 3 + k] / eps)).join(',');
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key);
  };
  const colourAt = (t) => (uv ? [0, 1].map((k) => (uv[idx[t] * 2 + k] + uv[idx[t + 1] * 2 + k] + uv[idx[t + 2] * 2 + k]) / 3) : [0, 0]);

  const kept = [];
  const byCorners = new Map();
  let degenerate = 0, doubled = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    if (Math.hypot(...faceNormal(pos, a, b, c)) <= eps * eps) { degenerate++; continue; }
    const w = [weld(a), weld(b), weld(c)];
    const first = w.indexOf(Math.min(...w));
    const turn = [w[first], w[(first + 1) % 3], w[(first + 2) % 3]].join(',');
    const corners = [...w].sort((x, y) => x - y).join(',');
    const colour = colourAt(t);
    const twins = byCorners.get(corners) ?? [];
    const twin = twins.find((o) => o.turn === turn
      && Math.hypot(o.colour[0] - colour[0], o.colour[1] - colour[1]) <= SAME_COLOUR);
    if (twin) { doubled++; continue; }
    twins.push({ turn, colour });
    byCorners.set(corners, twins);
    kept.push(a, b, c);
  }
  return { kept, degenerate, doubled };
}

function fixNormals(glb, prims, keptOf) {
  const { json } = glb;
  let fixed = 0;
  const byNormal = new Map();
  for (const prim of prims) {
    const n = prim.attributes.NORMAL;
    if (n === undefined) continue;
    if (!byNormal.has(n)) byNormal.set(n, []);
    byNormal.get(n).push(prim);
  }
  for (const [index, users] of byNormal) {
    const accessor = json.accessors[index];
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.sparse) continue;
    const normals = readAccessor(glb, index).data;
    const sum = new Float64Array(normals.length);
    for (const prim of users) {
      if (prim.attributes.POSITION === undefined) continue;
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      const idx = keptOf.get(prim) ?? (prim.indices !== undefined ? readAccessor(glb, prim.indices).data : null);
      if (!idx) continue;
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const f = faceNormal(pos, idx[t], idx[t + 1], idx[t + 2]);
        for (const v of [idx[t], idx[t + 1], idx[t + 2]]) for (let k = 0; k < 3; k++) sum[v * 3 + k] += f[k];
      }
    }
    const view = json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const step = view.byteStride ?? 12;
    for (let v = 0; v < accessor.count; v++) {
      const n = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
      let length = Math.hypot(...n);
      if (Math.abs(length - 1) <= UNIT) continue;
      if (length < 0.5) {
        const s = [sum[v * 3], sum[v * 3 + 1], sum[v * 3 + 2]];
        const l = Math.hypot(...s);
        n.splice(0, 3, ...(l > 0 ? s : [0, 1, 0]));
        length = l > 0 ? l : 1;
      }
      new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + v * step, 3).set(n.map((c) => c / length));
      fixed++;
    }
  }
  return fixed;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const dry = args.includes('--dry');
const files = args.filter((a) => a !== '--dry');

for (const file of files) {
  const glb = readGlb(file);
  const { json } = glb;
  const prims = (json.meshes ?? []).flatMap((m) => m.primitives ?? []);
  const uses = new Map();
  for (const prim of prims) for (const a of [prim.indices, ...Object.values(prim.attributes)]) uses.set(a, (uses.get(a) ?? 0) + 1);

  const keptOf = new Map();
  const replaced = new Map();
  let degenerate = 0, doubled = 0;
  for (const prim of prims) {
    if ((prim.mode ?? 4) !== 4 || prim.indices === undefined || prim.attributes.POSITION === undefined) continue;
    if ([prim.indices, ...Object.values(prim.attributes)].some((a) => uses.get(a) > 1)) continue;
    const result = keptTriangles(glb, prim);
    degenerate += result.degenerate;
    doubled += result.doubled;
    if (!result.degenerate && !result.doubled) continue;
    keptOf.set(prim, result.kept);
    const accessor = json.accessors[prim.indices];
    const Type = COMPONENT[accessor.componentType];
    const indices = Type.from(result.kept);
    accessor.count = indices.length;
    replaced.set(prim.indices, Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
  }

  const normals = fixNormals(glb, prims, keptOf);
  if (replaced.size) repack(glb, replaced);
  const bounds = fixBounds(glb);

  if (!degenerate && !doubled && !normals && !bounds) continue;
  console.log(`${file}: ${degenerate} no-area, ${doubled} doubled triangle(s) removed, ${normals} normal(s), ${bounds} bound(s) set`);
  if (!dry) writeGlb(file, json, glb.bin, writeFileSync);
}
