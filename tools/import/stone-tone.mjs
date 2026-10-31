import { readFileSync, writeFileSync } from 'node:fs';

const HELP = `stone-tone.mjs [options] <workfile.glb> [...]

Gives the stone of a model a new light and dark. Each vertex in a stone cell of
kits/colormap.png keeps its cell and its u and gets a new v. Nothing else in
the file changes: no vertex, triangle or other band.

A surface is a run of triangles that share vertices. Within a surface the tone
only changes in a straight line, so no patch can show that the shape does not
have:

  height    light at the top of the model's stone to dark at its foot,
            straight by height, so stone at one height starts out alike
  facing    up lighter, down darker, from the plane of a flat surface or each
            vertex's own normal on a curved one
  recess    one step per surface, darker the more nearby geometry closes in,
            the nearer the more
  overhang  darker the more of a surface has geometry right above, the nearer
            the more; full at the top of the surface, 0.3 of that at its foot
  trim      one step lighter for a flat surface that stands proud of a bigger
            one in the same direction right behind it, as a frame or a band
  variety   one step per piece, so separate stones differ a little. A piece
            is a run of triangles touching at the same spot; pieces whose
            faces lie flush in one plane count as one

Terms add up as darkness, 0 at the light limit and 1 at the dark limit. A
surface that ends up past a limit is shifted back whole, so its ramp keeps its
slope.

  --cells <c;c>    stone cells as col,row (default 14,3;12,3;5,2)
  --top <f>        darkness at the top (default 0.04)
  --height <f>     darkness added from top to foot (default 0.86)
  --soft <f>       surfaces whose normals agree past this share recess and
                   overhang, as the facets of a round tower (default 0.7)
  --up <f>         lighter on faces that look up (default 0.12)
  --down <f>       darker on faces that look down (default 0.45)
  --recess <f>     darker when fully closed in (default 0.45)
  --overhang <f>   darker when fully covered (default 0.50)
  --trim <f>       lighter for proud surfaces (default 0.14)
  --relief <f>     how far proud a surface may stand, share of the longest
                   side (default 0.08)
  --variety <f>    largest shift per piece (default 0.05)
  --reach <f>      recess ray length, share of the longest side (default 0.06)
  --lift <f>       overhang ray length, share of the height (default 0.25)
  --light <f> --dark <f>  v limits (default 0.03, 0.94)
  --dry            print what each term does, write nothing`;

const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlbFile(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a glb`);
  let at = 12, json = null, bin = null;
  while (at < buf.length) {
    const len = buf.readUInt32LE(at), type = buf.readUInt32LE(at + 4);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(body);
    at += 8 + len;
  }
  return { json, bin };
}

function writeGlbFile(file, { json, bin }) {
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  let body = bin;
  if (body.length % 4) body = Buffer.concat([body, Buffer.alloc(4 - (body.length % 4))]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4);
    return [h, data];
  };
  writeFileSync(file, Buffer.concat([head, ...chunk(text, 0x4e4f534a), ...chunk(body, 0x004e4942)]));
}

function slot(glb, index) {
  const acc = glb.json.accessors[index];
  const view = glb.json.bufferViews[acc.bufferView];
  const Type = COMPONENTS[acc.componentType];
  const width = WIDTH[acc.type];
  const stride = view.byteStride || width * Type.BYTES_PER_ELEMENT;
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  return { acc, Type, width, stride, start };
}

function readRows(glb, index) {
  const { acc, Type, width, stride, start } = slot(glb, index);
  const out = new Float64Array(acc.count * width);
  const dv = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[acc.componentType];
  for (let i = 0; i < acc.count; i++)
    for (let k = 0; k < width; k++) out[i * width + k] = dv[get](start + i * stride + k * Type.BYTES_PER_ELEMENT, true);
  return out;
}

function writeFloatRows(glb, index, rows) {
  const { acc, width, stride, start } = slot(glb, index);
  const dv = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const lo = Array(width).fill(Infinity), hi = Array(width).fill(-Infinity);
  for (let i = 0; i < acc.count; i++)
    for (let k = 0; k < width; k++) {
      const x = Math.fround(rows[i * width + k]);
      dv.setFloat32(start + i * stride + k * 4, x, true);
      lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x);
    }
  if (acc.min) acc.min = lo;
  if (acc.max) acc.max = hi;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function meshMatrices(json) {
  const found = new Map();
  const walk = (n, parent) => {
    const node = json.nodes[n];
    const m = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      if (!found.has(node.mesh)) found.set(node.mesh, []);
      found.get(node.mesh).push(m);
    }
    for (const c of node.children || []) walk(c, m);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const n of scene?.nodes || []) walk(n, IDENTITY);
  return found;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function tree(tris) {
  const boxes = tris.map((t) => [0, 1, 2].flatMap((k) => [Math.min(t[0][k], t[1][k], t[2][k]), Math.max(t[0][k], t[1][k], t[2][k])]));
  const order = tris.map((_, i) => i);
  const build = (start, end) => {
    const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (let i = start; i < end; i++) for (let k = 0; k < 6; k += 2) {
      b[k] = Math.min(b[k], boxes[order[i]][k]);
      b[k + 1] = Math.max(b[k + 1], boxes[order[i]][k + 1]);
    }
    const node = { b, start, end };
    if (end - start <= 4) return node;
    const spans = [b[1] - b[0], b[3] - b[2], b[5] - b[4]];
    const k = 2 * spans.indexOf(Math.max(...spans));
    const part = order.slice(start, end).sort((p, q) => boxes[p][k] + boxes[p][k + 1] - boxes[q][k] - boxes[q][k + 1]);
    order.splice(start, end - start, ...part);
    const mid = (start + end) >> 1;
    node.kids = [build(start, mid), build(mid, end)];
    return node;
  };
  return { root: build(0, tris.length), order, tris };
}

function boxHit(b, o, inv, far) {
  let near = 0;
  for (let k = 0; k < 3; k++) {
    let t0 = (b[2 * k] - o[k]) * inv[k], t1 = (b[2 * k + 1] - o[k]) * inv[k];
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return false;
  }
  return true;
}

function triHit(o, d, [a, b, c]) {
  const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-18) return -1;
  const s = sub(o, a), u = dot(s, p) / det;
  if (u < 0 || u > 1) return -1;
  const q = cross(s, e1), v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return -1;
  return dot(e2, q) / det;
}

function closeness({ root, order, tris }, o, d, near, far) {
  const inv = d.map((x) => 1 / x);
  let best = far;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!boxHit(node.b, o, inv, best)) continue;
    if (node.kids) { stack.push(...node.kids); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = triHit(o, d, tris[order[i]]);
      if (t > near && t < best) best = t;
    }
  }
  return 1 - best / far;
}

function frame(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t = unit(cross(n, a));
  return [t, cross(n, t)];
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const HEMI = Array.from({ length: 24 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 24), phi = i * GOLDEN;
  return [r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r)];
});
const CONE = [[0, 1, 0], ...Array.from({ length: 6 }, (_, i) => {
  const phi = (i / 6) * 2 * Math.PI, s = Math.sin(0.35);
  return [s * Math.cos(phi), Math.cos(0.35), s * Math.sin(phi)];
})];

function hash(x) {
  let h = 2166136261;
  for (const ch of x) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10007) / 10006;
}

class Sets {
  constructor(n) { this.up = Int32Array.from({ length: n }, (_, i) => i); }
  find(a) { while (this.up[a] !== a) a = this.up[a] = this.up[this.up[a]]; return a; }
  join(a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.up[a] = b; }
}

function spots(tri, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let r1 = (i * 0.618034 + 0.31) % 1, r2 = (i * 0.754878 + 0.57) % 1;
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    out.push([0, 1, 2].map((k) => tri[0][k] + r1 * (tri[1][k] - tri[0][k]) + r2 * (tri[2][k] - tri[0][k])));
  }
  return out;
}

function tone(file, o) {
  const glb = readGlbFile(file);
  const matrices = meshMatrices(glb.json);
  const prims = [];
  for (const [mesh, ms] of matrices) {
    if (ms.length > 1) throw new Error(`${file}: mesh ${mesh} is placed more than once`);
    const m = ms[0];
    const nm = [
      m[5] * m[10] - m[6] * m[9], m[6] * m[8] - m[4] * m[10], m[4] * m[9] - m[5] * m[8],
      m[2] * m[9] - m[1] * m[10], m[0] * m[10] - m[2] * m[8], m[1] * m[8] - m[0] * m[9],
      m[1] * m[6] - m[2] * m[5], m[2] * m[4] - m[0] * m[6], m[0] * m[5] - m[1] * m[4],
    ];
    for (const prim of glb.json.meshes[mesh].primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const raw = readRows(glb, prim.attributes.POSITION);
      const count = raw.length / 3;
      const p = Array.from({ length: count }, (_, i) => {
        const [x, y, z] = [raw[3 * i], raw[3 * i + 1], raw[3 * i + 2]];
        return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      });
      let n = null;
      if (prim.attributes.NORMAL !== undefined) {
        const rn = readRows(glb, prim.attributes.NORMAL);
        n = Array.from({ length: count }, (_, i) => {
          const [x, y, z] = [rn[3 * i], rn[3 * i + 1], rn[3 * i + 2]];
          return unit([nm[0] * x + nm[1] * y + nm[2] * z, nm[3] * x + nm[4] * y + nm[5] * z, nm[6] * x + nm[7] * y + nm[8] * z]);
        });
      }
      const idx = prim.indices !== undefined ? Array.from(readRows(glb, prim.indices)) : Array.from({ length: count }, (_, i) => i);
      prims.push({ prim, p, n, idx });
    }
  }

  const all = [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { p, idx } of prims) {
    for (const q of p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
    for (let t = 0; t < idx.length; t += 3) all.push([p[idx[t]], p[idx[t + 1]], p[idx[t + 2]]]);
  }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const tall = hi[1] - lo[1] || size;
  const world = tree(all);
  const eps = 1e-4 * size;
  const reach = o.reach * size, lift = o.lift * tall;

  const cover = (spot, normal) => {
    const [t, b] = frame(normal);
    const from = [0, 1, 2].map((k) => spot[k] + normal[k] * eps * 5);
    let closed = 0;
    for (const h of HEMI) {
      const d = [0, 1, 2].map((k) => t[k] * h[0] + b[k] * h[1] + normal[k] * h[2]);
      closed += closeness(world, from, d, eps, reach);
    }
    let roofed = 0, tried = 0;
    if (normal[1] < 0.5) for (const d of CONE) {
      if (dot(d, normal) < -0.2) continue;
      tried++;
      roofed += closeness(world, from, d, eps, lift);
    }
    return [closed / HEMI.length, tried ? roofed / tried : 0];
  };

  const report = { pieces: 0, surfaces: 0, recess: [], overhang: [], trim: 0 };
  for (const { prim, p, n, idx } of prims) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    if (uvIndex === undefined) continue;
    if (glb.json.accessors[uvIndex].componentType !== 5126) throw new Error(`${file}: uv is not float`);
    const uv = readRows(glb, uvIndex);
    const count = p.length;
    const cellOf = (i) => `${Math.floor(uv[2 * i] * 16)},${Math.floor(uv[2 * i + 1] * 4)}`;
    const stone = Uint8Array.from({ length: count }, (_, i) => (o.cells.has(cellOf(i)) ? 1 : 0));
    const stoneTris = [];
    for (let t = 0; t < idx.length; t += 3) if (stone[idx[t]] && stone[idx[t + 1]] && stone[idx[t + 2]]) stoneTris.push(t);
    if (!stoneTris.length) continue;

    const keyOf = (q) => q.map((x) => Math.round(x / (eps * 10))).join(',');
    const spot = new Map();
    const point = Int32Array.from({ length: count }, (_, i) => {
      const key = keyOf(p[i]);
      if (!spot.has(key)) spot.set(key, spot.size);
      return spot.get(key);
    });
    const pieces = new Sets(spot.size), surfaces = new Sets(count);
    for (const t of stoneTris) {
      pieces.join(point[idx[t]], point[idx[t + 1]]); pieces.join(point[idx[t + 1]], point[idx[t + 2]]);
      surfaces.join(idx[t], idx[t + 1]); surfaces.join(idx[t + 1], idx[t + 2]);
    }
    const pieceOf = (i) => pieces.find(point[i]);
    const plane = new Map();
    for (const t of stoneTris) {
      const tri = [p[idx[t]], p[idx[t + 1]], p[idx[t + 2]]];
      const c = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      if (Math.hypot(...c) < 1e-14) continue;
      const normal = unit(c);
      for (const i of [idx[t], idx[t + 1], idx[t + 2]]) {
        const list = plane.get(point[i]) ?? [];
        const same = list.find((q) => dot(q.normal, normal) > 0.999 && Math.abs(dot(q.normal, sub(p[i], q.at))) < eps * 10);
        if (same) surfaces.join(same.vertex, i);
        else list.push({ normal, at: p[i], vertex: i });
        plane.set(point[i], list);
      }
    }

    const flat = new Map();
    for (const t of stoneTris) {
      const tri = [p[idx[t]], p[idx[t + 1]], p[idx[t + 2]]];
      const c = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      if (Math.hypot(...c) < 1e-14) continue;
      const normal = unit(c), id = surfaces.find(idx[t]);
      const g = flat.get(id) ?? { normal, at: tri[0], planar: true, box: [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity] };
      if (dot(g.normal, normal) < 0.995 || Math.abs(dot(g.normal, sub(tri[0], g.at))) > size * 0.02) g.planar = false;
      for (const q of tri) for (let k = 0; k < 3; k++) { g.box[2 * k] = Math.min(g.box[2 * k], q[k]); g.box[2 * k + 1] = Math.max(g.box[2 * k + 1], q[k]); }
      flat.set(id, g);
    }
    const planes = [...flat].filter(([, g]) => g.planar);
    const touch = (a, b) => [0, 2, 4].every((k) => a[k] <= b[k + 1] + eps * 10 && b[k] <= a[k + 1] + eps * 10);
    for (let a = 0; a < planes.length; a++) for (let b = a + 1; b < planes.length; b++) {
      const [ia, ga] = planes[a], [ib, gb] = planes[b];
      if (dot(ga.normal, gb.normal) > 0.995 && Math.abs(dot(ga.normal, sub(gb.at, ga.at))) < size * 0.01 && touch(ga.box, gb.box)) {
        surfaces.join(ia, ib);
        pieces.join(point[ia], point[ib]);
      }
    }
    const piece = new Map();
    for (const t of stoneTris) {
      const tri = [p[idx[t]], p[idx[t + 1]], p[idx[t + 2]]];
      const area = Math.hypot(...cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))) / 2;
      const id = pieceOf(idx[t]);
      const s = piece.get(id) ?? { area: 0, low: Infinity, high: -Infinity, box: [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity], centre: [0, 0, 0] };
      s.area += area;
      for (const q of tri) {
        s.low = Math.min(s.low, q[1]); s.high = Math.max(s.high, q[1]);
        for (let k = 0; k < 3; k++) { s.box[2 * k] = Math.min(s.box[2 * k], q[k]); s.box[2 * k + 1] = Math.max(s.box[2 * k + 1], q[k]); }
        for (let k = 0; k < 3; k++) s.centre[k] += (q[k] * area) / 3;
      }
      piece.set(id, s);
    }
    for (const [id, s] of piece) {
      s.centre = s.centre.map((x) => x / (s.area || 1));
      s.shift = o.variety * (2 * hash(s.centre.map((x) => (x / size).toFixed(3)).join()) - 1);
    }
    report.pieces += piece.size;

    const surface = new Map();
    for (const t of stoneTris) {
      const tri = [p[idx[t]], p[idx[t + 1]], p[idx[t + 2]]];
      const c = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      const area = Math.hypot(...c) / 2;
      if (area < 1e-14) continue;
      const normal = unit(c);
      const id = surfaces.find(idx[t]);
      const s = surface.get(id) ?? { tris: [], area: 0, low: Infinity, high: -Infinity, ny: 0, box: [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity] };
      s.tris.push({ tri, area, normal });
      s.area += area;
      s.ny += normal[1] * area;
      for (const q of tri) {
        s.low = Math.min(s.low, q[1]); s.high = Math.max(s.high, q[1]);
        for (let k = 0; k < 3; k++) { s.box[2 * k] = Math.min(s.box[2 * k], q[k]); s.box[2 * k + 1] = Math.max(s.box[2 * k + 1], q[k]); }
      }
      surface.set(id, s);
    }
    const touching = new Map();
    for (const [id, s] of surface) {
      s.normal = unit(s.tris.reduce((a, { normal, area }) => [0, 1, 2].map((k) => a[k] + normal[k] * area), [0, 0, 0]));
      for (const { tri } of s.tris) for (const q of tri) {
        const key = keyOf(q);
        if (!touching.has(key)) touching.set(key, new Set());
        touching.get(key).add(id);
      }
    }
    const ids = [...surface.keys()], slotOf = new Map(ids.map((id, i) => [id, i]));
    const regions = new Sets(ids.length);
    for (const near of touching.values()) {
      const list = [...near];
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++)
        if (dot(surface.get(list[a]).normal, surface.get(list[b]).normal) > o.soft) regions.join(slotOf.get(list[a]), slotOf.get(list[b]));
    }
    const region = new Map();
    for (const id of ids) {
      const r = regions.find(slotOf.get(id));
      if (!region.has(r)) region.set(r, { tris: [], area: 0 });
      const g = region.get(r), s = surface.get(id);
      g.tris.push(...s.tris); g.area += s.area;
      s.region = g;
    }
    for (const s of region.values()) {
      const budget = 64;
      let closed = 0, roofed = 0, weight = 0;
      for (const { tri, area, normal } of s.tris) {
        const k = Math.max(1, Math.round((budget * area) / s.area));
        for (const q of spots(tri, Math.min(k, 12))) {
          const [c, r] = cover(q, normal);
          closed += c * area; roofed += r * area; weight += area;
        }
      }
      s.recess = weight ? closed / weight : 0;
      s.overhang = weight ? roofed / weight : 0;
      report.recess.push(s.recess); report.overhang.push(s.overhang);
    }
    for (const s of surface.values()) { s.recess = s.region.recess; s.overhang = s.region.overhang; }
    report.surfaces += region.size;

    for (const f of surface.values()) f.planar = f.tris.every(({ normal }) => dot(normal, f.normal) > 0.995);
    const flats = [...surface.values()].filter((f) => f.planar);
    for (const f of flats) f.offset = dot(f.normal, f.tris[0].tri[0]);
    for (const f of flats) {
      f.proud = flats.some((w) => w !== f && w.area > f.area && dot(w.normal, f.normal) > 0.99
        && f.offset - w.offset > eps * 20 && f.offset - w.offset < o.relief * size
        && [0, 1, 2].every((k) => f.box[2 * k] <= w.box[2 * k + 1] + o.relief * size && w.box[2 * k] <= f.box[2 * k + 1] + o.relief * size)
        && [0, 1, 2].filter((k) => Math.abs(f.normal[k]) < 0.5).every((k) => f.box[2 * k] >= w.box[2 * k] - eps * 20 && f.box[2 * k + 1] <= w.box[2 * k + 1] + eps * 20)) ? 1 : 0;
      report.trim += f.proud;
    }
    let low = Infinity, high = -Infinity;
    for (const t of stoneTris) for (const i of [idx[t], idx[t + 1], idx[t + 2]]) { low = Math.min(low, p[i][1]); high = Math.max(high, p[i][1]); }
    const d = new Float64Array(count).fill(NaN);
    const span = new Map();
    for (let i = 0; i < count; i++) {
      if (!stone[i]) continue;
      const s = piece.get(pieceOf(i)), id = surfaces.find(i), f = surface.get(id);
      if (!s || !f) continue;
      const h = high - low > 1e-9 ? (high - p[i][1]) / (high - low) : 0.5;
      const own = f.high - f.low > 1e-9 ? (f.high - p[i][1]) / (f.high - f.low) : 0.5;
      const ny = f.planar || !n ? f.normal[1] : n[i][1];
      d[i] = o.top + o.height * h - o.up * Math.max(0, ny) + o.down * Math.max(0, -ny)
        + o.recess * f.recess + o.overhang * f.overhang * (1 - 0.7 * own) - o.trim * f.proud + s.shift;
      const r = span.get(id) ?? [Infinity, -Infinity];
      span.set(id, [Math.min(r[0], d[i]), Math.max(r[1], d[i])]);
    }
    for (let i = 0; i < count; i++) {
      if (Number.isNaN(d[i])) continue;
      const [a, b] = span.get(surfaces.find(i));
      const k = b - a > 1 ? 1 / (b - a) : 1;
      let x = a + (d[i] - a) * k;
      const top = a + (b - a) * k;
      x += a < 0 ? -a : top > 1 ? 1 - top : 0;
      x = o.light + (o.dark - o.light) * Math.min(1, Math.max(0, x));
      uv[2 * i + 1] = (Math.floor(uv[2 * i + 1] * 4) + x) / 4;
    }
    if (!o.dry) writeFloatRows(glb, uvIndex, uv);
  }
  const spread = (a) => (a.length ? `${Math.min(...a).toFixed(2)}..${Math.max(...a).toFixed(2)}` : '-');
  console.log(`${file}: ${report.pieces} pieces (${report.trim} proud surfaces), ${report.surfaces} surfaces, recess ${spread(report.recess)}, overhang ${spread(report.overhang)}`);
  if (!o.dry) writeGlbFile(file, glb);
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const take = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const num = (flag, fallback) => Number(take(flag, fallback));
const o = {
  cells: new Set(take('--cells', '14,3;12,3;5,2').split(';')),
  top: num('--top', 0.04), height: num('--height', 0.86), soft: num('--soft', 0.7),
  up: num('--up', 0.12), down: num('--down', 0.45), recess: num('--recess', 0.45), overhang: num('--overhang', 0.5),
  trim: num('--trim', 0.14), relief: num('--relief', 0.08), variety: num('--variety', 0.05),
  reach: num('--reach', 0.06), lift: num('--lift', 0.25), light: num('--light', 0.03), dark: num('--dark', 0.94),
};
const dryAt = args.indexOf('--dry');
if (dryAt >= 0) { o.dry = true; args.splice(dryAt, 1); }
for (const file of args) tone(file, o);
