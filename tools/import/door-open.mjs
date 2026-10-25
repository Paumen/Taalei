import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds } from './mesh-edit.mjs';

const HELP = `door-open.mjs [--width <w>] [--height <h>] [--dry] <doorway.glb> [...]
door-open.mjs --at <from>,<to>,<top> <doorway.glb>
door-open.mjs --door <fx>,<fy> <door.glb> [...]

Widens and raises the door openings of a doorway wall to at least <w> x <h>
(0.4 x 0.8 by default) and squeezes the wall beside and above them, so the
wall keeps its outer size. An opening is a gap seen straight from the front
that reaches down to the floor; a mesh node named door, or ending in _door,
is a door leaf and does not close it. Prints per file the openings before
and after, as JSON. --at gives the one opening by hand, measured from the
wall's left end and floor, where a door leaf or bars hide it. --door stretches a loose door by <fx> along its width
and <fy> in height, about its bottom centre.`;

const STEP = 0.005;

function meshNodes(json) {
  const world = worldMatrices(json);
  return json.nodes.map((node, i) => ({ node, i, m: world[i] })).filter((n) => n.node.mesh !== undefined && n.m);
}

function rigid(m) {
  const cols = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  if (cols.some((c) => Math.abs(Math.hypot(...c) - 1) > 1e-4)) throw new Error('mesh node with a scale');
  if (Math.abs(m[1]) > 1e-5 || Math.abs(m[9]) > 1e-5 || Math.abs(m[4]) > 1e-5 || Math.abs(m[6]) > 1e-5) throw new Error('mesh node turned off the vertical');
}

const toWorld = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const toLocal = (m, x, y, z) => { x -= m[12]; y -= m[13]; z -= m[14]; return [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z]; };
const dirWorld = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
const dirLocal = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];

export function gather(glb) {
  const parts = meshNodes(glb.json).map(({ node, m }) => {
    rigid(m);
    const leaf = /(^|_)door$/i.test(node.name ?? '') && glb.json.nodes.filter((n) => n.mesh !== undefined).length > 1;
    const prims = glb.json.meshes[node.mesh].primitives.map((p) => {
      const pos = readAccessor(glb, p.attributes.POSITION).data;
      const world = new Float64Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) world.set(toWorld(m, pos[i], pos[i + 1], pos[i + 2]), i);
      const index = p.indices !== undefined ? readAccessor(glb, p.indices).data : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
      return { p, world, index };
    });
    return { m, leaf, prims };
  });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) for (const { world } of part.prims) for (let i = 0; i < world.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], world[i + k]); max[k] = Math.max(max[k], world[i + k]);
  }
  const axis = max[0] - min[0] >= max[2] - min[2] ? 0 : 2;
  return { parts, min, max, axis };
}

export function openings(shape, rowAt = 0.3, minRun = 20) {
  const { parts, min, max, axis } = shape;
  const nx = Math.ceil((max[axis] - min[axis]) / STEP), ny = Math.ceil((max[1] - min[1]) / STEP);
  const cover = new Uint8Array(nx * ny);
  for (const part of parts) {
    if (part.leaf) continue;
    for (const { world, index } of part.prims) for (let t = 0; t < index.length; t += 3) {
      const v = [index[t], index[t + 1], index[t + 2]].map((i) => [(world[i * 3 + axis] - min[axis]) / STEP, (world[i * 3 + 1] - min[1]) / STEP]);
      const area = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]);
      if (Math.abs(area) < 1e-6) continue;
      const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(nx - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(ny - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const e = (a, b) => (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
        const s0 = e(v[0], v[1]), s1 = e(v[1], v[2]), s2 = e(v[2], v[0]);
        if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) cover[y * nx + x] = 1;
      }
    }
  }
  const open = (x, y) => !cover[y * nx + x];
  const row = Math.round(ny * rowAt), found = [];
  for (let x = 0; x < nx; x++) {
    if (!open(x, row)) continue;
    let r = x;
    while (r + 1 < nx && open(r + 1, row)) r++;
    const mid = Math.round((x + r) / 2);
    let top = row, bottom = row;
    while (top + 1 < ny && open(mid, top + 1)) top++;
    while (bottom > 0 && open(mid, bottom - 1)) bottom--;
    if (x > 0 && r < nx - 1 && r - x >= minRun && bottom <= ny * 0.12) {
      found.push({ a: min[axis] + x * STEP, b: min[axis] + (r + 1) * STEP, top: min[1] + (top + 1) * STEP });
    }
    x = r;
  }
  return found;
}

function piecewise(knots) {
  return (v) => {
    for (let i = 1; i < knots.length; i++) {
      const [a0, b0] = knots[i - 1], [a1, b1] = knots[i];
      if (v <= a1 || i === knots.length - 1) return { v: b0 + (v - a0) * (b1 - b0) / (a1 - a0), s: (b1 - b0) / (a1 - a0) };
    }
  };
}

function plan(shape, found, minW, minH) {
  const { min, max, axis } = shape;
  const extra = found.reduce((s, o) => s + Math.max(0, minW - (o.b - o.a)), 0);
  const solid = (max[axis] - min[axis]) - found.reduce((s, o) => s + (o.b - o.a), 0);
  const shrink = 1 - extra / solid;
  if (shrink < 0.4) throw new Error('too little wall beside the openings');
  const hk = [[min[axis], min[axis]]];
  let at = min[axis], prev = min[axis];
  for (const o of found) {
    at += (o.a - prev) * shrink;
    hk.push([o.a, at]);
    at += Math.max(minW, o.b - o.a);
    hk.push([o.b, at]);
    prev = o.b;
  }
  hk.push([max[axis], max[axis]]);
  const top = Math.max(...found.map((o) => o.top));
  const vk = [[min[1], min[1]]];
  if (top - min[1] < minH) {
    if (max[1] - (min[1] + minH) < 0.03) throw new Error('too little wall above the openings');
    vk.push([top, min[1] + minH]);
  }
  vk.push([max[1], max[1]]);
  const h = piecewise(hk), v = piecewise(vk);
  const after = found.map((o) => ({ a: h(o.a).v, b: h(o.b).v, top: v(o.top).v }));
  return { h, v, after, changed: extra > 0 || vk.length > 2 };
}

export function deform(glb, shape, h, v) {
  const { parts, axis } = shape;
  const replaced = new Map();
  for (const { m, prims } of parts) for (const { p, world } of prims) {
    if (replaced.has(p.attributes.POSITION)) throw new Error('mesh data shared between nodes');
    const out = new Float32Array(world.length);
    const scales = [];
    for (let i = 0; i < world.length; i += 3) {
      const pt = [world[i], world[i + 1], world[i + 2]];
      const hx = h(pt[axis]), vy = v(pt[1]);
      pt[axis] = hx.v; pt[1] = vy.v;
      scales.push([hx.s, vy.s]);
      out.set(toLocal(m, ...pt), i);
    }
    replaced.set(p.attributes.POSITION, Buffer.from(out.buffer));
    if (p.attributes.NORMAL !== undefined) {
      const n = readAccessor(glb, p.attributes.NORMAL).data;
      const no = new Float32Array(n.length);
      for (let i = 0; i < n.length; i += 3) {
        const w = dirWorld(m, n[i], n[i + 1], n[i + 2]);
        const [sh, sv] = scales[i / 3];
        w[axis] /= sh; w[1] /= sv;
        const l = Math.hypot(...w) || 1;
        no.set(dirLocal(m, w[0] / l, w[1] / l, w[2] / l), i);
      }
      replaced.set(p.attributes.NORMAL, Buffer.from(no.buffer));
    }
  }
  repack(glb, replaced);
  fixBounds(glb);
}

export function openDoorway(glb, minW = 0.4, minH = 0.8, at = null) {
  const shape = gather(glb);
  let found = at ? [{ a: shape.min[shape.axis] + at[0], b: shape.min[shape.axis] + at[1], top: shape.min[1] + at[2] }] : openings(shape);
  if (!found.length) {
    shape.axis = 2 - shape.axis;
    found = openings(shape);
  }
  if (!found.length) return { found };
  const { h, v, after, changed } = plan(shape, found, minW, minH);
  if (changed) deform(glb, shape, h, v);
  return { found, after, changed };
}

export function stretchDoor(glb, fx, fy) {
  const shape = gather(glb);
  const { min, max, axis } = shape;
  const c = (min[axis] + max[axis]) / 2;
  deform(glb, shape, (x) => ({ v: c + (x - c) * fx, s: fx }), (y) => ({ v: min[1] + (y - min[1]) * fy, s: fy }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
  const take = (name) => { const at = args.indexOf(name); if (at < 0) return undefined; const v = args[at + 1]; args.splice(at, 2); return v; };
  const dry = args.includes('--dry'); if (dry) args.splice(args.indexOf('--dry'), 1);
  const at = take('--at')?.split(',').map(Number), door = take('--door'), minW = Number(take('--width') ?? 0.4), minH = Number(take('--height') ?? 0.8);
  let failed = 0;
  for (const file of args) {
    try {
      const glb = readGlb(file);
      if (door) {
        const [fx, fy] = door.split(',').map(Number);
        stretchDoor(glb, fx, fy);
        if (!dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
        console.log(JSON.stringify({ file, door: [fx, fy] }));
        continue;
      }
      const r = openDoorway(glb, minW, minH, at);
      if (r.changed && !dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
      const fmt = (o) => [+(o.b - o.a).toFixed(3), +o.top.toFixed(3)];
      console.log(JSON.stringify({ file, before: r.found.map(fmt), after: r.after?.map(fmt) ?? null, changed: !!r.changed }));
    } catch (e) {
      console.log(JSON.stringify({ file, error: e.message }));
      failed++;
    }
  }
  if (failed) process.exitCode = 1;
}
