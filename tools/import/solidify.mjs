import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, buildTree, throughDepth, hitBox, hitTriangle } from './mesh-edit.mjs';

const HELP = `solidify.mjs [--thick <t>] [--dry] <workfile.glb> [...]

Turns every surface into one that shows its front from all sides, the way
catalog/tools/backfaces.mjs reads it. A triangle is turned when, from the
catalogue's 16 views above the horizon, its back is seen more often than its
front. A vertex normal that points against the triangles around it is
turned round. Shells are the triangles joined by edges two triangles share, welded across
primitives in world space. Every shell with a rim then gets a back face --thick (0.006 by
default) behind it, against its averaged normal, and a band of faces along the
rim that closes the two, so a card becomes a slab. Where the shell already wraps
round solid material thinner than twice --thick, the back face stops halfway
through it. Back and rim corners keep the colour of the corner they come from. A
skinned primitive is read in its rest pose. A primitive that shares an accessor,
holds sparse data or is drawn by more than one node is left as it is, and so is
every shell that touches one.
--dry reports without writing.`;

const MAX_STRETCH = 2;
const AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315];
const ELEVATIONS = [20, 50];
const FOV = 35;
const GRAZE = 1e-3;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return l ? a.map((x) => x / l) : null; };
const xf = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
const transposed = (m, p) => [0, 1, 2].map((k) => m[k * 4] * p[0] + m[k * 4 + 1] * p[1] + m[k * 4 + 2] * p[2]);
const det = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);

function inverseLinear(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = a * A + b * B + c * C;
  const r = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / D);
  return (p) => [0, 1, 2].map((k) => r[k] * p[0] + r[3 + k] * p[1] + r[6 + k] * p[2]);
}

function firstHit(tree, tris, o, d, far, near) {
  const inv = d.map((x) => 1 / x);
  let best = null, at = far;
  const stack = [tree.root];
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, at)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = tree.order[i];
      const h = hitTriangle(o, d, tris[t]);
      if (h > near && h < at) { at = h; best = t; }
    }
  }
  return best;
}

function multiply(a, b) {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return r;
}

function skinMatrices(glb, world, p) {
  const skin = glb.json.skins[p.skin];
  const ibm = skin.inverseBindMatrices !== undefined ? readAccessor(glb, skin.inverseBindMatrices).data : null;
  const bones = skin.joints.map((joint, k) => {
    const inverse = ibm ? Array.from(ibm.slice(k * 16, k * 16 + 16)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return multiply(multiply(world[joint], inverse), p.matrix);
  });
  const joints = readAccessor(glb, p.prim.attributes.JOINTS_0).data;
  const weights = readAccessor(glb, p.prim.attributes.WEIGHTS_0);
  const scale = { 5121: 255, 5123: 65535 }[glb.json.accessors[p.prim.attributes.WEIGHTS_0].componentType] ?? 1;
  const cache = new Map();
  return (v) => {
    if (cache.has(v)) return cache.get(v);
    const m = new Array(16).fill(0);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights.data[v * 4 + k] / scale;
      if (!w) continue;
      total += w;
      const bone = bones[joints[v * 4 + k]];
      for (let i = 0; i < 16; i++) m[i] += w * bone[i];
    }
    const out = total ? m.map((x) => x / total) : p.matrix;
    cache.set(v, out);
    return out;
  };
}

function solidify(glb, thick) {
  const { json } = glb;
  const world = worldMatrices(json);
  const editable = new Set(editablePrimitives(json));
  const parts = [];
  (json.nodes ?? []).forEach((node, n) => {
    if (node.mesh === undefined || !world[n]) return;
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      parts.push({ prim, matrix: world[n], skin: node.skin });
    }
  });
  const drawn = new Map();
  for (const p of parts) drawn.set(p.prim, (drawn.get(p.prim) ?? 0) + 1);

  const weld = new Map();
  const tris = [];
  for (const [pi, p] of parts.entries()) {
    const pos = readAccessor(glb, p.prim.attributes.POSITION).data;
    const count = pos.length / 3;
    p.idx = p.prim.indices !== undefined ? Array.from(readAccessor(glb, p.prim.indices).data) : Array.from({ length: count }, (_, k) => k);
    p.pos = pos;
    p.nrm = p.prim.attributes.NORMAL !== undefined ? readAccessor(glb, p.prim.attributes.NORMAL).data : null;
    p.matrixOf = p.skin === undefined ? () => p.matrix : skinMatrices(glb, world, p);
    p.mirrored = det(p.matrixOf(0)) < 0;
    p.edit = editable.has(p.prim) && drawn.get(p.prim) === 1
      && (p.nrm === null || json.accessors[p.prim.attributes.NORMAL].componentType === 5126);
    const inverses = new Map();
    p.toLocal = (v, d) => {
      if (!inverses.has(v)) inverses.set(v, inverseLinear(p.matrixOf(v)));
      return inverses.get(v)(d);
    };
    p.ids = new Int32Array(count);
    p.at = [];
    for (let v = 0; v < count; v++) {
      const w = xf(p.matrixOf(v), [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
      const key = w.map((x) => x.toFixed(5)).join(',');
      if (!weld.has(key)) weld.set(key, { id: weld.size, at: w });
      p.ids[v] = weld.get(key).id;
      p.at.push(w);
    }
    for (let t = 0; t + 2 < p.idx.length; t += 3) {
      const k = p.mirrored ? [t, t + 2, t + 1] : [t, t + 1, t + 2];
      const c = k.map((i) => p.ids[p.idx[i]]);
      if (c[0] === c[1] || c[1] === c[2] || c[0] === c[2]) continue;
      tris.push({ pi, t, c });
    }
  }

  const edges = new Map();
  tris.forEach((tri, i) => {
    for (let e = 0; e < 3; e++) {
      const a = tri.c[e], b = tri.c[(e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ tri: i, dir: a < b ? 1 : -1, e });
    }
  });

  const shell = new Int32Array(tris.length).fill(-1);
  const shells = [];
  const neighbours = Array.from({ length: tris.length }, () => []);
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    neighbours[list[0].tri].push(list[1].tri);
    neighbours[list[1].tri].push(list[0].tri);
  }
  for (let s = 0; s < tris.length; s++) {
    if (shell[s] >= 0) continue;
    const members = [s];
    shell[s] = shells.length;
    for (let i = 0; i < members.length; i++) {
      for (const other of neighbours[members[i]]) {
        if (shell[other] >= 0) continue;
        shell[other] = shells.length;
        members.push(other);
      }
    }
    shells.push({ members, open: false, editable: true });
  }
  for (const list of edges.values()) if (list.length === 1) shells[shell[list[0].tri]].open = true;
  tris.forEach((tri, i) => { if (!parts[tri.pi].edit) shells[shell[i]].editable = false; });

  const flip = new Uint8Array(tris.length);
  const corners = (i) => {
    const c = tris[i].c;
    return flip[i] ? [c[0], c[2], c[1]] : c;
  };
  const atOf = [...weld.values()].sort((a, b) => a.id - b.id).map((w) => w.at);
  const faceNormal = (i) => {
    const [a, b, c] = corners(i).map((w) => atOf[w]);
    return cross(sub(b, a), sub(c, a));
  };

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const at of atOf) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], at[k]); hi[k] = Math.max(hi[k], at[k]); }
  const longest = Math.max(...hi.map((h, k) => h - lo[k]));
  const eps = longest * 1e-6;
  const placed = tris.map((tri) => tri.c.map((w) => atOf[w]));
  const tree = buildTree(placed);
  const centre = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  const radius = Math.hypot(...hi.map((h, k) => h - centre[k]));
  const distance = (radius / Math.sin((FOV / 2) * Math.PI / 180)) * 1.05;
  const cameras = [];
  for (const el of ELEVATIONS) for (const az of AZIMUTHS) {
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    cameras.push([centre[0] + distance * Math.cos(e) * Math.sin(a), centre[1] + distance * Math.sin(e), centre[2] + distance * Math.cos(e) * Math.cos(a)]);
  }
  const seenFrom = (o, n) => {
    let front = 0, back = 0;
    for (const cam of cameras) {
      const to = sub(cam, o);
      const far = Math.hypot(...to);
      const d = to.map((x) => x / far);
      const facing = dot(d, n);
      if (Math.abs(facing) < GRAZE) continue;
      if (firstHit(tree, placed, o, d, far, eps) !== null) continue;
      if (facing > 0) front++;
      else back++;
    }
    return { front, back };
  };

  let turned = 0;
  for (let i = 0; i < tris.length; i++) {
    if (!shells[shell[i]].editable) continue;
    const n = unit(faceNormal(i));
    if (!n) continue;
    const [a, b, c] = corners(i).map((w) => atOf[w]);
    const { front, back } = seenFrom([0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3), n);
    if (back > front) { flip[i] = 1; turned++; }
  }

  for (const [i, tri] of tris.entries()) {
    if (!flip[i]) continue;
    const idx = parts[tri.pi].idx;
    [idx[tri.t + 1], idx[tri.t + 2]] = [idx[tri.t + 2], idx[tri.t + 1]];
  }

  let normalsTurned = 0;
  for (const p of parts) {
    if (!p.edit || !p.nrm) continue;
    const sum = Array.from({ length: p.pos.length / 3 }, () => [0, 0, 0]);
    const local = (v) => [p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]];
    for (let t = 0; t + 2 < p.idx.length; t += 3) {
      const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
      const n = cross(sub(local(b), local(a)), sub(local(c), local(a)));
      for (const v of [a, b, c]) for (let k = 0; k < 3; k++) sum[v][k] += n[k];
    }
    p.nrmOut = Float32Array.from(p.nrm);
    sum.forEach((n, v) => {
      const stored = [p.nrm[v * 3], p.nrm[v * 3 + 1], p.nrm[v * 3 + 2]];
      if (dot(n, stored) >= 0) return;
      normalsTurned++;
      for (let k = 0; k < 3; k++) p.nrmOut[v * 3 + k] = -stored[k];
    });
  }

  const adders = new Map();
  const added = new Map();
  const adderOf = (pi) => {
    if (!adders.has(pi)) { adders.set(pi, vertexAdder(glb, parts[pi].prim)); added.set(pi, []); }
    return adders.get(pi);
  };
  const normalOf = (p, v) => (p.nrmOut ? [p.nrmOut[v * 3], p.nrmOut[v * 3 + 1], p.nrmOut[v * 3 + 2]] : null);
  const push = (pi, list) => {
    const out = added.get(pi);
    if (parts[pi].mirrored) out.push(list[0], list[2], list[1]);
    else out.push(...list);
  };

  const worldTris = tris.map((_, i) => corners(i).map((w) => atOf[w]));
  const worldNormals = tris.map((_, i) => unit(faceNormal(i)) ?? [0, 0, 0]);

  let solidified = 0, rims = 0;
  for (const [si, s] of shells.entries()) {
    if (!s.open || !s.editable) continue;
    solidified++;
    const offset = new Map();
    const faces = new Map();
    for (const i of s.members) {
      const n = faceNormal(i);
      for (const w of corners(i)) {
        if (!offset.has(w)) { offset.set(w, [0, 0, 0]); faces.set(w, []); }
        const o = offset.get(w);
        for (let k = 0; k < 3; k++) o[k] += n[k];
        const u = unit(n);
        if (u) faces.get(w).push(u);
      }
    }
    for (const [w, o] of offset) {
      const n = unit(o) ?? faces.get(w)[0] ?? [0, 1, 0];
      const lean = Math.min(...faces.get(w).map((f) => dot(f, n)), 1);
      const stretch = Math.min(MAX_STRETCH, 1 / Math.max(lean, 1 / MAX_STRETCH));
      const d = n.map((x) => -x);
      const depth = throughDepth(tree, worldTris, worldNormals, atOf[w].map((x, k) => x + d[k] * eps), d, longest * 2, eps);
      const reach = depth === null ? thick * stretch : Math.min(thick * stretch, depth / 2);
      offset.set(w, d.map((x) => x * reach));
    }

    const back = new Map();
    const backOf = (pi, v) => {
      const key = `${pi}:${v}`;
      if (back.has(key)) return back.get(key);
      const p = parts[pi];
      const d = p.toLocal(v, offset.get(p.ids[v]));
      const position = [p.pos[v * 3] + d[0], p.pos[v * 3 + 1] + d[1], p.pos[v * 3 + 2] + d[2]];
      const n = normalOf(p, v);
      const index = adderOf(pi).add(v, { POSITION: position, ...(n ? { NORMAL: n.map((x) => -x) } : {}) });
      back.set(key, { index, position });
      return back.get(key);
    };
    for (const i of s.members) {
      const { pi, t } = tris[i];
      const idx = parts[pi].idx;
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((v) => backOf(pi, v).index);
      added.get(pi).push(a, c, b);
    }
    for (const list of edges.values()) {
      if (list.length !== 1 || shell[list[0].tri] !== si) continue;
      const i = list[0].tri;
      const { pi, t } = tris[i];
      const p = parts[pi];
      const local = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
      const order = p.mirrored ? [local[0], local[2], local[1]] : local;
      const e = list[0].e;
      const ref = tris[i].c;
      const ea = ref[e], eb = ref[(e + 1) % 3];
      let a = order.find((v) => p.ids[v] === ea), b = order.find((v) => p.ids[v] === eb);
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if ((ia + 1) % 3 !== ib) [a, b] = [b, a];
      const wa = p.at[a], wb = p.at[b];
      const wn = unit(cross(sub(wb, wa), faceNormal(i))) ?? [0, 1, 0];
      const ln = unit(transposed(p.matrixOf(a), wn)) ?? [0, 1, 0];
      const adder = adderOf(pi);
      const set = (pos) => ({ ...(pos ? { POSITION: pos } : {}), ...(p.nrm ? { NORMAL: ln } : {}) });
      const fa = adder.add(a, set(null)), fb = adder.add(b, set(null));
      const ba = adder.add(a, set(backOf(pi, a).position)), bb = adder.add(b, set(backOf(pi, b).position));
      push(pi, [fb, fa, ba]);
      push(pi, [fb, ba, bb]);
      rims++;
    }
  }

  const replaced = new Map();
  for (const [pi, p] of parts.entries()) {
    if (!p.edit) continue;
    const adder = adders.get(pi);
    const changedIdx = tris.some((tri, i) => tri.pi === pi && flip[i]);
    if (!adder && !changedIdx && !p.nrmOut?.some((x, k) => x !== p.nrm[k])) continue;
    if (p.nrmOut) {
      const accessor = json.accessors[p.prim.attributes.NORMAL];
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const step = view.byteStride ?? 12;
      for (let v = 0; v < p.nrmOut.length / 3; v++) {
        new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + v * step, 3).set(p.nrmOut.subarray(v * 3, v * 3 + 3));
      }
    }
    (adder ?? vertexAdder(glb, p.prim)).commit([...p.idx, ...(added.get(pi) ?? [])], replaced);
  }
  return { turned, normalsTurned, solidified, rims, replaced };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let thick = 0.006;
let dry = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--thick') thick = Number(args[++i]);
  else if (args[i] === '--dry') dry = true;
  else files.push(args[i]);
}
if (!(thick > 0)) throw new Error('--thick needs a positive number');

for (const file of files) {
  const glb = readGlb(file);
  glb.bin = Buffer.from(glb.bin);
  const { turned, normalsTurned, solidified, rims, replaced } = solidify(glb, thick);
  console.log(`${file}: ${turned} triangle(s) turned, ${normalsTurned} normal(s) turned, ${solidified} open shell(s) solidified with ${rims} rim edge(s)`);
  if (!replaced.size) continue;
  repack(glb, replaced);
  fixBounds(glb);
  if (!dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
}
