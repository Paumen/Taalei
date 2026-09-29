import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';

const HELP = `restore-normals.mjs [--dry] <workfile.glb> [...]

Replaces a workfile's normals with those of the source model its asset extras
name (taaleiland.bron and bronmodel). The source is first lined up with the
workfile by the axis swap or mirror that shares the most vertex positions. A
corner takes the normal of the same corner in the source; failing that, the
source normal at the nearest point of a source triangle facing within 45° and
lying within 2% of the model's size; failing that, it keeps its own. A model
where more than a fifth of the corners keep their own is left as it is.

Where the colormap V inside a cell follows normal Y, V is set again from the new
normal with the same fit, so the baked light keeps matching the shading; corners
that do not follow it keep their V, and taaleiland.schaduw is removed. --dry
reports without writing.`;

const ROWS = 4;
const UNITS = 1000;
const REACH = 20;
const CELL = 20;
const FACING = Math.cos(Math.PI / 4);
const SAME = Math.cos((2 * Math.PI) / 180);
const SHADE_TOLERANCE = 0.02;

const sources = new Map();
function sourceModel(bron, file) {
  if (!sources.has(bron)) {
    const byKey = new Map();
    for (const kit of BRONKITS.filter((b) => b.naam === bron)) {
      for (const model of bronModellen(kit).modellen) {
        byKey.set(model.naam, model);
        if (!byKey.has(model.bestand)) byKey.set(model.bestand, model);
      }
    }
    sources.set(bron, byKey);
  }
  return sources.get(bron).get(file);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((k) => k / length);
};
const at = (list, i) => [list[i * 3], list[i * 3 + 1], list[i * 3 + 2]];

function cross(a, b, c) {
  const u = [0, 1, 2].map((k) => b[k] - a[k]);
  const v = [0, 1, 2].map((k) => c[k] - a[k]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function frameOf(positions) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], positions[i + k]);
      hi[k] = Math.max(hi[k], positions[i + k]);
    }
  }
  const sides = [0, 1, 2].map((k) => hi[k] - lo[k]);
  return { lo, sides, size: Math.max(...sides) || 1 };
}

const place = (positions, { lo, size }, scale = 1) =>
  Float64Array.from(positions, (v, i) => ((v * scale - lo[i % 3]) / size) * UNITS);

const normalise = (positions) => place(positions, frameOf(positions));
const keyOf = (p) => p.map(Math.round).join(',');

const ORIENTATIONS = [];
for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
  for (let signs = 0; signs < 8; signs++) {
    ORIENTATIONS.push({ order, sign: [0, 1, 2].map((k) => (signs >> k) & 1 ? -1 : 1) });
  }
}
const orient = ({ order, sign }, v) => [0, 1, 2].map((k) => sign[k] * v[order[k]]);

function sourceTriangles(model) {
  const triangles = [];
  for (const p of model.primitieven) {
    for (let t = 0; t + 2 < p.indices.length; t += 3) {
      const corner = [0, 1, 2].map((k) => p.indices[t + k]);
      triangles.push({
        points: corner.map((i) => at(p.posities, i)),
        normals: corner.map((i) => unit(at(p.normalen, i))),
      });
    }
  }
  return triangles;
}

function shared(placed, workKeys) {
  const keys = new Set();
  for (let i = 0; i < placed.length; i += 3) keys.add(keyOf(at(placed, i)));
  let n = 0;
  for (const k of keys) if (workKeys.has(k)) n++;
  return n / keys.size;
}

function vote(placed, work) {
  const counts = new Map();
  const wStep = Math.max(1, Math.floor(work.length / 3 / 32));
  const sStep = Math.max(1, Math.floor(placed.length / 3 / 4000));
  for (let w = 0; w < work.length / 3; w += wStep) {
    for (let s = 0; s < placed.length / 3; s += sStep) {
      const d = [0, 1, 2].map((k) => work[w * 3 + k] - placed[s * 3 + k]);
      const key = keyOf(d);
      const bin = counts.get(key);
      if (bin) { bin.n++; for (let k = 0; k < 3; k++) bin.sum[k] += d[k]; }
      else counts.set(key, { n: 1, sum: [...d] });
    }
  }
  let best = null;
  for (const bin of counts.values()) if (!best || bin.n > best.n) best = bin;
  const offset = best.sum.map((v) => v / best.n);
  return Float64Array.from(placed, (v, i) => v + offset[i % 3]);
}

function lineUp(triangles, work) {
  let best = null;
  const consider = (o, placed) => {
    const score = shared(placed, work.keys);
    if (!best || score > best.score) best = { o, score, placed };
  };
  const oriented = ORIENTATIONS.map((o) => {
    const flat = new Float64Array(triangles.length * 9);
    triangles.forEach((t, n) => t.points.forEach((p, j) => flat.set(orient(o, p), n * 9 + j * 3)));
    consider(o, normalise(flat));
    return { o, flat };
  });
  if (best.score >= 0.5) return best;
  for (const { o, flat } of oriented) {
    const frame = frameOf(flat);
    const fits = [0, 1, 2].every((k) => Math.abs(frame.sides[k] / frame.size - work.frame.sides[k] / work.frame.size) < 0.1);
    if (!fits) continue;
    for (const scale of new Set([1, work.frame.size / frame.size])) consider(o, vote(place(flat, work.frame, scale), work.placed));
  }
  return best;
}

function sourceLookup(triangles, o, placed) {
  const corners = new Map();
  const grid = new Map();
  const list = triangles.map((t, n) => {
    const points = [0, 1, 2].map((j) => at(placed, n * 3 + j));
    const normals = t.normals.map((v) => orient(o, v));
    let face = unit(cross(...points));
    if (dot(face, normals[0]) + dot(face, normals[1]) + dot(face, normals[2]) < 0) face = face.map((v) => -v);
    return { points, normals, face };
  });
  list.forEach((t, n) => {
    const keys = t.points.map(keyOf);
    const triangle = [...keys].sort().join('|');
    keys.forEach((k, j) => corners.set(`${triangle}#${k}`, { normal: t.normals[j], face: t.face }));
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(...t.points.map((p) => p[k])) / CELL));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(...t.points.map((p) => p[k])) / CELL));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const cell = `${x},${y},${z}`;
      if (grid.has(cell)) grid.get(cell).push(n);
      else grid.set(cell, [n]);
    }
  });
  return { list, corners, grid };
}

function closest(p, [a, b, c]) {
  const ab = [0, 1, 2].map((k) => b[k] - a[k]);
  const ac = [0, 1, 2].map((k) => c[k] - a[k]);
  const ap = [0, 1, 2].map((k) => p[k] - a[k]);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = [0, 1, 2].map((k) => p[k] - b[k]);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = [0, 1, 2].map((k) => p[k] - c[k]);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [0, 1 - w, w]; }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return [1 - v - w, v, w];
}

function nearest(lookup, p, face) {
  const cell = p.map((v) => Math.floor(v / CELL));
  const seen = new Set();
  let best = null;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    for (const n of lookup.grid.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      const t = lookup.list[n];
      const facing = dot(t.face, face);
      if (facing < FACING) continue;
      const w = closest(p, t.points);
      const q = [0, 1, 2].map((k) => w[0] * t.points[0][k] + w[1] * t.points[1][k] + w[2] * t.points[2][k]);
      const distance = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (distance > REACH) continue;
      if (!best || distance < best.distance - 1e-6 || (Math.abs(distance - best.distance) <= 1e-6 && facing > best.facing)) {
        best = { distance, facing, normal: unit([0, 1, 2].map((k) => w[0] * t.normals[0][k] + w[1] * t.normals[1][k] + w[2] * t.normals[2][k])) };
      }
    }
  }
  return best?.normal ?? null;
}

function fitShade(corners) {
  const line = (use) => {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const { ny, f } of use) { n++; sx += ny; sy += f; sxx += ny * ny; sxy += ny * f; }
    const d = n * sxx - sx * sx;
    const b = Math.abs(d) < 1e-9 ? 0 : (n * sxy - sx * sy) / d;
    return { a: n ? (sy - b * sx) / n : 0, b };
  };
  let use = corners.filter((c) => c.f !== null);
  let fit = { a: 0, b: 0 };
  for (let round = 0; round < 4 && use.length; round++) {
    fit = line(use);
    use = corners.filter((c) => c.f !== null && Math.abs(fit.a + fit.b * c.ny - c.f) < SHADE_TOLERANCE);
  }
  const share = corners.length ? use.length / corners.length : 0;
  const active = share >= 0.2 && Math.abs(fit.b) >= 0.05;
  for (const c of corners) c.follows = active && c.f !== null && Math.abs(fit.a + fit.b * c.ny - c.f) < SHADE_TOLERANCE;
  return { ...fit, share: active ? share : 0 };
}

const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const TYPE = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' };

function restore(file) {
  const glb = readGlb(file);
  const json = glb.json;
  const origin = json.asset?.extras?.taaleiland;
  if (!origin?.bron || !origin?.bronmodel) return { skip: 'no source named in asset extras' };
  if (json.meshes.length !== 1) return { skip: 'more than one mesh' };
  if (json.skins?.length || json.animations?.length) return { skip: 'skins or animations' };
  const model = sourceModel(origin.bron, origin.bronmodel);
  if (!model) return { skip: `source model ${origin.bronmodel} not found` };
  if (model.primitieven.some((p) => !p.normalen)) return { skip: 'source has no normals' };

  const prims = json.meshes[0].primitives.map((p) => {
    const attrs = Object.fromEntries(Object.entries(p.attributes).map(([k, a]) => [k, readAccessor(glb, a)]));
    const count = attrs.POSITION.count;
    const index = p.indices !== undefined ? readAccessor(glb, p.indices).data : Float64Array.from({ length: count }, (_, i) => i);
    return { p, attrs, index };
  });
  if (prims.some((q) => (q.p.mode ?? 4) !== 4 || !q.attrs.NORMAL)) return { skip: 'primitive without triangles or normals' };
  if (json.images?.some((image) => image.bufferView !== undefined)) return { skip: 'embedded images' };

  const all = new Float64Array(prims.reduce((s, q) => s + q.attrs.POSITION.data.length, 0));
  let offset = 0;
  for (const q of prims) { q.offset = offset / 3; all.set(q.attrs.POSITION.data, offset); offset += q.attrs.POSITION.data.length; }
  const frame = frameOf(all);
  const placedWork = place(all, frame);
  const workKeys = new Set();
  for (let i = 0; i < placedWork.length; i += 3) workKeys.add(keyOf(at(placedWork, i)));

  const triangles = sourceTriangles(model);
  const lined = lineUp(triangles, { keys: workKeys, placed: placedWork, frame });
  if (lined.score < 0.05) return { skip: `source does not line up (${Math.round(lined.score * 100)}% shared)` };
  const lookup = sourceLookup(triangles, lined.o, lined.placed);

  const stats = { corners: 0, same: 0, near: 0, kept: 0, changed: 0 };
  const corners = [];
  for (const q of prims) {
    const nrm = q.attrs.NORMAL.data;
    const uv = q.attrs.TEXCOORD_0?.data;
    q.corners = [];
    for (let t = 0; t + 2 < q.index.length; t += 3) {
      const tri = [0, 1, 2].map((k) => q.index[t + k]);
      const points = tri.map((i) => at(placedWork, q.offset + i));
      const own = tri.map((i) => unit(at(nrm, i)));
      let face = unit(cross(...points));
      if (dot(face, own[0]) + dot(face, own[1]) + dot(face, own[2]) < 0) face = face.map((v) => -v);
      const keys = points.map(keyOf);
      const triangle = [...keys].sort().join('|');
      tri.forEach((i, j) => {
        stats.corners++;
        const exact = lookup.corners.get(`${triangle}#${keys[j]}`);
        let normal = null;
        if (exact && dot(exact.face, face) >= FACING) { normal = exact.normal; stats.same++; }
        else if ((normal = nearest(lookup, points[j], face))) stats.near++;
        else stats.kept++;
        if (normal && dot(normal, face) < 0) normal = normal.map((v) => -v);
        if (normal && dot(normal, own[j]) < SAME) stats.changed++;
        const row = uv ? Math.floor(uv[i * 2 + 1] * ROWS) : 0;
        const c = { i, own: own[j], normal, row, ny: own[j][1], f: uv ? uv[i * 2 + 1] * ROWS - row : null };
        q.corners.push(c);
        corners.push(c);
      });
    }
  }
  if (stats.kept / stats.corners > 0.2) return { skip: `${Math.round((stats.kept / stats.corners) * 100)}% of corners found no source surface` };
  const fit = fitShade(corners);

  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let length = 0;
  const push = (typed, target) => {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = Buffer.alloc((4 - (buf.length % 4)) % 4);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buf.length, target });
    chunks.push(buf, pad);
    length += buf.length + pad.length;
    return bufferViews.length - 1;
  };

  for (const q of prims) {
    const names = Object.keys(q.attrs);
    const vertices = [];
    const index = [];
    const seen = new Map();
    for (const c of q.corners) {
      const normal = c.normal ?? c.own;
      const row = names.map((name) => {
        if (name === 'NORMAL') return normal;
        const a = q.attrs[name];
        const values = Array.from(a.data.subarray(c.i * a.width, (c.i + 1) * a.width));
        if (name === 'TEXCOORD_0' && c.normal && c.follows) values[1] = (c.row + fit.a + fit.b * normal[1]) / ROWS;
        return values;
      });
      const key = row.flat().map((v) => v.toFixed(6)).join(',');
      let n = seen.get(key);
      if (n === undefined) { n = vertices.length; seen.set(key, n); vertices.push(row); }
      index.push(n);
    }
    names.forEach((name, k) => {
      const old = json.accessors[q.p.attributes[name]];
      const width = q.attrs[name].width;
      const data = vertices.flatMap((row) => row[k]);
      const accessor = { bufferView: push(TYPED[old.componentType].from(data), 34962), componentType: old.componentType, count: vertices.length, type: TYPE[width] };
      if (old.normalized) accessor.normalized = true;
      if (name === 'POSITION') {
        accessor.min = [0, 1, 2].map((a) => vertices.reduce((m, r) => Math.min(m, r[k][a]), Infinity));
        accessor.max = [0, 1, 2].map((a) => vertices.reduce((m, r) => Math.max(m, r[k][a]), -Infinity));
      }
      accessors.push(accessor);
      q.p.attributes[name] = accessors.length - 1;
    });
    const big = vertices.length > 65535;
    accessors.push({ bufferView: push(big ? Uint32Array.from(index) : Uint16Array.from(index), 34963), componentType: big ? 5125 : 5123, count: index.length, type: 'SCALAR' });
    q.p.indices = accessors.length - 1;
  }

  json.accessors = accessors;
  json.bufferViews = bufferViews;
  json.buffers = [{ byteLength: length }];
  delete origin.schaduw;
  return { json, bin: Buffer.concat(chunks), stats, fit, score: lined.score };
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const dry = args.includes('--dry');
for (const file of args.filter((a) => a !== '--dry')) {
  const r = restore(file);
  if (r.skip) { console.log(`${file}  skipped: ${r.skip}`); continue; }
  if (!dry) writeGlb(file, r.json, r.bin, writeFileSync);
  const s = r.stats;
  const pct = (n) => Math.round((n / s.corners) * 100);
  console.log(`${file}  lined up ${Math.round(r.score * 100)}%  corners ${s.corners}: same ${pct(s.same)}% near ${pct(s.near)}% kept ${pct(s.kept)}%  changed ${pct(s.changed)}%  shade ${r.fit.share ? `${r.fit.a.toFixed(3)} ${r.fit.b.toFixed(3)} on ${pct(r.fit.share * s.corners)}%` : 'untouched'}`);
}
