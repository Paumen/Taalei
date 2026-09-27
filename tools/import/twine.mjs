import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, measureTubes, worldMatrices, symmetricEigen } from '../../catalog/tools/glb.mjs';

const HELP = `twine.mjs [--from <band>] [--min <diameter>] [--parts <all|n,n>] [--list] <workfile.glb> [...]

Moves rope on the --from band (default taupe) onto the twine band and unwraps it so the
diagonal stripes of twine wind round it. Only triangles wholly on --from move, and each
gets its own vertices, shifted by whole stripe periods to stay inside the cell.

Without --parts it takes every round tube at least --min thick (default 0.02), with
u running around the strand and v along it.

--parts takes the --from triangles welded into parts instead, numbered as --list prints
them. A flat round part with a hole, such as a wrap or ring round a post, is unwrapped
around its hole and across its height. Otherwise a strand at least 2.5 times as long as
it is thick is unwrapped around and along its centre line: a straight one along its main
axis, a bent one (coil, loop, fuse) along the line through its cross-sections. Any other
part is projected face by face along its facing axis.

--list prints what it would move and changes nothing.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { bands } = JSON.parse(readFileSync(resolve(ROOT, 'lint/materials.json'), 'utf8'));

const ATLAS = 512, COLUMNS = 16, ROWS = 4;
const CELL_W = ATLAS / COLUMNS, CELL_H = ATLAS / ROWS;
const PERIOD = 8, AROUND = 16, INSET = 4, SLICES = 8, LONG = 2.5;
const BOX_THICK = [0.02, 0.06];

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function cellAt(uv, v) {
  const u = uv[v * 2] - Math.floor(uv[v * 2]), w = uv[v * 2 + 1] - Math.floor(uv[v * 2 + 1]);
  return `${Math.min(COLUMNS - 1, Math.floor(u * COLUMNS))},${Math.min(ROWS - 1, Math.floor(w * ROWS))}`;
}

function majorityCell(uv, vertices) {
  const count = new Map();
  for (const v of new Set(vertices)) {
    const k = cellAt(uv, v);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
}

function ringAt(rings, t) {
  if (t <= rings[0].t) return rings[0];
  const last = rings[rings.length - 1];
  if (t >= last.t) return last;
  const i = rings.findIndex((r) => r.t >= t);
  const a = rings[i - 1], b = rings[i];
  const f = (t - a.t) / (b.t - a.t);
  return { cu: a.cu + (b.cu - a.cu) * f, cw: a.cw + (b.cw - a.cw) * f };
}

function arcLength(rings) {
  const along = [0];
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1], b = rings[i];
    along.push(along[i - 1] + Math.hypot(b.t - a.t, b.cu - a.cu, b.cw - a.cw));
  }
  return (t) => {
    if (rings.length < 2) return t;
    let i = rings.findIndex((r) => r.t >= t);
    if (i <= 0) i = rings.length > 1 && t > rings[rings.length - 1].t ? rings.length - 1 : 1;
    const a = rings[i - 1], b = rings[i];
    const f = (t - a.t) / (b.t - a.t);
    return along[i - 1] + (along[i] - along[i - 1]) * f;
  };
}

function linearOf(json) {
  const world = worldMatrices(json);
  const out = new Map();
  (json.nodes ?? []).forEach((node, i) => {
    if (node.mesh === undefined || out.has(node.mesh) || !world[i]) return;
    const m = world[i];
    out.set(node.mesh, node.skin === undefined ? [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]] : [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
  const meshOf = new Map();
  (json.meshes ?? []).forEach((mesh, i) => { for (const prim of mesh.primitives ?? []) meshOf.set(prim, i); });
  return (prim) => out.get(meshOf.get(prim)) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

const apply = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[k + 3] * p[1] + m[k + 6] * p[2]);

function axisMapper(frame, diameter, point) {
  const { center, axis, u, w, rings } = frame;
  const arc = arcLength(rings);
  const along = AROUND / (Math.PI * diameter);
  const place = (v) => {
    const d = sub(point(v), center);
    const t = dot(d, axis);
    const { cu, cw } = ringAt(rings, t);
    const turn = Math.atan2(dot(d, w) - cw, dot(d, u) - cu) / (2 * Math.PI);
    return { around: (turn - Math.floor(turn)) * AROUND, s: arc(t) };
  };
  return (tri) => {
    const c = tri.map(place);
    const us = c.map((x) => x.around + AROUND * Math.round((c[0].around - x.around) / AROUND));
    return { us, vs: c.map((x) => x.s * along) };
  };
}

function ringMapper(center, normal, radius, height, point) {
  const t = Math.min(BOX_THICK[1], Math.max(BOX_THICK[0], height));
  const across = AROUND / (Math.PI * t);
  const circle = 2 * Math.PI * radius;
  const round = Math.max(PERIOD, PERIOD * Math.round((circle * across) / PERIOD));
  const [a, b] = Math.abs(normal[0]) < 0.9 ? [[1, 0, 0]] : [[0, 1, 0]];
  const e1 = cross(normal, a).map((x, _, v) => x / Math.hypot(...v));
  const e2 = cross(normal, e1);
  const place = (v) => {
    const d = sub(point(v), center);
    const turn = Math.atan2(dot(d, e2), dot(d, e1)) / (2 * Math.PI);
    return { around: (turn - Math.floor(turn)) * round, h: dot(d, normal) * across };
  };
  return (tri) => {
    const c = tri.map(place);
    return { us: c.map((x) => x.h), vs: c.map((x) => x.around + round * Math.round((c[0].around - x.around) / round)) };
  };
}

function boxMapper(thick, point) {
  const scale = AROUND / (Math.PI * Math.min(BOX_THICK[1], Math.max(BOX_THICK[0], thick)));
  return (tri) => {
    const p = tri.map(point);
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0])).map(Math.abs);
    const facing = n.indexOf(Math.max(...n));
    const [a, b] = [0, 1, 2].filter((k) => k !== facing);
    const spanOf = (k) => Math.max(...p.map((x) => x[k])) - Math.min(...p.map((x) => x[k]));
    const [across, along] = spanOf(a) <= spanOf(b) ? [a, b] : [b, a];
    return { us: p.map((x) => x[across] * scale), vs: p.map((x) => x[along] * scale) };
  };
}

function frameOf(points) {
  const center = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += (p[i] - center[i]) * (p[j] - center[j]);
  const eigen = symmetricEigen(cov);
  const [{ vector: axis }, { vector: u }, { vector: w }] = eigen;
  const local = points.map((p) => { const d = sub(p, center); return [dot(d, axis), dot(d, u), dot(d, w)]; });
  const tMin = Math.min(...local.map((l) => l[0]));
  const span = Math.max(...local.map((l) => l[0])) - tMin;
  const slices = Array.from({ length: SLICES }, () => []);
  for (const l of local) slices[Math.min(SLICES - 1, Math.floor((l[0] - tMin) / (span || 1) * SLICES))].push(l);
  const rings = [];
  const radii = [];
  for (const slice of slices) {
    if (slice.length < 3) continue;
    const cu = slice.reduce((s, l) => s + l[1], 0) / slice.length;
    const cw = slice.reduce((s, l) => s + l[2], 0) / slice.length;
    rings.push({ t: slice.reduce((s, l) => s + l[0], 0) / slice.length, cu, cw });
    for (const l of slice) radii.push(Math.hypot(l[1] - cu, l[2] - cw));
  }
  radii.sort((a, b) => a - b);
  const diameter = 2 * (radii[Math.floor(radii.length / 2)] ?? 0);
  const flat = local.map((l) => Math.hypot(l[0], l[1]));
  const reach = Math.max(...flat);
  const heights = local.map((l) => l[2]);
  const rim = flat.filter((f) => f > 0.35 * reach).sort((a, b) => a - b);
  const height = Math.max(...heights) - Math.min(...heights);
  const ring = eigen[1].value > 0.5 * eigen[0].value && height < reach && flat.length - rim.length <= Math.max(2, 0.1 * flat.length)
    ? { center, normal: w, radius: rim[Math.floor(rim.length / 2)], height }
    : null;
  return { frame: { center, axis, u, w, rings }, span, diameter, ring };
}

function centreLine(ts, idx, key, point, reference) {
  const at = new Map();
  const pts = [];
  const id = (v) => { const k = key(v); if (!at.has(k)) { at.set(k, pts.length); pts.push(point(v)); } return at.get(k); };
  const faces = ts.map((t) => [0, 1, 2].map((j) => id(idx[t * 3 + j])));
  const near = pts.map(() => new Map());
  let area = 0, volume = 0;
  for (const [a, b, c] of faces) {
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const d = Math.hypot(...sub(pts[x], pts[y]));
      near[x].set(y, d); near[y].set(x, d);
    }
    const n = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]));
    area += Math.hypot(...n) / 2;
    volume += dot(pts[a], cross(pts[b], pts[c])) / 6;
  }
  const diameter = (4 * Math.abs(volume)) / area;
  if (!(diameter > 0)) return null;
  const within = (from, reach) => {
    const dist = new Map([[from, 0]]);
    const open = [from];
    while (open.length) {
      open.sort((a, b) => dist.get(b) - dist.get(a));
      const i = open.pop();
      for (const [j, w] of near[i]) {
        const d = dist.get(i) + w;
        if (d <= reach && d < (dist.get(j) ?? Infinity)) { dist.set(j, d); open.push(j); }
      }
    }
    return [...dist.keys()];
  };
  const ball = pts.map((_, i) => within(i, diameter));
  const mean = (list, of) => [0, 1, 2].map((k) => list.reduce((s, j) => s + of[j][k], 0) / list.length);
  let centre = ball.map((b) => mean(b, pts));
  centre = ball.map((b) => mean(b, centre));
  const walk = (from) => {
    const dist = pts.map(() => Infinity);
    dist[from] = 0;
    const open = [from];
    while (open.length) {
      open.sort((a, b) => dist[b] - dist[a]);
      const i = open.pop();
      for (const j of near[i].keys()) {
        const d = dist[i] + Math.hypot(...sub(centre[i], centre[j]));
        if (d < dist[j]) { dist[j] = d; open.push(j); }
      }
    }
    return dist;
  };
  const first = walk(0);
  const end = first.indexOf(Math.max(...first.filter(Number.isFinite)));
  const along = walk(end);
  const length = Math.max(...along.filter(Number.isFinite));
  const tangent = pts.map((_, i) => {
    const t = [0, 0, 0];
    for (const j of ball[i]) for (const m of near[j].keys()) {
      const step = sub(centre[m], centre[j]);
      const sign = Math.sign(along[m] - along[j]);
      for (let k = 0; k < 3; k++) t[k] += step[k] * sign;
    }
    const l = Math.hypot(...t);
    return l ? t.map((x) => x / l) : reference;
  });
  const place = (v) => {
    const i = at.get(key(v));
    const t = tangent[i];
    let n = sub(reference, t.map((x) => x * dot(reference, t)));
    if (Math.hypot(...n) < 1e-6) n = Math.abs(t[0]) < 0.9 ? cross(t, [1, 0, 0]) : cross(t, [0, 1, 0]);
    n = n.map((x, _, a) => x / Math.hypot(...a));
    const b = cross(t, n);
    const d = sub(pts[i], centre[i]);
    const turn = Math.atan2(dot(d, b), dot(d, n)) / (2 * Math.PI);
    return { around: (turn - Math.floor(turn)) * AROUND, s: along[i] };
  };
  const scale = AROUND / (Math.PI * diameter);
  return {
    diameter, length,
    map: (tri) => {
      const c = tri.map(place);
      const us = c.map((x) => x.around + AROUND * Math.round((c[0].around - x.around) / AROUND));
      return { us, vs: c.map((x) => x.s * scale) };
    },
  };
}

function partsOf(glb, prim, uv, source, point) {
  const idx = readAccessor(glb, prim.indices).data;
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const key = (v) => [0, 1, 2].map((k) => Math.round(pos[v * 3 + k] * 1e4)).join(',');
  const tris = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    if (tri.every((v) => cellAt(uv, v) === source)) tris.push(i / 3);
  }
  const parent = new Map();
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
  for (const t of tris) {
    const ks = [0, 1, 2].map((j) => key(idx[t * 3 + j]));
    ks.forEach(add);
    for (const k of ks.slice(1)) { const a = find(ks[0]), b = find(k); if (a !== b) parent.set(b, a); }
  }
  const byRoot = new Map();
  for (const t of tris) {
    const r = find(key(idx[t * 3]));
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(t);
  }
  return [...byRoot.values()].map((ts) => {
    const vertices = new Set(ts.flatMap((t) => [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]));
    const points = [...new Map([...vertices].map((v) => [key(v), point(v)])).values()];
    const { frame, span, diameter, ring } = frameOf(points);
    const lo = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
    const hi = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
    const thick = Math.min(...[0, 1, 2].map((k) => hi[k] - lo[k]));
    const base = { prim, tris: new Set(ts), span, lo, hi };
    if (ring) return { ...base, kind: 'ring', diameter: ring.height, map: ringMapper(ring.center, ring.normal, ring.radius, ring.height, point) };
    const curve = centreLine(ts, idx, key, point, frame.w);
    const bend = frame.rings.length >= 2 ? Math.max(...frame.rings.map((r) => Math.hypot(r.cu, r.cw))) : Infinity;
    const straight = diameter > 0 && bend <= diameter && (!curve || diameter <= 1.5 * curve.diameter);
    if (straight && span >= LONG * diameter) return { ...base, kind: 'axis', diameter, map: axisMapper(frame, diameter, point) };
    if (curve && curve.length >= LONG * curve.diameter) return { ...base, kind: 'bent', diameter: curve.diameter, span: curve.length, map: curve.map };
    return { ...base, kind: 'box', diameter: thick, map: boxMapper(thick, point) };
  });
}

function fit(values, low, high) {
  const shift = PERIOD * Math.ceil((low - Math.min(...values)) / PERIOD);
  const out = values.map((x) => x + shift);
  return Math.max(...out) <= high ? out : null;
}

function squeeze(values, low, high) {
  let out = null;
  let f = 1;
  const base = Math.min(...values);
  while (!(out = fit(values.map((x) => base + (x - base) * f), low, high))) f *= 0.9;
  return { out, squeezed: f < 1 };
}

function unwrap(glb, prim, jobs, twine) {
  const { json } = glb;
  const x0 = twine[0] * CELL_W, y0 = twine[1] * CELL_H;
  const jobOf = new Map();
  jobs.forEach((job) => { for (const t of job.tris) jobOf.set(t, job); });
  const idx = readAccessor(glb, prim.indices).data;
  const attributes = Object.entries(prim.attributes).map(([name, a]) => ({ name, ...readAccessor(glb, a), accessor: json.accessors[a] }));
  const uvAttr = attributes.find((a) => a.name === 'TEXCOORD_0');
  if (uvAttr.accessor.componentType !== 5126) {
    const top = { 5121: 255, 5123: 65535 }[uvAttr.accessor.componentType];
    if (!uvAttr.accessor.normalized || !top) throw new Error('unsupported TEXCOORD_0 encoding');
    uvAttr.data = uvAttr.data.map((x) => x / top);
  }
  const uvSlot = attributes.indexOf(uvAttr);
  const out = attributes.map(() => []);
  const reuse = new Map();
  const copy = (v) => { attributes.forEach((a, k) => { for (let j = 0; j < a.width; j++) out[k].push(a.data[v * a.width + j]); }); return out[0].length / attributes[0].width - 1; };
  const indices = [];
  const squeezed = new Set();
  let moved = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    const job = jobOf.get(i / 3);
    if (!job) {
      for (const v of tri) { if (!reuse.has(v)) reuse.set(v, copy(v)); indices.push(reuse.get(v)); }
      continue;
    }
    const { us, vs } = job.map(tri);
    const u = squeeze(us, x0 + INSET, x0 + CELL_W - INSET);
    const w = squeeze(vs, y0 + INSET, y0 + CELL_H - INSET);
    if (u.squeezed || w.squeezed) squeezed.add(job);
    tri.forEach((v, k) => {
      const n = copy(v);
      out[uvSlot][n * 2] = u.out[k] / ATLAS;
      out[uvSlot][n * 2 + 1] = w.out[k] / ATLAS;
      indices.push(n);
    });
    moved++;
  }
  attributes.forEach((a, k) => {
    const accessor = { componentType: a.accessor.componentType, count: out[k].length / a.width, type: a.accessor.type };
    if (a.name === 'TEXCOORD_0') accessor.componentType = 5126;
    if (a.accessor.normalized && accessor.componentType !== 5126) accessor.normalized = true;
    if (a.name === 'POSITION') {
      accessor.min = [0, 1, 2].map((j) => Math.min(...out[k].filter((_, i) => i % 3 === j)));
      accessor.max = [0, 1, 2].map((j) => Math.max(...out[k].filter((_, i) => i % 3 === j)));
    }
    json.accessors.push({ ...accessor, data: out[k] });
    prim.attributes[a.name] = json.accessors.length - 1;
  });
  const vertexCount = out[0].length / attributes[0].width;
  json.accessors.push({ componentType: vertexCount > 65535 ? 5125 : 5123, count: indices.length, type: 'SCALAR', data: indices });
  prim.indices = json.accessors.length - 1;
  return { moved, squeezed: squeezed.size };
}

function repack(glb) {
  const { json } = glb;
  const used = new Set();
  const refs = [];
  const ref = (holder, key) => { if (holder[key] !== undefined) { used.add(holder[key]); refs.push([holder, key]); } };
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives ?? []) {
    for (const k of Object.keys(prim.attributes)) ref(prim.attributes, k);
    ref(prim, 'indices');
    for (const target of prim.targets ?? []) for (const k of Object.keys(target)) ref(target, k);
  }
  for (const skin of json.skins ?? []) ref(skin, 'inverseBindMatrices');
  for (const anim of json.animations ?? []) for (const s of anim.samplers ?? []) { ref(s, 'input'); ref(s, 'output'); }
  const keep = [...used].sort((a, b) => a - b);
  const remap = new Map(keep.map((a, i) => [a, i]));
  const chunks = [];
  let offset = 0;
  const views = [];
  const push = (bytes) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    chunks.push(bytes);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    offset += bytes.length;
    return views.length - 1;
  };
  const accessors = keep.map((a) => {
    const acc = json.accessors[a];
    const data = acc.data ?? readAccessor(glb, a).data;
    const typed = COMPONENT[acc.componentType].from(data);
    const { data: _, byteOffset, bufferView, ...rest } = acc;
    return { ...rest, bufferView: push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)) };
  });
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue;
    const view = json.bufferViews[image.bufferView];
    image.bufferView = push(Buffer.from(glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)));
  }
  for (const [holder, key] of refs) holder[key] = remap.get(holder[key]);
  json.accessors = accessors;
  json.bufferViews = views;
  const bin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: bin.length }];
  glb.bin = bin;
}

function tubeJobs(glb, source, min, linear) {
  const jobs = [];
  for (const t of measureTubes(glb)) {
    if (t.prim.attributes.TEXCOORD_0 === undefined || t.diameter < min) continue;
    const uv = readAccessor(glb, t.prim.attributes.TEXCOORD_0).data;
    if (majorityCell(uv, t.vertices) !== source) continue;
    const pos = readAccessor(glb, t.prim.attributes.POSITION).data;
    const m = linear(t.prim);
    const point = (v) => apply(m, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
    const own = new Set(t.vertices);
    const idx = readAccessor(glb, t.prim.indices).data;
    const tris = new Set();
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const tri = [idx[i], idx[i + 1], idx[i + 2]];
      if (tri.every((v) => own.has(v) && cellAt(uv, v) === source)) tris.add(i / 3);
    }
    jobs.push({ prim: t.prim, tris, label: `tube  diameter ${t.diameter.toFixed(4)}  length ${t.length.toFixed(3)}`, map: axisMapper(t.frame, t.diameter, point) });
  }
  return jobs;
}

function partJobs(glb, source, linear) {
  const jobs = [];
  for (const mesh of glb.json.meshes ?? []) for (const prim of mesh.primitives ?? []) {
    if (prim.attributes.TEXCOORD_0 === undefined || prim.indices === undefined || (prim.mode ?? 4) !== 4) continue;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const m = linear(prim);
    const point = (v) => apply(m, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
    for (const part of partsOf(glb, prim, uv, source, point)) {
      const f = (x) => x.map((c) => c.toFixed(2)).join(' ');
      part.label = `${String(part.tris.size).padStart(5)} tris  ${part.kind.padEnd(4)}  thick ${part.diameter.toFixed(3)}  long ${part.span.toFixed(3)}  [${f(part.lo)}] - [${f(part.hi)}]`;
      jobs.push(part);
    }
  }
  return jobs;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let from = 'taupe', min = 0.02, list = false, parts = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from') from = args[++i];
  else if (args[i] === '--min') min = Number(args[++i]);
  else if (args[i] === '--parts') parts = args[++i];
  else if (args[i] === '--list') list = true;
  else files.push(args[i]);
}
if (!bands[from] || !bands.twine) throw new Error(`unknown band: ${bands[from] ? 'twine' : from}`);
if (!(min >= 0 && Number.isFinite(min))) throw new Error('--min needs a number');
const pick = parts === null || parts === 'all' ? null : new Set(parts.split(',').map(Number));
if (pick && [...pick].some((n) => !(n >= 1 && Number.isInteger(n)))) throw new Error('--parts needs all or part numbers');
const source = bands[from];
const twine = bands.twine.split(',').map(Number);

for (const file of files) {
  const glb = readGlb(file);
  glb.bin = Buffer.from(glb.bin);
  const linear = linearOf(glb.json);
  const all = parts === null ? tubeJobs(glb, source, min, linear) : partJobs(glb, source, linear);
  all.forEach((job, i) => console.log(`${file}  ${parts === null ? '' : `part ${i + 1}  `}${job.label}`));
  const jobs = all.filter((_, i) => !pick || pick.has(i + 1));
  if (pick && jobs.length !== pick.size) throw new Error(`${file}: has ${all.length} part(s)`);
  if (list || !jobs.length) continue;
  const byPrim = new Map();
  for (const job of jobs) { if (!byPrim.has(job.prim)) byPrim.set(job.prim, []); byPrim.get(job.prim).push(job); }
  let moved = 0, squeezed = 0;
  for (const [prim, group] of byPrim) {
    const r = unwrap(glb, prim, group, twine);
    moved += r.moved; squeezed += r.squeezed;
  }
  repack(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(`${file}: ${jobs.length} ${parts === null ? 'tube' : 'part'}(s), ${moved} triangles on twine${squeezed ? `, ${squeezed} with stripes squeezed to fit the cell` : ''}`);
}
