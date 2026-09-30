import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, welder, editablePrimitives, vertexAdder, faceNormal } from './mesh-edit.mjs';

const HELP = `face-bands.mjs [--dry] <workfile.glb> [...]

Evens out the colour of triangles that should read as one surface.

A triangle whose corners sit in different cells of kits/colormap.png takes the
cell most of its corners have; the other corners move into it, keeping their
place in the cell.

A flat face is a run of triangles sharing edges and lying in one plane. When
every corner of the face is a real corner of its outline (no point inside it,
none on a straight stretch of its rim), the face cannot carry a drawn colour
boundary, so its triangles all take the cell covering most of its area, and
each corner one UV for all triangles that meet there: the mean of the corners
already in that cell, else of all of them. Faces with points inside or on the
rim are left as they are and counted as kept. --dry reports without writing.`;

const COPLANAR = 0.9995;
const STRAIGHT = Math.cos((2 * Math.PI) / 180);
const SAME_UV = 1e-6;

const cellOf = ([u, v]) => `${Math.floor(u * 16)},${Math.floor(v * 4)}`;
const into = ([u, v], cell) => {
  const [cu, cv] = cellOf([u, v]).split(',').map(Number);
  const [tu, tv] = cell.split(',').map(Number);
  return [u + (tu - cu) / 16, v + (tv - cv) / 4];
};
const sameUv = (a, b) => Math.abs(a[0] - b[0]) < SAME_UV && Math.abs(a[1] - b[1]) < SAME_UV;
const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);

function outlineIsCorners(region, corner, point, normal) {
  const uses = new Map();
  for (const t of region) for (let k = 0; k < 3; k++) {
    const e = edgeKey(corner(t, k), corner(t, (k + 1) % 3));
    uses.set(e, (uses.get(e) ?? 0) + 1);
  }
  const next = new Map();
  for (const t of region) for (let k = 0; k < 3; k++) {
    const a = corner(t, k), b = corner(t, (k + 1) % 3);
    if (uses.get(edgeKey(a, b)) !== 1) continue;
    if (next.has(a)) return false;
    next.set(a, b);
  }
  const all = new Set(region.flatMap((t) => [0, 1, 2].map((k) => corner(t, k))));
  if (next.size !== all.size) return false;
  const loop = [];
  let at = next.keys().next().value;
  while (at !== undefined && loop.length <= all.size) {
    loop.push(at);
    at = next.get(at);
    if (at === loop[0]) break;
  }
  if (at !== loop[0] || loop.length !== all.size) return false;
  for (let i = 0; i < loop.length; i++) {
    const [a, b, c] = [-1, 0, 1].map((d) => point(loop[(i + d + loop.length) % loop.length]));
    const u = [0, 1, 2].map((k) => b[k] - a[k]);
    const v = [0, 1, 2].map((k) => c[k] - b[k]);
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    if (!lu || !lv) return false;
    if ((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv) > STRAIGHT) return false;
  }
  return normal !== null;
}

function evenPrimitive(glb, prim, replaced) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const base = pos.length / 3;
  const source = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const uvs = Array.from({ length: base }, (_, i) => [source[i * 2], source[i * 2 + 1]]);
  const origin = Array.from({ length: base }, (_, i) => i);
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const { weld } = welder(pos);
  const welded = Array.from({ length: base }, (_, i) => weld(i));
  const at = (v) => welded[origin[v]];
  const point = new Map();
  welded.forEach((w, i) => { if (!point.has(w)) point.set(w, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]); });

  const made = new Map();
  const withUv = (v, uv) => {
    if (sameUv(uvs[v], uv)) return v;
    const key = `${origin[v]}|${uv[0]}|${uv[1]}`;
    if (!made.has(key)) {
      made.set(key, uvs.length);
      uvs.push(uv);
      origin.push(origin[v]);
    }
    return made.get(key);
  };
  const cellOfTriangle = (t) => {
    const cells = [0, 1, 2].map((k) => cellOf(uvs[idx[t * 3 + k]]));
    return cells.find((c, k) => cells.indexOf(c) !== k) ?? cells[0];
  };

  const count = idx.length / 3;
  let mixed = 0;
  for (let t = 0; t < count; t++) {
    const cells = new Set([0, 1, 2].map((k) => cellOf(uvs[idx[t * 3 + k]])));
    if (cells.size < 2) continue;
    mixed++;
    const cell = cellOfTriangle(t);
    for (let k = 0; k < 3; k++) idx[t * 3 + k] = withUv(idx[t * 3 + k], into(uvs[idx[t * 3 + k]], cell));
  }

  const normal = [];
  const area = [];
  for (let t = 0; t < count; t++) {
    const n = faceNormal(pos, origin[idx[t * 3]], origin[idx[t * 3 + 1]], origin[idx[t * 3 + 2]]);
    const length = Math.hypot(...n);
    area.push(length / 2);
    normal.push(length ? n.map((x) => x / length) : null);
  }
  const corner = (t, k) => at(idx[t * 3 + k]);
  const edges = new Map();
  for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
    const e = edgeKey(corner(t, k), corner(t, (k + 1) % 3));
    if (!edges.has(e)) edges.set(e, []);
    edges.get(e).push(t);
  }

  let evened = 0;
  let kept = 0;
  const seen = new Uint8Array(count);
  for (let s = 0; s < count; s++) {
    if (seen[s] || !normal[s]) continue;
    const region = [s];
    seen[s] = 1;
    for (let i = 0; i < region.length; i++) {
      const t = region[i];
      for (let k = 0; k < 3; k++) {
        const sharing = edges.get(edgeKey(corner(t, k), corner(t, (k + 1) % 3)));
        if (sharing.length !== 2) continue;
        for (const o of sharing) {
          if (seen[o] || !normal[o]) continue;
          if (normal[t][0] * normal[o][0] + normal[t][1] * normal[o][1] + normal[t][2] * normal[o][2] < COPLANAR) continue;
          seen[o] = 1;
          region.push(o);
        }
      }
    }
    if (region.length < 2) continue;

    const byPoint = new Map();
    for (const t of region) for (let k = 0; k < 3; k++) {
      const w = corner(t, k);
      if (!byPoint.has(w)) byPoint.set(w, []);
      byPoint.get(w).push({ t, uv: uvs[idx[t * 3 + k]] });
    }
    if (![...byPoint.values()].some((list) => list.some((c) => !sameUv(c.uv, list[0].uv)))) continue;
    if (!outlineIsCorners(region, corner, (w) => point.get(w), normal[s])) { kept++; continue; }

    const weight = new Map();
    for (const t of region) weight.set(cellOfTriangle(t), (weight.get(cellOfTriangle(t)) ?? 0) + area[t]);
    const cell = [...weight].sort((a, b) => b[1] - a[1])[0][0];
    const target = new Map();
    for (const [w, list] of byPoint) {
      const own = list.filter((c) => cellOfTriangle(c.t) === cell);
      const use = own.length ? own : list;
      target.set(w, [0, 1].map((k) => Math.fround(use.reduce((sum, c) => sum + into(c.uv, cell)[k], 0) / use.length)));
    }
    for (const t of region) for (let k = 0; k < 3; k++) idx[t * 3 + k] = withUv(idx[t * 3 + k], target.get(corner(t, k)));
    evened++;
  }

  if (uvs.length > base || mixed) {
    const adder = vertexAdder(glb, prim);
    for (let v = base; v < uvs.length; v++) adder.add(origin[v], { TEXCOORD_0: uvs[v] });
    adder.commit(idx, replaced);
  }
  return { mixed, evened, kept };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));

let changed = 0;
for (const file of files) {
  const glb = readGlb(file);
  const replaced = new Map();
  const total = { mixed: 0, evened: 0, kept: 0 };
  for (const prim of editablePrimitives(glb.json)) {
    const uv = glb.json.accessors[prim.attributes.TEXCOORD_0];
    if (!uv || uv.componentType !== 5126 || uv.type !== 'VEC2') continue;
    const r = evenPrimitive(glb, prim, replaced);
    for (const k of Object.keys(total)) total[k] += r[k];
  }
  if (!total.mixed && !total.evened) {
    if (total.kept) console.log(`${file}: ${total.kept} faces kept`);
    continue;
  }
  changed++;
  console.log(`${file}: ${total.mixed} mixed triangles, ${total.evened} faces evened, ${total.kept} faces kept`);
  if (dry) continue;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}
console.log(`${changed} of ${files.length} files ${dry ? 'would change' : 'changed'}`);
