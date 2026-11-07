import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldTriangles, rayScene, wallAt, wall } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, vec3View, welder, primitiveMatrix, sub, cross } from './mesh-edit.mjs';

const HELP = `thicken.mjs [--to <thickness>] [--miter <factor>] [--dry] <model.glb> [...]

Thickens walls thinner than <thickness> (0.0062 by default) to <thickness>.
Each face is measured at four points as G33 measures wall. Even, large thin
faces go first, and once less than 15% of the surface is left thin the rest
stays as it is, so small points and tips keep their shape. Both sides of a thin
wall move outward along their normals, each connected part by one amount, so
a sheet stays flat; a sheet of two faces back to back opens into a slab, and
the gap left along its edge is closed with side faces in the colour of the
edge. A point stops well short of any surface in its way, so a
sheet never passes through a part beside it. Prints wall
before and after per file, as JSON. --miter caps how far a corner may move, as
a factor of its push (1.5 by default).`;

const POINTS = [[1 / 3, 1 / 3], [2 / 3, 1 / 6], [1 / 6, 2 / 3], [1 / 6, 1 / 6]];
const SAME_SIDE = 0.5, NOT_OPPOSITE = -0.2, MOVED = 1e-7, RIDGE = 1e-4, LEFT = 0.15, GAP = 3;
let MITER = 1.5;

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
  const thin = [];
  let valid = 0;
  list.forEach(({ prim, node, first }, t) => {
    const ws = [];
    const j = t * 9, P = scene.P;
    for (const [u, v] of POINTS) {
      const o = [0, 1, 2].map((q) => P[j + q] + u * (P[j + 3 + q] - P[j + q]) + v * (P[j + 6 + q] - P[j + q]));
      const w = wallAt(scene, t, o);
      if (w !== null) ws.push(w);
    }
    if (!ws.length) return;
    const a = [0, 1, 2].map((k) => [0, 1, 2].map((q) => P[j + k * 3 + q]));
    const area = Math.hypot(...cross(sub(a[1], a[0]), sub(a[2], a[0]))) / 2;
    valid += area;
    const least = Math.min(...ws);
    if (least < to) thin.push({ key: `${node}/${prim}/${first}`, need: (to - least) / 2, area, even: least / Math.max(...ws) });
  });
  thin.sort((x, y) => y.area * y.even - x.area * x.even);
  let left = thin.reduce((sum, f) => sum + f.area, 0);
  const out = new Map();
  for (const f of thin) {
    if (left <= LEFT * valid) break;
    out.set(f.key, f.need);
    left -= f.area;
  }
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
  const { weld } = welder(pos);
  const root = Array.from({ length: count }, (_, v) => v);
  const find = (x) => { while (root[x] !== x) x = root[x] = root[root[x]]; return x; };
  const first = new Map();
  for (let v = 0; v < count; v++) { const w = weld(v); if (first.has(w)) root[find(v)] = find(first.get(w)); else first.set(w, v); }
  for (let t = 0; t < index.length; t += 3) { root[find(index[t + 1])] = find(index[t]); root[find(index[t + 2])] = find(index[t]); }
  const shell = Array.from({ length: count }, (_, v) => find(v));
  const most = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const p = need.get(`${meshNode}/${primIndex}/${t}`) ?? 0;
    if (p > (most.get(shell[index[t]]) ?? 0)) most.set(shell[index[t]], p);
  }
  const push = new Float64Array(count);
  const dir = Array.from({ length: count }, () => [0, 0, 0]);
  for (let t = 0; t < index.length; t += 3) {
    const p = need.has(`${meshNode}/${primIndex}/${t}`) ? most.get(shell[index[t]]) : 0;
    for (let k = 0; k < 3; k++) {
      const v = index[t + k];
      push[v] = Math.max(push[v], p);
      for (let q = 0; q < 3; q++) dir[v][q] += faceN[t / 3][q];
    }
  }
  for (let v = 0; v < count; v++) dir[v] = unit(dir[v]);
  if (!push.some((p) => p > 0)) return { faces: 0 };

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
  const wid = Array.from({ length: count }, (_, v) => weld(v));
  const start = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const tri = [];
  for (let t = 0; t < index.length; t += 3) {
    const p3 = [0, 1, 2].map((k) => start(index[t + k]));
    tri.push({ p3, w: [0, 1, 2].map((k) => wid[index[t + k]]), lo: [0, 1, 2].map((q) => Math.min(...p3.map((p) => p[q]))), hi: [0, 1, 2].map((q) => Math.max(...p3.map((p) => p[q]))) });
  }
  const hit = (o, d, far, w) => {
    let best = far;
    for (const T of tri) {
      if (T.w.includes(w)) continue;
      if ([0, 1, 2].some((q) => Math.max(o[q], o[q] + d[q] * best) < T.lo[q] || Math.min(o[q], o[q] + d[q] * best) > T.hi[q])) continue;
      const [a, b, c] = T.p3, e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dotOf(e1, h);
      if (Math.abs(det) < 1e-18) continue;
      const f = 1 / det, s0 = sub(o, a), u = f * dotOf(s0, h);
      if (u < 0 || u > 1) continue;
      const q = cross(s0, e1), v = f * dotOf(d, q);
      if (v < 0 || u + v > 1) continue;
      const t = f * dotOf(e2, q);
      if (t > 0 && t < best) best = t;
    }
    return best;
  };
  let held = 0;
  const reach = new Map();
  for (let v = 0; v < count; v++) {
    const l = Math.hypot(...move[v]);
    if (l <= MOVED) continue;
    const key = `${wid[v]}|${move[v].map((x) => x.toFixed(9)).join(',')}`;
    if (!reach.has(key)) {
      const d = move[v].map((x) => x / l), far = l * GAP;
      reach.set(key, Math.min(1, hit(start(v), d, far, wid[v]) / far));
    }
    const k = reach.get(key);
    if (k < 1) { held++; move[v] = move[v].map((x) => x * k); }
  }
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
  const near = (p, q) => Math.hypot(...sub(p, q)) < MOVED;
  const span = Math.max(...[0, 1, 2].map((q) => { let lo = Infinity, hi = -Infinity; for (let v = 0; v < count; v++) { lo = Math.min(lo, pos[v * 3 + q]); hi = Math.max(hi, pos[v * 3 + q]); } return hi - lo; }));
  const sliver = Math.max(1e-7, span * 1e-5) ** 2;
  let sides = 0;
  const built = new Set(), walls = new Map();
  const wall = (ids, pts) => {
    const key = pts.map((p) => p.map((q) => Math.round(q * 2e4)).join(',')).sort().join('|');
    const raw = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    if (Math.hypot(...raw) < sliver) return;
    if (!walls.has(key)) walls.set(key, []);
    walls.get(key).push({ ids, n: unit(raw) });
  };
  for (const list of edges.values()) for (const x of list) {
    if (!moved(x.a) && !moved(x.b)) continue;
    const joined = list.some((y) => y !== x && (weld(y.a) === weld(x.b)
      ? near(after(y.a), after(x.b)) && near(after(y.b), after(x.a))
      : near(after(y.a), after(x.a)) && near(after(y.b), after(x.b))));
    if (joined) continue;
    const wallKey = [x.a, x.b].map((v) => after(v).map((q) => Math.round(q * 1e6)).join(',')).sort().join('|');
    if (built.has(wallKey)) continue;
    built.add(wallKey);
    const from = [x.b, x.a, x.a, x.b];
    const quad = [after(x.b), after(x.a), start(x.a), start(x.b)];
    const raw = cross(sub(quad[1], quad[0]), sub(quad[2], quad[0])).map((v, q) => v + cross(sub(quad[2], quad[0]), sub(quad[3], quad[0]))[q]);
    if (Math.hypot(...raw) < sliver) continue;
    const n = unit(raw);
    const ids = from.map((v, k) => adder.add(v, { POSITION: quad[k], NORMAL: n }));
    if (moved(x.a)) wall([ids[0], ids[1], ids[2]], [quad[0], quad[1], quad[2]]);
    if (moved(x.b)) wall([ids[0], ids[2], ids[3]], [quad[0], quad[2], quad[3]]);
    sides++;
  }
  for (const list of walls.values()) {
    index.push(...list[0].ids);
    const back = list.find((w) => dotOf(w.n, list[0].n) < 0);
    if (back) index.push(...back.ids);
  }
  for (let v = 0; v < count; v++) if (moved(v)) posAt(v).set(after(v));
  adder.commit(index, replaced);
  return { faces: [...need.keys()].filter((k) => k.startsWith(`${meshNode}/${primIndex}/`)).length, sides, held };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let to = 0.0062, dry = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--to') to = Number(args[++i]);
  else if (args[i] === '--dry') dry = true;
  else if (args[i] === '--miter') MITER = Number(args[++i]);
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
