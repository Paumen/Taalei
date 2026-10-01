import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack, rawRows, fixBounds, editablePrimitives } from './mesh-edit.mjs';

const HELP = `cull-hidden.mjs [--dry] <workfile.glb> [...]

Removes triangles that cannot be seen from any direction outside the model,
from below included. A triangle is seen when it shows in any of 384
orthographic views at 2048 pixels from all around, or when a ray from a
point on it, on either side for a double-sided material and on its front
otherwise, leaves the model without striking an opaque triangle. Points sit on
a grid over the triangle and near its corners; each point tries a full
hemisphere of directions and the model's main face directions. Nodes an animation moves, their children and skinned meshes are
neither culled nor counted as cover. A mesh on several nodes loses a triangle
only when it is hidden on every node. Unused vertices are dropped and stored
min and max are set to the data. --dry reports without writing.`;

const DIRECTIONS = 768;
const VIEWS = 384;
const SIZE = 2048;
const MAIN = 64;
const OFFSET = 2e-5;
const GRID = 0.03;
const MAX_GRID = 12;

function movingNodes(json) {
  const nodes = json.nodes ?? [];
  const moving = new Set();
  const mark = (i) => {
    if (moving.has(i)) return;
    moving.add(i);
    for (const c of nodes[i]?.children ?? []) mark(c);
  };
  for (const a of json.animations ?? []) for (const ch of a.channels ?? []) if (ch.target.node !== undefined) mark(ch.target.node);
  nodes.forEach((n, i) => { if (n.skin !== undefined) mark(i); });
  for (const skin of json.skins ?? []) for (const j of skin.joints ?? []) if (moving.has(j)) skin.joints.forEach(mark);
  return moving;
}

const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

function buildBvh(tri) {
  const n = tri.length / 9;
  const order = Uint32Array.from({ length: n }, (_, i) => i);
  const centre = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) centre[i * 3 + k] = (tri[i * 9 + k] + tri[i * 9 + 3 + k] + tri[i * 9 + 6 + k]) / 3;
  const box = [];
  const node = [];
  const build = (lo, hi) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = lo; i < hi; i++) for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) {
      const c = tri[order[i] * 9 + v * 3 + k];
      if (c < b[k]) b[k] = c;
      if (c > b[k + 3]) b[k + 3] = c;
    }
    const id = node.length;
    box.push(...b);
    node.push(null);
    if (hi - lo <= 4) { node[id] = { lo, hi }; return id; }
    let axis = 0;
    for (let k = 1; k < 3; k++) if (b[k + 3] - b[k] > b[axis + 3] - b[axis]) axis = k;
    const part = order.subarray(lo, hi);
    part.sort((p, q) => centre[p * 3 + axis] - centre[q * 3 + axis]);
    const mid = (lo + hi) >> 1;
    const left = build(lo, mid);
    const right = build(mid, hi);
    node[id] = { left, right };
    return id;
  };
  if (n) build(0, n);
  return { tri, order, box: Float64Array.from(box), node };
}

function blocked(bvh, ox, oy, oz, dx, dy, dz) {
  if (!bvh.node.length) return false;
  const { tri, order, box, node } = bvh;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  const stack = [0];
  while (stack.length) {
    const id = stack.pop();
    const b = id * 6;
    let t1 = (box[b] - ox) * ix, t2 = (box[b + 3] - ox) * ix;
    let near = Math.min(t1, t2), far = Math.max(t1, t2);
    t1 = (box[b + 1] - oy) * iy; t2 = (box[b + 4] - oy) * iy;
    near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
    t1 = (box[b + 2] - oz) * iz; t2 = (box[b + 5] - oz) * iz;
    near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
    if (far < Math.max(near, 0)) continue;
    const nd = node[id];
    if (nd.left !== undefined) { stack.push(nd.left, nd.right); continue; }
    for (let i = nd.lo; i < nd.hi; i++) {
      const t = order[i] * 9;
      const ax = tri[t], ay = tri[t + 1], az = tri[t + 2];
      const e1x = tri[t + 3] - ax, e1y = tri[t + 4] - ay, e1z = tri[t + 5] - az;
      const e2x = tri[t + 6] - ax, e2y = tri[t + 7] - ay, e2z = tri[t + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-18) continue;
      const inv = 1 / det;
      const sx = ox - ax, sy = oy - ay, sz = oz - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      if ((e2x * qx + e2y * qy + e2z * qz) * inv > 0) return true;
    }
  }
  return false;
}

function sphere(count) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r]);
  }
  return out;
}

function randomRotation(seed) {
  let s = seed >>> 0 || 1;
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const [u1, u2, u3] = [rand(), rand(), rand()];
  const q = [Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
    Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)];
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y),
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x),
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
}

const SPHERE = sphere(DIRECTIONS);

function samplePoints(a, b, c, step) {
  const edge = Math.max(...[[a, b], [b, c], [c, a]].map(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
  const k = Math.min(MAX_GRID, Math.max(1, Math.ceil(edge / step)));
  const bary = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < k - i; j++) {
    bary.push([(i + 1 / 3) / k, (j + 1 / 3) / k]);
    if (i + j < k - 1) bary.push([(i + 2 / 3) / k, (j + 2 / 3) / k]);
  }
  const near = 0.02;
  bary.push([1 - 2 * near, near], [near, 1 - 2 * near], [near, near], [0.5 - near / 2, 0.5 - near / 2], [near, 0.5 - near / 2], [0.5 - near / 2, near]);
  return bary.map(([u, v]) => [0, 1, 2].map((k2) => a[k2] * (1 - u - v) + b[k2] * u + c[k2] * v));
}

function mainDirections(tri) {
  const area = new Map();
  for (let t = 0; t < tri.length; t += 9) {
    const e1 = [0, 1, 2].map((k) => tri[t + 3 + k] - tri[t + k]);
    const e2 = [0, 1, 2].map((k) => tri[t + 6 + k] - tri[t + k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n);
    if (!len) continue;
    const unit = n.map((c) => c / len);
    const sign = unit.find((c) => Math.abs(c) > 1e-9) < 0 ? -1 : 1;
    const key = unit.map((c) => Math.round(c * sign * 60)).join(',');
    const seenBefore = area.get(key) ?? { area: 0, n: unit.map((c) => c * sign) };
    seenBefore.area += len;
    area.set(key, seenBefore);
  }
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const top = [...area.values()].sort((p, q) => q.area - p.area).slice(0, MAIN).map((e) => e.n);
  return [...axes, ...top].flatMap((d) => [d, d.map((c) => -c)]);
}

function seen(bvh, a, b, c, sides, eps, step, seed) {
  const e1 = [0, 1, 2].map((k) => b[k] - a[k]);
  const e2 = [0, 1, 2].map((k) => c[k] - a[k]);
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(...n);
  if (!len) return true;
  for (let k = 0; k < 3; k++) n[k] /= len;
  const points = samplePoints(a, b, c, step);
  for (const side of sides) {
    const nx = n[0] * side, ny = n[1] * side, nz = n[2] * side;
    for (let p = 0; p < points.length; p++) {
      const [px, py, pz] = points[p];
      const ox = px + nx * eps, oy = py + ny * eps, oz = pz + nz * eps;
      if (!blocked(bvh, ox, oy, oz, nx, ny, nz)) return true;
      for (const [dx, dy, dz] of bvh.main) {
        if (dx * nx + dy * ny + dz * nz <= 1e-3) continue;
        if (!blocked(bvh, ox, oy, oz, dx, dy, dz)) return true;
      }
      const r = randomRotation(seed * 7919 + p * 31 + (side > 0 ? 0 : 17));
      for (const [sx, sy, sz] of SPHERE) {
        const dx = r[0] * sx + r[3] * sy + r[6] * sz;
        const dy = r[1] * sx + r[4] * sy + r[7] * sz;
        const dz = r[2] * sx + r[5] * sy + r[8] * sz;
        if (dx * nx + dy * ny + dz * nz <= 1e-3) continue;
        if (!blocked(bvh, ox, oy, oz, dx, dy, dz)) return true;
      }
    }
  }
  return false;
}

const PAGE = `
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2', { antialias: false });
const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
const program = gl.createProgram();
gl.attachShader(program, shader(gl.VERTEX_SHADER, \`#version 300 es
in vec3 p; uniform mat4 m; flat out highp uint id;
void main() { gl_Position = m * vec4(p, 1.0); id = uint(gl_VertexID) / 3u + 1u; }\`));
gl.attachShader(program, shader(gl.FRAGMENT_SHADER, \`#version 300 es
precision highp float; flat in highp uint id; out vec4 o;
void main() { o = vec4(float(id & 255u), float((id >> 8) & 255u), float((id >> 16) & 255u), 255.0) / 255.0; }\`));
gl.linkProgram(program);
window.views = (tri, dirs, size) => {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const colour = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, colour);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, size, size);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colour);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const data = new Float32Array(tri);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.useProgram(program);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, size, size);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);
  const pixels = new Uint8Array(size * size * 4);
  const words = new Uint32Array(pixels.buffer);
  const seen = new Uint8Array(data.length / 9);
  for (const m of dirs) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'm'), false, m);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 3);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w) seen[(w & 0xffffff) - 1] = 1;
    }
  }
  const out = [];
  seen.forEach((v, i) => { if (v) out.push(i); });
  return out;
};
`;

let browser = null;
async function viewPage() {
  if (!browser) {
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.addScriptTag({ content: PAGE });
    browser.page = page;
  }
  return browser.page;
}

async function seenInViews(cover, lo, hi) {
  const c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  const r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 * 1.02;
  const dirs = sphere(VIEWS).map((d, i) => {
    const rot = randomRotation(i + 1);
    const helper = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let x = [helper[1] * d[2] - helper[2] * d[1], helper[2] * d[0] - helper[0] * d[2], helper[0] * d[1] - helper[1] * d[0]];
    const lx = Math.hypot(...x);
    x = x.map((v) => v / lx);
    const y = [d[1] * x[2] - d[2] * x[1], d[2] * x[0] - d[0] * x[2], d[0] * x[1] - d[1] * x[0]];
    const jx = (rot[0] - 0.5) / SIZE * 2, jy = (rot[4] - 0.5) / SIZE * 2;
    const dot = (a) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    const z = 0.99 / r;
    return [x[0] / r, y[0] / r, -d[0] * z, 0, x[1] / r, y[1] / r, -d[1] * z, 0, x[2] / r, y[2] / r, -d[2] * z, 0,
      -dot(x) / r + jx, -dot(y) / r + jy, dot(d) * z, 1];
  });
  const page = await viewPage();
  return new Set(await page.evaluate(([tri, d, size]) => window.views(tri, d, size), [cover, dirs, SIZE]));
}

function compact(glb, prim, kept, replaced) {
  const { json } = glb;
  const count = json.accessors[prim.attributes.POSITION].count;
  const remap = new Int32Array(count).fill(-1);
  const used = [];
  for (const v of kept) if (remap[v] < 0) { remap[v] = used.length; used.push(v); }
  const write = (index) => {
    const { size, row } = rawRows(glb, index);
    const bytes = Buffer.alloc(size * used.length);
    used.forEach((v, i) => row(v).copy(bytes, i * size));
    json.accessors[index].count = used.length;
    replaced.set(index, bytes);
  };
  for (const index of Object.values(prim.attributes)) write(index);
  for (const target of prim.targets ?? []) for (const index of Object.values(target)) write(index);
  const accessor = json.accessors[prim.indices];
  const [Type, code] = accessor.componentType === 5121 && used.length <= 256 ? [Uint8Array, 5121]
    : accessor.componentType !== 5125 && used.length <= 65536 ? [Uint16Array, 5123] : [Uint32Array, 5125];
  const data = Type.from(kept, (v) => remap[v]);
  accessor.componentType = code;
  accessor.count = data.length;
  replaced.set(prim.indices, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
}

async function cull(glb) {
  const { json } = glb;
  const nodes = json.nodes ?? [];
  const world = worldMatrices(json);
  const moving = movingNodes(json);
  const opaque = (prim) => (json.materials?.[prim.material]?.alphaMode ?? 'OPAQUE') !== 'BLEND';

  const cover = [];
  const placed = new Map();
  nodes.forEach((node, i) => {
    if (node.mesh === undefined || !world[i]) return;
    const still = !moving.has(i);
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if (!placed.has(prim)) placed.set(prim, []);
      placed.get(prim).push({ m: world[i], still, start: cover.length / 9 });
      if (!still || !opaque(prim) || (prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) continue;
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices).data : Array.from({ length: pos.length / 3 }, (_, k) => k);
      for (const v of idx) cover.push(...apply(world[i], pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
    }
  });
  if (!cover.length) return null;

  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cover.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], cover[i + k]);
    hi[k] = Math.max(hi[k], cover[i + k]);
  }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const inViews = await seenInViews(cover, lo, hi);
  const bvh = buildBvh(Float64Array.from(cover));
  bvh.main = mainDirections(bvh.tri);
  const eps = diag * OFFSET;
  const step = diag * GRID;

  const results = new Map();
  let before = 0, removed = 0;
  for (const prim of editablePrimitives(json)) {
    const at = placed.get(prim);
    if (!at?.length || at.some((p) => !p.still) || !opaque(prim)) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = readAccessor(glb, prim.indices).data;
    const sides = json.materials?.[prim.material]?.doubleSided ? [1, -1] : [1];
    const kept = [];
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const visible = at.some(({ m, start }) => {
        if (inViews.has(start + t / 3)) return true;
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((v) => apply(m, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
        const flip = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0;
        return seen(bvh, a, b, c, flip ? sides.map((s) => -s) : sides, eps, step, t + 1);
      });
      if (visible) kept.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    before += idx.length / 3;
    removed += (idx.length - kept.length) / 3;
    if (kept.length < idx.length) results.set(prim, kept);
  }
  return { before, removed, results };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const dry = args.includes('--dry');
const files = args.filter((a) => a !== '--dry');

for (const file of files) {
  const glb = readGlb(file);
  const result = await cull(glb);
  if (!result || !result.removed) { console.log(`${file}: nothing hidden`); continue; }
  const empty = [...result.results.values()].filter((kept) => !kept.length).length;
  if (empty) { console.log(`${file}: ${result.removed} hidden, ${empty} primitive(s) fully hidden, left as is`); continue; }
  const replaced = new Map();
  for (const [prim, kept] of result.results) compact(glb, prim, kept, replaced);
  repack(glb, replaced);
  fixBounds(glb);
  console.log(`${file}: ${result.removed} of ${result.before} triangle(s) hidden, removed`);
  if (!dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
}
await browser?.close();
