import { writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, vec3View, welder, faceNormal, sub, dot, cross, edgeKey } from './mesh-edit.mjs';

const HELP = `backface-fix.mjs [--dry] [--budget <n>] <workfile.glb> [...]

Repairs the faces catalog/tools/backfaces.mjs counts, per primitive:
  flip  winds every shell one way along its shared edges, then turns a closed
        shell outward by its volume and an open one the way most of its faces were.
        A normal that ends up against all its faces is turned round.
  cap   fills flat open outlines, points in line dropped, most area per triangle
        first, while the model's added triangles stay within --budget (11).
        An outline of more than 13 points gets a plate over its convex hull cut
        to 13 corners instead. A flat open sheet gets one plate over its outer
        outline, just behind it. A cap takes the colour most of its outline has,
        and is left out where it would double a face.
--dry reports without writing.`;


const norm = (v) => {
  const l = Math.hypot(...v);
  return l > 1e-20 ? v.map((x) => x / l) : [0, 0, 0];
};

function earclip(points) {
  const area = points.reduce((s, p, i) => {
    const q = points[(i + 1) % points.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const left = points.map((_, i) => i);
  if (area < 0) left.reverse();
  const tris = [];
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => turn(a, b, p) >= 0 && turn(b, c, p) >= 0 && turn(c, a, p) >= 0;
  let guard = left.length * left.length;
  while (left.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < left.length; i++) {
      const [ia, ib, ic] = [left[(i + left.length - 1) % left.length], left[i], left[(i + 1) % left.length]];
      const [a, b, c] = [points[ia], points[ib], points[ic]];
      if (turn(a, b, c) <= 0) continue;
      if (left.some((j) => j !== ia && j !== ib && j !== ic && inside(points[j], a, b, c))) continue;
      tris.push([ia, ib, ic]);
      left.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) return null;
  }
  if (left.length === 3) tris.push(left.slice());
  return tris;
}

function hull(points) {
  const order = points.map((p, i) => i).sort((a, b) => points[a][0] - points[b][0] || points[a][1] - points[b][1]);
  const turn = (o, a, b) => (points[a][0] - points[o][0]) * (points[b][1] - points[o][1]) - (points[a][1] - points[o][1]) * (points[b][0] - points[o][0]);
  const half = (list) => {
    const out = [];
    for (const i of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], i) <= 0) out.pop();
      out.push(i);
    }
    out.pop();
    return out;
  };
  return [...half(order), ...half(order.slice().reverse())].map((i) => points[i]);
}

const area2 = (poly) => poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

function enclose(poly, most) {
  const out = poly.slice();
  const meet = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-18) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
    return t > 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
  };
  while (out.length > most) {
    let best = null;
    for (let i = 0; i < out.length; i++) {
      const n = out.length;
      const [a, b, c, d] = [out[(i + n - 1) % n], out[i], out[(i + 1) % n], out[(i + 2) % n]];
      const x = meet(a, b, d, c);
      if (!x) continue;
      const grow = Math.abs(area2([b, x, c]));
      if (!best || grow < best.grow) best = { i, x, grow };
    }
    if (!best) return null;
    const n = out.length;
    out.splice(best.i, 1, best.x);
    out.splice((best.i + 1) % n > best.i ? best.i + 1 : 0, 1);
  }
  return out;
}

function shells(count, idx, id) {
  const edges = new Map();
  for (let t = 0; t < count; t++) for (let e = 0; e < 3; e++) {
    const p = id[idx[t * 3 + e]], q = id[idx[t * 3 + (e + 1) % 3]];
    if (p === q) continue;
    const key = edgeKey(p, q);
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([t, p < q ? 1 : -1]);
  }
  const next = Array.from({ length: count }, () => []);
  for (const list of edges.values()) if (list.length === 2) {
    const [[s, ds], [t, dt]] = list;
    next[s].push([t, ds === dt]);
    next[t].push([s, ds === dt]);
  }
  const shell = new Int32Array(count).fill(-1);
  const flip = new Uint8Array(count);
  const groups = [];
  for (let seed = 0; seed < count; seed++) {
    if (shell[seed] >= 0) continue;
    const members = [seed];
    shell[seed] = groups.length;
    for (let k = 0; k < members.length; k++) {
      const s = members[k];
      for (const [t, same] of next[s]) {
        if (shell[t] >= 0) continue;
        shell[t] = groups.length;
        flip[t] = same ? 1 - flip[s] : flip[s];
        members.push(t);
      }
    }
    groups.push(members);
  }
  return { edges, shell, flip, groups };
}

function fixPrimitive(glb, prim, replaced) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(glb, prim.attributes.NORMAL).data : null;
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const count = idx.length / 3;
  const { weld } = welder(pos);
  const id = Array.from({ length: pos.length / 3 }, (_, v) => weld(v));
  const at = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const normalAt = (v) => (nrm ? [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]] : [0, 0, 0]);
  const report = { flipped: 0, normals: 0, capped: 0, added: 0, open: 0 };

  const { flip, groups } = shells(count, idx, id);
  const turnTri = (t) => { [idx[t * 3 + 1], idx[t * 3 + 2]] = [idx[t * 3 + 2], idx[t * 3 + 1]]; };
  for (let t = 0; t < count; t++) if (flip[t]) turnTri(t);

  const used = new Map();
  for (let t = 0; t < count; t++) for (let e = 0; e < 3; e++) {
    const key = edgeKey(id[idx[t * 3 + e]], id[idx[t * 3 + (e + 1) % 3]]);
    used.set(key, (used.get(key) ?? 0) + 1);
  }
  const openEdges = (members) => {
    const list = [];
    for (const t of members) for (let e = 0; e < 3; e++) {
      const a = idx[t * 3 + e], b = idx[t * 3 + (e + 1) % 3];
      if (id[a] !== id[b] && used.get(edgeKey(id[a], id[b])) === 1) list.push([a, b]);
    }
    return list;
  };

  const openShells = [];
  for (const members of groups) {
    let score = 0;
    const closed = !openEdges(members).length;
    for (const t of members) {
      const corners = [0, 1, 2].map((e) => idx[t * 3 + e]);
      if (closed) score += dot(at(corners[0]), cross(at(corners[1]), at(corners[2])));
      else score += flip[t] ? -1 : 1;
    }
    if (score < 0) for (const t of members) { turnTri(t); flip[t] ^= 1; }
    for (const t of members) if (flip[t]) report.flipped++;
    if (!closed) openShells.push({ members, open: openEdges(members) });
  }

  if (nrm) {
    const against = new Map();
    for (let t = 0; t < count; t++) {
      const n = faceNormal(pos, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
      for (let e = 0; e < 3; e++) {
        const v = idx[t * 3 + e];
        against.set(v, (against.get(v) ?? true) && dot(n, normalAt(v)) < 0);
      }
    }
    const row = vec3View(glb, prim.attributes.NORMAL);
    for (const [v, turn] of against) if (turn) {
      const r = row(v);
      for (let k = 0; k < 3; k++) r[k] = nrm[v * 3 + k] = -nrm[v * 3 + k];
      report.normals++;
    }
  }

  const adder = vertexAdder(glb, prim);
  const extra = [];
  const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, prim.attributes.TEXCOORD_0).data : null;
  const cellOf = (v) => (uv ? `${Math.floor(uv[v * 2] * 16)},${Math.floor(uv[v * 2 + 1] * 4)}` : '');
  const inside = ([x, y], poly) => poly.reduce((hit, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return (p[1] > y) !== (q[1] > y) && x < p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]) ? !hit : hit;
  }, false);
  const doubles = (corners, n, u, w, size) => {
    const flat2 = corners.map((p) => [dot(p, u), dot(p, w)]);
    for (let t = 0; t < count; t++) {
      const c = [0, 1, 2].map((e) => at(idx[t * 3 + e]));
      const fn = norm(cross(sub(c[1], c[0]), sub(c[2], c[0])));
      if (Math.abs(dot(fn, n)) < 0.999) continue;
      const mid = c.reduce((m, p) => m.map((x, k) => x + p[k] / 3), [0, 0, 0]);
      if (Math.abs(dot(sub(mid, corners[0]), n)) > 1e-3 * size) continue;
      if (inside([dot(mid, u), dot(mid, w)], flat2)) return true;
    }
    return false;
  };

  const loops = (open) => {
    const out = new Map();
    for (const [a, b] of open) out.set(id[a], [a, b]);
    const seen = new Set();
    const result = [];
    for (const [start] of out) {
      if (seen.has(start)) continue;
      const loop = [];
      let w = start;
      while (out.has(w) && !seen.has(w)) {
        seen.add(w);
        const [a, b] = out.get(w);
        loop.push(a);
        w = id[b];
      }
      if (w === start && loop.length >= 3) result.push(loop);
    }
    return result;
  };

  const straight = (ring) => ring.filter((v, i) => {
    const p = at(ring[(i + ring.length - 1) % ring.length]), q = at(v), r = at(ring[(i + 1) % ring.length]);
    const a = sub(q, p), b = sub(r, q);
    return Math.hypot(...cross(a, b)) > 0.01 * Math.hypot(...a) * Math.hypot(...b);
  });

  const plan = (loop, members) => {
    const ring = straight(loop.slice().reverse());
    if (ring.length < 3) return null;
    const pts = ring.map(at);
    let n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      n = [n[0] + (p[1] - q[1]) * (p[2] + q[2]), n[1] + (p[2] - q[2]) * (p[0] + q[0]), n[2] + (p[0] - q[0]) * (p[1] + q[1])];
    }
    const area = Math.hypot(...n) / 2;
    n = norm(n);
    if (!area) return null;
    const origin = pts.reduce((c, p) => c.map((x, k) => x + p[k] / pts.length), [0, 0, 0]);
    const size = Math.max(...pts.map((p) => Math.hypot(...sub(p, origin)))) * 2;
    const depths = members.flatMap((t) => [0, 1, 2].map((e) => dot(sub(at(idx[t * 3 + e]), origin), n)));
    const flat = Math.max(...depths) - Math.min(...depths) < 0.1 * size;
    const lift = flat ? Math.max(...depths) + 0.002 * size : 0;
    const u = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
    const w = cross(n, u);
    const flatPts = pts.map((p) => [dot(sub(p, origin), u), dot(sub(p, origin), w)]);
    const to3 = ([x, y]) => [0, 1, 2].map((k) => origin[k] + u[k] * x + w[k] * y + n[k] * lift);

    if (Math.max(...pts.map((p) => Math.abs(dot(sub(p, origin), n)))) > 0.05 * size) return null;
    let corners;
    if (ring.length <= 13 && earclip(flatPts)) {
      corners = flat ? pts.map((p) => p.map((x, k) => x + (lift - dot(sub(p, origin), n)) * n[k])) : pts;
    } else {
      const outline = hull(flatPts);
      if (flat && area2(outline) > 1.15 * area) return null;
      const plate = enclose(outline, 13);
      if (!plate || area2(plate) > 1.05 * area2(outline)) return null;
      corners = plate.map(to3);
    }
    const tris = earclip(corners.map((p) => [dot(p, u), dot(p, w)]));
    if (!tris || doubles(corners, n, u, w, size)) return null;
    const cells = new Map();
    for (const v of ring) cells.set(cellOf(v), [...(cells.get(cellOf(v)) ?? []), v]);
    const paint = [...cells.values()].sort((a, b) => b.length - a.length)[0][0];
    return {
      flat, area, tris: tris.length,
      apply() {
        const copies = corners.map((p) => adder.add(paint, nrm ? { POSITION: p, NORMAL: n } : { POSITION: p }));
        for (const [a, b, c] of tris) {
          const face = cross(sub(corners[b], corners[a]), sub(corners[c], corners[a]));
          extra.push(...(dot(face, n) >= 0 ? [copies[a], copies[b], copies[c]] : [copies[a], copies[c], copies[b]]));
        }
        report.capped++;
        report.added += tris.length;
      },
    };
  };

  const caps = [];
  for (const s of openShells) {
    const found = loops(s.open).map((loop) => plan(loop, s.members)).filter(Boolean);
    const sheet = found.filter((c) => c.flat).sort((a, b) => b.area - a.area)[0];
    caps.push(...found.filter((c) => !c.flat), ...(sheet ? [sheet] : []));
  }
  report.open = openShells.length;
  return { report, caps, commit: () => adder.commit(idx.concat(extra), replaced) };
}

function fix(file, { dry, budget }) {
  const glb = readGlb(file);
  const key = `${basename(dirname(resolve(file)))}/${basename(file, '.glb')}`;
  const replaced = new Map();
  const parts = editablePrimitives(glb.json).map((prim) => fixPrimitive(glb, prim, replaced));
  let left = budget;
  for (const c of parts.flatMap((p) => p.caps).sort((a, b) => b.area / b.tris - a.area / a.tris)) {
    if (c.tris > left) continue;
    c.apply();
    left -= c.tris;
  }
  for (const p of parts) p.commit();
  const total = { flipped: 0, normals: 0, capped: 0, added: 0, open: 0 };
  for (const p of parts) for (const k of Object.keys(total)) total[k] += p.report[k] ?? 0;
  if (!dry) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  console.log(`${key}: ${total.flipped} faces flipped, ${total.normals} normals turned, `
    + `${total.capped} outlines capped, ${total.added} triangles added, ${total.open} open shells`);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = { dry: false, budget: 11 };
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dry') options.dry = true;
  else if (argv[i] === '--budget') options.budget = Number(argv[++i]);
  else files.push(argv[i]);
}
for (const file of files) fix(file, options);
