import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, faceNormal, fixBounds, welder, editablePrimitives, meshScale, primitiveMatrix, sceneTriangles, vertexAdder } from './mesh-edit.mjs';

const HELP = `cap-holes.mjs [--dry] <workfile.glb> [...]

A hole is a loop of edges that each only one triangle uses. A hole gets a cap
when its corners all lie within 0.1 mm, or 5% of its own size, of one plane and
nothing outside can see into it: every ray from the cap, straight out on
either side and tilted 40° around that, hits the model, or points down from a
hole at ground level. The cap faces away from the triangles around the rim, takes the colour
most rim corners show, and a flat normal. A hole stays open when its rim
branches or crosses itself, or when the cap would lie on an existing face. A primitive that shares an
accessor with another or holds sparse data is left as it is. --dry reports
without writing.`;

const FLAT = 0.0001;
const FLAT_SHARE = 0.05;
const COLOUR_CELLS = [16, 4];
const TILT = (40 * Math.PI) / 180;
const RAYS = 8;
const STARTS = 6;
const GROUND = 0.002;
const GROUND_SHARE = 0.01;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function loopsOf(idx, pos, weld, eps) {
  const uses = new Map();
  const directed = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    if (Math.hypot(...faceNormal(pos, idx[t], idx[t + 1], idx[t + 2])) <= eps * eps) continue;
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k], b = idx[t + (k + 1) % 3];
      const wa = weld(a), wb = weld(b);
      const key = wa < wb ? `${wa},${wb}` : `${wb},${wa}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
      directed.push({ a, b, wa, wb, key });
    }
  }
  const outgoing = new Map();
  for (const e of directed) {
    if (uses.get(e.key) !== 1) continue;
    if (!outgoing.has(e.wa)) outgoing.set(e.wa, []);
    outgoing.get(e.wa).push(e);
  }
  const loops = [];
  const used = new Set();
  for (const [, starts] of outgoing) for (const start of starts) {
    if (used.has(start)) continue;
    const loop = [];
    let e = start;
    let ok = true;
    while (e && !used.has(e)) {
      used.add(e);
      loop.push(e);
      const out = outgoing.get(e.wb) ?? [];
      if (out.length !== 1) { ok = false; break; }
      e = out[0];
    }
    if (ok && e === start && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function triangulate(points, normal) {
  const u = Math.abs(normal[0]) < 0.9 ? cross(normal, [1, 0, 0]) : cross(normal, [0, 1, 0]);
  const ul = Math.hypot(...u);
  const e1 = u.map((c) => c / ul);
  const e2 = cross(normal, e1);
  const flat = points.map((p) => [dot(p, e1), dot(p, e2)]);
  const area2 = (a, b, c) => (flat[b][0] - flat[a][0]) * (flat[c][1] - flat[a][1]) - (flat[b][1] - flat[a][1]) * (flat[c][0] - flat[a][0]);
  const inside = (p, a, b, c) => area2(a, b, p) > 0 && area2(b, c, p) > 0 && area2(c, a, p) > 0;
  const ring = points.map((_, i) => i);
  const out = [];
  let guard = ring.length * ring.length;
  while (ring.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
      if (area2(a, b, c) <= 0) continue;
      if (ring.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push(a, b, c);
      ring.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) return null;
  }
  if (ring.length !== 3 || area2(ring[0], ring[1], ring[2]) <= 0) return null;
  out.push(...ring);
  return out;
}

function onExistingFace(cap, points, normal, tolerance, idx, pos) {
  const at = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const centres = [];
  for (let t = 0; t < cap.length; t += 3) {
    centres.push([0, 1, 2].map((k) => (points[cap[t]][k] + points[cap[t + 1]][k] + points[cap[t + 2]][k]) / 3));
  }
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const [p, q, r] = [at(idx[t]), at(idx[t + 1]), at(idx[t + 2])];
    const n = cross(sub(q, p), sub(r, p));
    const l = Math.hypot(...n);
    if (!l || Math.abs(dot(n, normal)) / l < 0.999) continue;
    for (const c of centres) {
      if (Math.abs(dot(sub(c, p), n)) / l > tolerance) continue;
      const s = [dot(cross(sub(q, p), sub(c, p)), n), dot(cross(sub(r, q), sub(c, q)), n), dot(cross(sub(p, r), sub(c, r)), n)];
      if (s.every((x) => x >= 0) || s.every((x) => x <= 0)) return true;
    }
  }
  return false;
}

function hits(scene, origin, dir) {
  for (let i = 0; i < scene.length; i += 9) {
    const e1 = [scene[i + 3] - scene[i], scene[i + 4] - scene[i + 1], scene[i + 5] - scene[i + 2]];
    const e2 = [scene[i + 6] - scene[i], scene[i + 7] - scene[i + 1], scene[i + 8] - scene[i + 2]];
    const p = cross(dir, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = [origin[0] - scene[i], origin[1] - scene[i + 1], origin[2] - scene[i + 2]];
    const u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    if (dot(e2, q) / det > 0) return true;
  }
  return false;
}

function blocked(scene, points, tris, n, size) {
  const side = Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]);
  const a = side.map((c) => c / Math.hypot(...side));
  const b = cross(n, a);
  const dirs = [n];
  for (let k = 0; k < RAYS; k++) {
    const t = (2 * Math.PI * k) / RAYS;
    dirs.push([0, 1, 2].map((i) => Math.cos(TILT) * n[i] + Math.sin(TILT) * (Math.cos(t) * a[i] + Math.sin(t) * b[i])));
  }
  const starts = [];
  const step = 3 * Math.max(1, Math.ceil(tris.length / 3 / STARTS));
  for (let t = 0; t < tris.length; t += step) {
    starts.push([0, 1, 2].map((i) => (points[tris[t]][i] + points[tris[t + 1]][i] + points[tris[t + 2]][i]) / 3 + n[i] * size * 1e-3));
  }
  const ground = scene.ground;
  return starts.every((o) => dirs.every((d) => (d[1] < 0 && o[1] - ground.y < ground.tolerance) || hits(scene.tris, o, d)));
}

const hidden = (scene, points, tris, n, size) => blocked(scene, points, tris, n, size)
  && blocked(scene, points, tris, n.map((c) => -c), size);

function cap(glb, prim, flatWorld, scene, replaced) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, prim.attributes.TEXCOORD_0) : null;
  const uvScale = uv ? { 5121: 255, 5123: 65535 }[glb.json.accessors[prim.attributes.TEXCOORD_0].componentType] ?? 1 : 1;
  const { eps, weld } = welder(pos);
  const at = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];

  const adder = vertexAdder(glb, prim);
  const added = [];
  let capped = 0, open = 0;
  for (const loop of loopsOf(idx, pos, weld, eps)) {
    const rim = loop.map((e) => e.b).reverse();
    const points = rim.map(at);
    const normal = [0, 0, 0];
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
      normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
      normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const nl = Math.hypot(...normal);
    if (!nl) { open++; continue; }
    const n = normal.map((c) => c / nl);
    const centre = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
    const size = Math.max(...points.map((p) => Math.hypot(...sub(p, centre))));
    const tolerance = Math.max(flatWorld, FLAT_SHARE * size);
    if (points.some((p) => Math.abs(dot(sub(p, centre), n)) > tolerance)) { open++; continue; }
    const tris = triangulate(points, n);
    if (!tris || onExistingFace(tris, points, n, tolerance, idx, pos)) { open++; continue; }
    const m = scene.matrix(prim);
    const toWorld = (p) => [0, 1, 2].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
    const wn = [0, 1, 2].map((i) => m[i] * n[0] + m[4 + i] * n[1] + m[8 + i] * n[2]);
    const wl = Math.hypot(...wn);
    if (!hidden(scene, points.map(toWorld), tris, wn.map((c) => c / wl), size * wl)) { open++; continue; }

    let colourFrom = rim[0];
    if (uv) {
      const cellOf = (v) => {
        const [s, t] = [uv.data[v * 2] / uvScale, uv.data[v * 2 + 1] / uvScale];
        return `${Math.floor(s * COLOUR_CELLS[0])},${Math.floor(t * COLOUR_CELLS[1])}`;
      };
      const counts = new Map();
      for (const v of rim) counts.set(cellOf(v), (counts.get(cellOf(v)) ?? 0) + 1);
      const best = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      colourFrom = rim.find((v) => cellOf(v) === best);
    }
    const corners = rim.map((v) => adder.add(v, {
      ...(prim.attributes.NORMAL !== undefined ? { NORMAL: n } : {}),
      ...(uv ? { TEXCOORD_0: colourFrom } : {}),
    }));
    for (const k of tris) added.push(corners[k]);
    capped++;
  }
  if (!capped) return { capped, open };
  adder.commit([...idx, ...added], replaced);
  return { capped, open };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const dry = args.includes('--dry');
const files = args.filter((a) => a !== '--dry');

for (const file of files) {
  const glb = readGlb(file);
  const { json } = glb;
  const tris = sceneTriangles(glb);
  let low = Infinity, high = -Infinity;
  for (let i = 1; i < tris.length; i += 3) { low = Math.min(low, tris[i]); high = Math.max(high, tris[i]); }
  const scene = { tris, ground: { y: low, tolerance: Math.max(GROUND, GROUND_SHARE * (high - low)) }, matrix: (prim) => primitiveMatrix(json, prim) };
  const replaced = new Map();
  let capped = 0, open = 0;
  for (const prim of editablePrimitives(json)) {
    const result = cap(glb, prim, FLAT / meshScale(json, prim), scene, replaced);
    capped += result.capped;
    open += result.open;
  }
  if (!capped && !open) continue;
  console.log(`${file}: ${capped} hole(s) capped, ${open} left open`);
  if (!capped) continue;
  repack(glb, replaced);
  fixBounds(glb);
  if (!dry) writeGlb(file, json, glb.bin, writeFileSync);
}
