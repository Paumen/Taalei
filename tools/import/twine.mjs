import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, measureTubes } from '../../catalog/tools/glb.mjs';

const HELP = `twine.mjs [--from <band>] [--min <diameter>] [--list] <workfile.glb> [...]

Moves every tube on the --from band (default taupe) at least --min thick (default 0.02)
onto the twine band and unwraps it: u runs around the strand, v along it, so the
diagonal stripes of twine wind round it as a helix. Each tube triangle gets its own
vertices, shifted by whole stripe periods to stay inside the cell. --list prints the
tubes it would move and changes nothing.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { bands } = JSON.parse(readFileSync(resolve(ROOT, 'lint/materials.json'), 'utf8'));

const ATLAS = 512, COLUMNS = 16, ROWS = 4;
const CELL_W = ATLAS / COLUMNS, CELL_H = ATLAS / ROWS;
const PERIOD = 8, AROUND = 16, INSET = 4;

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cellOf = (band) => bands[band].split(',').map(Number);

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
    if (i <= 0) i = 1;
    const a = rings[i - 1], b = rings[i];
    const f = (t - a.t) / (b.t - a.t);
    return along[i - 1] + (along[i] - along[i - 1]) * f;
  };
}

function majorityCell(glb, prim, vertices) {
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const count = new Map();
  for (const v of new Set(vertices)) {
    const u = uv[v * 2] - Math.floor(uv[v * 2]), w = uv[v * 2 + 1] - Math.floor(uv[v * 2 + 1]);
    const k = `${Math.min(COLUMNS - 1, Math.floor(u * COLUMNS))},${Math.min(ROWS - 1, Math.floor(w * ROWS))}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
}

function fit(values, low, high) {
  const shift = PERIOD * Math.ceil((low - Math.min(...values)) / PERIOD);
  const out = values.map((x) => x + shift);
  return Math.max(...out) <= high ? out : null;
}

function unwrap(glb, prim, tubes, twine) {
  const { json } = glb;
  const x0 = twine[0] * CELL_W, y0 = twine[1] * CELL_H;
  const owner = new Map();
  tubes.forEach((t, i) => { for (const v of t.vertices) owner.set(v, i); });
  const position = readAccessor(glb, prim.attributes.POSITION).data;
  const place = new Map();
  const stretched = new Set();
  tubes.forEach((tube, i) => {
    const { center, axis, u, w, rings } = tube.frame;
    const arc = arcLength(rings);
    tube.along = AROUND / (Math.PI * tube.diameter);
    for (const v of new Set(tube.vertices)) {
      const m = tube.linear, p = [position[v * 3], position[v * 3 + 1], position[v * 3 + 2]];
      const q = [0, 1, 2].map((k) => m[k] * p[0] + m[k + 3] * p[1] + m[k + 6] * p[2]);
      const d = [q[0] - center[0], q[1] - center[1], q[2] - center[2]];
      const t = dot(d, axis);
      const { cu, cw } = ringAt(rings, t);
      const turn = Math.atan2(dot(d, w) - cw, dot(d, u) - cu) / (2 * Math.PI);
      place.set(v, { around: (turn - Math.floor(turn)) * AROUND, s: arc(t), tube: i });
    }
  });

  const idx = readAccessor(glb, prim.indices).data;
  const attributes = Object.entries(prim.attributes).map(([name, a]) => ({ name, ...readAccessor(glb, a), accessor: json.accessors[a] }));
  const uvAttr = attributes.find((a) => a.name === 'TEXCOORD_0');
  if (uvAttr.accessor.componentType !== 5126) {
    const top = { 5121: 255, 5123: 65535 }[uvAttr.accessor.componentType];
    if (!uvAttr.accessor.normalized || !top) throw new Error('unsupported TEXCOORD_0 encoding');
    uvAttr.data = uvAttr.data.map((x) => x / top);
  }
  const out = attributes.map(() => []);
  const reuse = new Map();
  const copy = (v) => { attributes.forEach((a, k) => { for (let j = 0; j < a.width; j++) out[k].push(a.data[v * a.width + j]); }); return out[0].length / attributes[0].width - 1; };
  const indices = [];
  let moved = 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    const tube = owner.get(tri[0]);
    if (tube === undefined || tri.some((v) => owner.get(v) !== tube)) {
      for (const v of tri) { if (!reuse.has(v)) reuse.set(v, copy(v)); indices.push(reuse.get(v)); }
      continue;
    }
    const corners = tri.map((v) => place.get(v));
    const us = corners.map((c) => c.around + AROUND * Math.round((corners[0].around - c.around) / AROUND));
    let along = tubes[tube].along;
    let vs = null;
    while (!(vs = fit(corners.map((c) => c.s * along), y0 + INSET, y0 + CELL_H - INSET))) { along *= 0.9; stretched.add(tube); }
    const uu = fit(us, x0 + INSET, x0 + CELL_W - INSET);
    if (!uu) throw new Error('triangle spans more than the cell width');
    tri.forEach((v, k) => {
      const n = copy(v);
      const k2 = attributes.indexOf(uvAttr);
      out[k2][n * 2] = uu[k] / ATLAS;
      out[k2][n * 2 + 1] = vs[k] / ATLAS;
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
  return { moved, stretched: stretched.size };
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

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let from = 'taupe', min = 0.02, list = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from') from = args[++i];
  else if (args[i] === '--min') min = Number(args[++i]);
  else if (args[i] === '--list') list = true;
  else files.push(args[i]);
}
if (!bands[from] || !bands.twine) throw new Error(`unknown band: ${bands[from] ? 'twine' : from}`);
const source = bands[from];
const twine = cellOf('twine');

for (const file of files) {
  const glb = readGlb(file);
  glb.bin = Buffer.from(glb.bin);
  const tubes = measureTubes(glb).filter((t) => t.prim.attributes.TEXCOORD_0 !== undefined && t.diameter >= min && majorityCell(glb, t.prim, t.vertices) === source);
  for (const t of tubes) console.log(`${file}  diameter ${t.diameter.toFixed(4)}  length ${t.length.toFixed(3)}`);
  if (list || !tubes.length) continue;
  const byPrim = new Map();
  for (const t of tubes) { if (!byPrim.has(t.prim)) byPrim.set(t.prim, []); byPrim.get(t.prim).push(t); }
  let moved = 0, stretched = 0;
  for (const [prim, group] of byPrim) {
    if (prim.indices === undefined) throw new Error(`${file}: unindexed primitive`);
    const r = unwrap(glb, prim, group, twine);
    moved += r.moved; stretched += r.stretched;
  }
  repack(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(`${file}: ${tubes.length} tube(s), ${moved} triangles on twine${stretched ? `, ${stretched} tube(s) with stripes stretched to fit the cell` : ''}`);
}
