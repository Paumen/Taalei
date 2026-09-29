import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, measureScene } from '../../catalog/tools/glb.mjs';
import { repack, faceNormal, fixBounds, welder, editablePrimitives, meshScale, writeVec3, vertexAdder } from './mesh-edit.mjs';

const HELP = `separate-twins.mjs [--dry] <workfile.glb> [...]

Back-to-back twins are triangles on the same three corners turning opposite
ways. Twins that join up into a closed surface facing outward keep that surface
and lose the inward copy, which sits inside the solid. Every other twin moves
away from its partner along its own normal by 0.5 mm, or 0.02% of the model's
longest side when that is more, so each side draws its own face; a corner both
sides share is split in two, and along the rim of a pair, where no other
triangle meets the edge, a strip joins the two faces. A primitive that shares an
accessor with another or holds sparse data is left as it is. --dry reports
without writing.`;

const GAP = 0.0005;
const GAP_SHARE = 0.0002;

function separate(glb, prim, gap, replaced) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const { eps, weld } = welder(pos);
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);

  const groups = new Map();
  const edgeUses = new Map();
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const n = faceNormal(pos, idx[t], idx[t + 1], idx[t + 2]);
    const l = Math.hypot(...n);
    if (l <= eps * eps) continue;
    const w = [weld(idx[t]), weld(idx[t + 1]), weld(idx[t + 2])];
    const first = w.indexOf(Math.min(...w));
    const turn = [w[first], w[(first + 1) % 3], w[(first + 2) % 3]].join(',');
    const key = [...w].sort((x, y) => x - y).join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ t, turn, w, n: n.map((c) => c / l) });
    for (let k = 0; k < 3; k++) {
      const e = edgeKey(w[k], w[(k + 1) % 3]);
      edgeUses.set(e, (edgeUses.get(e) ?? 0) + 1);
    }
  }

  const twins = [];
  for (const group of groups.values()) {
    if (new Set(group.map((g) => g.turn)).size < 2) continue;
    for (const g of group) { g.group = group; twins.push(g); }
  }
  if (!twins.length) return { dropped: 0, moved: 0 };

  const byEdge = new Map();
  for (const g of twins) for (let k = 0; k < 3; k++) {
    const e = `${g.w[k]},${g.w[(k + 1) % 3]}`;
    if (!byEdge.has(e)) byEdge.set(e, []);
    byEdge.get(e).push(g);
  }
  const components = new Map();
  const seen = new Set();
  for (const start of twins) {
    if (seen.has(start)) continue;
    const members = [start];
    const groupsIn = new Set([start.group]);
    seen.add(start);
    for (let i = 0; i < members.length; i++) {
      const g = members[i];
      for (let k = 0; k < 3; k++) {
        for (const o of byEdge.get(`${g.w[(k + 1) % 3]},${g.w[k]}`) ?? []) {
          if (seen.has(o) || groupsIn.has(o.group)) continue;
          seen.add(o);
          groupsIn.add(o.group);
          members.push(o);
        }
      }
    }
    components.set(start, members);
  }

  const drop = new Set();
  const at = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  for (const members of components.values()) {
    const edges = new Set();
    for (const g of members) for (let k = 0; k < 3; k++) edges.add(`${g.w[k]},${g.w[(k + 1) % 3]}`);
    const closed = [...edges].every((e) => edges.has(e.split(',').reverse().join(',')));
    if (!closed) continue;
    let volume = 0;
    for (const g of members) {
      const [p, q, r] = [at(idx[g.t]), at(idx[g.t + 1]), at(idx[g.t + 2])];
      volume += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
    }
    if (volume <= 0) continue;
    for (const g of members) for (const o of g.group) if (o.turn !== g.turn) drop.add(o.t);
  }

  const layer = new Map();
  [...components.keys()].forEach((root, i) => { for (const g of components.get(root)) layer.set(g, i); });
  const active = twins.filter((g) => !drop.has(g.t) && g.group.some((o) => o !== g && !drop.has(o.t)));
  const sums = new Map();
  for (const g of active) for (let k = 0; k < 3; k++) {
    const key = `${g.w[k]}|${layer.get(g)}`;
    const s = sums.get(key) ?? [0, 0, 0];
    sums.set(key, s.map((c, i) => c + g.n[i]));
  }

  const normals = prim.attributes.NORMAL !== undefined ? readAccessor(glb, prim.attributes.NORMAL).data : null;
  const adder = vertexAdder(glb, prim);
  const placed = new Map();
  for (const g of active) for (let k = 0; k < 3; k++) {
    const corner = g.t + k;
    const v = idx[corner];
    const key = `${g.w[k]}|${layer.get(g)}`;
    if (!placed.has(v)) placed.set(v, new Map());
    const copies = placed.get(v);
    if (!copies.has(key)) {
      const s = sums.get(key);
      const l = Math.hypot(...s) || 1;
      const position = at(v).map((c, i) => c + (gap * s[i]) / l);
      if (!copies.size) {
        writeVec3(glb, prim.attributes.POSITION, v, position);
        copies.set(key, v);
      } else {
        const n = normals ? [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]] : null;
        const flip = n && n[0] * s[0] + n[1] * s[1] + n[2] * s[2] < 0;
        copies.set(key, adder.add(v, { POSITION: position, ...(flip ? { NORMAL: n.map((c) => -c) } : {}) }));
      }
    }
    idx[corner] = copies.get(key);
  }
  const moved = active.length;

  const strips = [];
  for (const group of groups.values()) {
    if (group.length !== 2 || group[0].turn === group[1].turn || group.some((g) => drop.has(g.t))) continue;
    const [a, b] = group;
    for (let k = 0; k < 3; k++) {
      const [w1, w2] = [a.w[k], a.w[(k + 1) % 3]];
      if (edgeUses.get(edgeKey(w1, w2)) !== 2) continue;
      const a1 = idx[a.t + k], a2 = idx[a.t + (k + 1) % 3];
      const b1 = idx[b.t + b.w.indexOf(w1)], b2 = idx[b.t + b.w.indexOf(w2)];
      strips.push(a2, a1, b1, a2, b1, b2);
    }
  }

  const kept = [];
  for (let t = 0; t + 2 < idx.length; t += 3) if (!drop.has(t)) kept.push(idx[t], idx[t + 1], idx[t + 2]);
  adder.commit([...kept, ...strips], replaced);
  return { dropped: drop.size, moved };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const dry = args.includes('--dry');
const files = args.filter((a) => a !== '--dry');

for (const file of files) {
  const glb = readGlb(file);
  const { json } = glb;
  const longest = Math.max(...measureScene(glb).wdhExact);
  const gapWorld = Math.max(GAP, GAP_SHARE * longest);
  const replaced = new Map();
  let dropped = 0, moved = 0;
  for (const prim of editablePrimitives(json)) {
    const result = separate(glb, prim, gapWorld / meshScale(json, prim), replaced);
    dropped += result.dropped;
    moved += result.moved;
  }
  if (!dropped && !moved) continue;
  repack(glb, replaced);
  fixBounds(glb);
  console.log(`${file}: ${dropped} inward twin(s) removed, ${moved} twin(s) separated`);
  if (!dry) writeGlb(file, json, glb.bin, writeFileSync);
}
