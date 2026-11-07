import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldTriangles, rayScene, wallAt, wall } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, vec3View, welder, primitiveMatrix, sub, cross } from './mesh-edit.mjs';

const HELP = `thicken.mjs [--to <thickness>] [--dry] <model.glb> [...]

Thickens walls thinner than <thickness> (0.0062 by default) to <thickness>.
Each face is measured at four points as G33 measures wall, and both sides of a
thin wall move outward along their normals by half of what is missing, so the
wall grows evenly around its middle. A sheet of two faces back to back opens
into a slab, and the gap left along its edge is closed with side faces in the
colour of the edge. Nothing else moves. Prints wall before and after per file,
as JSON.`;

const POINTS = [[1 / 3, 1 / 3], [2 / 3, 1 / 6], [1 / 6, 2 / 3], [1 / 6, 1 / 6]];
const SAME_SIDE = 0.5, NOT_OPPOSITE = -0.2, MOVED = 1e-7, RIDGE = 1e-4, MITER = 4;

const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const dotOf = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function miter(list) {
  const A = [[RIDGE, 0, 0], [0, RIDGE, 0], [0, 0, RIDGE]], b = [0, 0, 0];
  for (const { dir: n, push: p } of list) for (let r = 0; r < 3; r++) {
    b[r] += p * n[r];
    for (let c = 0; c < 3; c++) A[r][c] += n[r] * n[c];
  }
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  const d = [0, 1, 2].map((k) => det(A.map((row, r) => row.map((x, c) => (c === k ? b[r] : x)))) / D);
  const most = MITER * Math.max(...list.map((c) => c.push)), l = Math.hypot(...d);
  return l > most ? d.map((x) => (x * most) / l) : d;
}

function needs(glb, to) {
  const list = worldTriangles(glb);
  const scene = rayScene(list);
  const out = new Map();
  list.forEach(({ prim, node, first }, t) => {
    let least = Infinity;
    for (const [u, v] of POINTS) {
      const j = t * 9, P = scene.P;
      const o = [0, 1, 2].map((q) => P[j + q] + u * (P[j + 3 + q] - P[j + q]) + v * (P[j + 6 + q] - P[j + q]));
      const w = wallAt(scene, t, o);
      if (w !== null) least = Math.min(least, w);
    }
    if (least < to) out.set(`${node}/${prim}/${first}`, (to - least) / 2);
  });
  return out;
}

function isPlain(m) {
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return id.every((v, i) => Math.abs(m[i] - v) < 1e-6);
}

function thickenPrimitive(glb, prim, meshNode, primIndex, need, replaced) {
  const { json } = glb;
  if (!isPlain(primitiveMatrix(json, prim))) return { skipped: 'rotated or scaled node' };
  const index = Array.from(readAccessor(glb, prim.indices).data);
  const posAt = vec3View(glb, prim.attributes.POSITION);
  const count = json.accessors[prim.attributes.POSITION].count;
  const pos = new Float64Array(count * 3);
  for (let v = 0; v < count; v++) pos.set(posAt(v), v * 3);
  const faceN = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    faceN.push(unit(cross(sub(b, a), sub(c, a))));
  }
  const push = new Float64Array(count);
  const dir = Array.from({ length: count }, () => [0, 0, 0]);
  for (let t = 0; t < index.length; t += 3) {
    const p = need.get(`${meshNode}/${primIndex}/${t}`) ?? 0;
    for (let k = 0; k < 3; k++) {
      const v = index[t + k];
      push[v] = Math.max(push[v], p);
      for (let q = 0; q < 3; q++) dir[v][q] += faceN[t / 3][q];
    }
  }
  for (let v = 0; v < count; v++) dir[v] = unit(dir[v]);
  if (!push.some((p) => p > 0)) return { faces: 0 };

  const { weld } = welder(pos);
  const at = new Map();
  for (let v = 0; v < count; v++) {
    const w = weld(v);
    if (!at.has(w)) at.set(w, []);
    at.get(w).push(v);
  }
  const move = Array.from({ length: count }, () => [0, 0, 0]);
  for (const group of at.values()) {
    const clusters = [];
    for (const v of group) {
      const c = clusters.find((s) => dotOf(s.dir, dir[v]) > SAME_SIDE);
      if (c) { c.members.push(v); c.sum = c.sum.map((x, q) => x + dir[v][q]); c.push = Math.max(c.push, push[v]); c.dir = unit(c.sum); }
      else clusters.push({ members: [v], sum: [...dir[v]], dir: [...dir[v]], push: push[v] });
    }
    const side = clusters.map((_, i) => i);
    const root = (i) => (side[i] === i ? i : (side[i] = root(side[i])));
    for (let i = 0; i < clusters.length; i++) for (let k = i + 1; k < clusters.length; k++) {
      if (dotOf(clusters[i].dir, clusters[k].dir) > NOT_OPPOSITE) side[root(i)] = root(k);
    }
    const sides = new Map();
    clusters.forEach((c, i) => { const r = root(i); if (!sides.has(r)) sides.set(r, []); sides.get(r).push(c); });
    for (const list of sides.values()) {
      if (!list.some((c) => c.push > 0)) continue;
      const d = miter(list);
      for (const c of list) for (const v of c.members) move[v] = d;
    }
  }

  const moved = (v) => Math.hypot(...move[v]) > MOVED;
  const edges = new Map();
  for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = index[t + k], b = index[t + (k + 1) % 3];
    const wa = weld(a), wb = weld(b);
    const key = wa < wb ? `${wa},${wb}` : `${wb},${wa}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({ a, b, wa, t });
  }
  const adder = vertexAdder(glb, prim);
  const after = (v) => [0, 1, 2].map((q) => pos[v * 3 + q] + move[v][q]);
  const start = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const near = (p, q) => Math.hypot(...sub(p, q)) < MOVED;
  let sides = 0;
  for (const list of edges.values()) for (const x of list) {
    if (!moved(x.a) && !moved(x.b)) continue;
    const joined = list.some((y) => y !== x && weld(y.a) === weld(x.b) && near(after(y.a), after(x.b)) && near(after(y.b), after(x.a)));
    if (joined) continue;
    const from = [x.b, x.a, x.a, x.b];
    const quad = [after(x.b), after(x.a), start(x.a), start(x.b)];
    const n = unit(cross(sub(quad[1], quad[0]), sub(quad[2], quad[0])).map((v, q) => v + cross(sub(quad[2], quad[0]), sub(quad[3], quad[0]))[q]));
    const ids = from.map((v, k) => adder.add(v, { POSITION: quad[k], NORMAL: n }));
    if (moved(x.a)) index.push(ids[0], ids[1], ids[2]);
    if (moved(x.b)) index.push(ids[0], ids[2], ids[3]);
    sides++;
  }
  for (let v = 0; v < count; v++) if (moved(v)) posAt(v).set(after(v));
  adder.commit(index, replaced);
  return { faces: [...need.keys()].filter((k) => k.startsWith(`${meshNode}/${primIndex}/`)).length, sides };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let to = 0.0062, dry = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--to') to = Number(args[++i]);
  else if (args[i] === '--dry') dry = true;
  else files.push(args[i]);
}
if (!(to > 0)) { console.error('--to needs a positive number'); process.exit(1); }

for (const file of files) {
  const glb = readGlb(file);
  const before = wall(glb);
  const need = needs(glb, to);
  const editable = new Set(editablePrimitives(glb.json));
  const replaced = new Map();
  const report = [];
  glb.json.nodes.forEach((node, n) => {
    if (node.mesh === undefined) return;
    glb.json.meshes[node.mesh].primitives.forEach((prim, p) => {
      if (!editable.has(prim)) { report.push({ prim: p, skipped: 'shared or not editable' }); return; }
      report.push({ prim: p, ...thickenPrimitive(glb, prim, n, p, need, replaced) });
    });
  });
  repack(glb, replaced);
  fixBounds(glb);
  const result = { file, before, after: wall(glb), report };
  if (!dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(JSON.stringify(result));
}
