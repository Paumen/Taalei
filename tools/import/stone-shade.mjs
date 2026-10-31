import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder, buildTree, hitBox, hitTriangle } from './mesh-edit.mjs';

const HELP = `stone-shade.mjs [options] <workfile.glb> [...]

Shades the stone of one band (default taupe, cell 14,3) from flat. Every other
band stays as it is. Per vertex, v within the band is
  base + whole * (height in the model's stone, top -0.5 .. bottom +0.5)
       + piece * (height in its own piece, same scale)
       - up * upward facing + down * downward facing
       + shadow * max(recess, overhang)
       + trim step,
kept within 0.03 .. 0.94.
recess is how closed in the spot is within --near of the stone's size,
overhang how much of the sky right above it is covered within --over of its
height, both by the whole model.

  --cell <c,r>     band cell (14,3)
  --base <f>       0.42
  --whole <f>      0.50
  --piece <f>      0.15
  --up <f>         0.12
  --down <f>       0.08
  --shadow <f>     0.20
  --trim <f>       0.08   caps and sills lighter, plinths darker
  --near <f>       0.12
  --over <f>       0.35
  --open <f>       0.2    share of closed-in sky a spot may have before it darkens
  --dry`;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function hemisphere(n) {
  const out = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (i + 0.5) / n;
    const r = Math.sqrt(1 - z * z);
    out.push([Math.cos(g * i) * r, Math.sin(g * i) * r, z]);
  }
  return out;
}
const HEMI = hemisphere(48).map(([x, y, z]) => [x, y, Math.sqrt(z)]).map(norm);
const CONE = hemisphere(64).filter(([, , z]) => z > Math.cos((30 * Math.PI) / 180)).map(([x, y, z]) => [x, z, y]);

function frame(n) {
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const a = norm([t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]);
  const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  return (d) => [a[0] * d[0] + b[0] * d[1] + n[0] * d[2], a[1] * d[0] + b[1] * d[1] + n[1] * d[2], a[2] * d[0] + b[2] * d[1] + n[2] * d[2]];
}

function blocked(tree, tris, o, d, far) {
  const inv = d.map((x) => 1 / x);
  const stack = [tree.root];
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, far)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = hitTriangle(o, d, tris[tree.order[i]]);
      if (t > 0 && t < far) return true;
    }
  }
  return false;
}

const transform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const turn = (m, p) => norm([m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]);

function shade(file, o) {
  const glb = readGlb(file);
  const [cu, cv] = o.cell.split(',').map(Number);
  const prims = editablePrimitives(glb.json).filter((p) => p.attributes.TEXCOORD_0 !== undefined && glb.json.accessors[p.attributes.TEXCOORD_0].componentType === 5126);
  const all = [];
  const stone = [];
  for (const prim of (glb.json.meshes ?? []).flatMap((m) => m.primitives)) {
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = readAccessor(glb, prim.indices).data;
    const w = [];
    for (let i = 0; i < pos.length / 3; i++) w.push(transform(m, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]));
    for (let t = 0; t < idx.length; t += 3) all.push([w[idx[t]], w[idx[t + 1]], w[idx[t + 2]]]);
    if (!prims.includes(prim)) continue;
    const uv = Float32Array.from(readAccessor(glb, prim.attributes.TEXCOORD_0).data);
    const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(glb, prim.attributes.NORMAL).data : null;
    stone.push({ prim, m, pos, idx, w, uv, nrm });
  }
  if (!all.length) return 0;
  const tree = buildTree(all);
  let low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const tri of all) for (const p of tri) for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], p[k]); high[k] = Math.max(high[k], p[k]); }
  const size = Math.max(...sub(high, low));
  const eps = 1e-3 * size;

  const verts = [];
  for (const s of stone) {
    const { pos, idx, uv, w } = s;
    const count = pos.length / 3;
    const cell = new Array(count).fill(null);
    const fn = Array.from({ length: count }, () => [0, 0, 0]);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const ku = Math.floor(((uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3) * 16);
      const kv = Math.floor(((uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3) * 4);
      const mine = ku === cu && kv === cv;
      const e1 = sub(w[b], w[a]), e2 = sub(w[c], w[a]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const v of [a, b, c]) {
        cell[v] = cell[v] === null || cell[v] === mine ? mine : 'mixed';
        for (let k = 0; k < 3; k++) fn[v][k] += n[k];
      }
    }
    const { weld } = welder(pos);
    for (let i = 0; i < count; i++) {
      if (cell[i] !== true) continue;
      const n = s.nrm ? turn(s.m, [s.nrm[3 * i], s.nrm[3 * i + 1], s.nrm[3 * i + 2]]) : norm(fn[i]);
      verts.push({ s, i, p: w[i], n, key: `${verts.length}`, point: `${stone.indexOf(s)}:${weld(i)}` });
    }
    s.trisMine = [];
    for (let t = 0; t < idx.length; t += 3) if (cell[idx[t]] === true && cell[idx[t + 1]] === true && cell[idx[t + 2]] === true) s.trisMine.push(t);
  }
  if (!verts.length) return 0;

  const parent = new Map();
  const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  const byVert = new Map(verts.map((v) => [`${stone.indexOf(v.s)}#${v.i}`, v]));
  for (const s of stone) for (const t of s.trisMine) {
    const [a, b, c] = [0, 1, 2].map((k) => byVert.get(`${stone.indexOf(s)}#${s.idx[t + k]}`).point);
    join(a, b); join(b, c);
  }
  const pieces = new Map();
  for (const v of verts) {
    v.piece = find(v.point);
    const pc = pieces.get(v.piece) ?? { low: [Infinity, Infinity, Infinity], high: [-Infinity, -Infinity, -Infinity], verts: [] };
    for (let k = 0; k < 3; k++) { pc.low[k] = Math.min(pc.low[k], v.p[k]); pc.high[k] = Math.max(pc.high[k], v.p[k]); }
    pc.verts.push(v);
    pieces.set(v.piece, pc);
  }
  let yLow = Infinity, yHigh = -Infinity;
  for (const v of verts) { yLow = Math.min(yLow, v.p[1]); yHigh = Math.max(yHigh, v.p[1]); }
  const span = yHigh - yLow || 1;

  for (const [, pc] of pieces) {
    const h = pc.high[1] - pc.low[1];
    const wide = Math.max(pc.high[0] - pc.low[0], pc.high[2] - pc.low[2]);
    pc.trim = 0;
    if (pieces.size < 2 || h > 0.35 * wide || h > 0.25 * span) continue;
    const mid = (pc.high[1] + pc.low[1]) / 2;
    const rel = (mid - yLow) / span;
    if (rel > 0.5) pc.trim = -o.trim;
    else if (pc.low[1] - yLow < 0.05 * span) pc.trim = o.trim;
  }

  const near = o.near * size;
  let moved = 0;
  for (const v of verts) {
    const pc = pieces.get(v.piece);
    const ph = pc.high[1] - pc.low[1];
    const hWhole = (yHigh - v.p[1]) / span - 0.5;
    const hPiece = ph > 1e-9 ? (pc.high[1] - v.p[1]) / ph - 0.5 : 0;
    const origin = [v.p[0] + v.n[0] * eps, v.p[1] + v.n[1] * eps, v.p[2] + v.n[2] * eps];
    const f = frame(v.n);
    let hit = 0;
    for (const d of HEMI) if (blocked(tree, all, origin, f(d), near)) hit++;
    const recess = Math.max(0, Math.min(1, (hit / HEMI.length - o.open) / 0.35));
    let overhang = 0;
    if (v.n[1] > -0.3) {
      const far = o.over * span;
      const up = [v.p[0] + v.n[0] * eps * 4, v.p[1] + eps, v.p[2] + v.n[2] * eps * 4];
      let c = 0;
      for (const d of CONE) if (blocked(tree, all, up, d, far)) c++;
      overhang = Math.max(0, Math.min(1, (c / CONE.length - 0.25) / 0.5));
    }
    let val = o.base + o.whole * hWhole * (hWhole < 0 ? 1 - overhang : 1) + o.piece * hPiece
      - o.up * Math.max(0, v.n[1]) + o.down * Math.max(0, -v.n[1])
      + o.shadow * Math.max(recess, overhang) + pc.trim;
    val = Math.max(0.03, Math.min(0.94, val));
    v.s.uv[2 * v.i + 1] = (cv + val) / 4;
    moved++;
  }
  if (!o.dry) {
    const replaced = new Map(stone.map((s) => [s.prim.attributes.TEXCOORD_0, Buffer.from(s.uv.buffer)]));
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return moved;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opts = { cell: '14,3', base: 0.42, whole: 0.5, piece: 0.15, up: 0.12, down: 0.08, shadow: 0.2, trim: 0.08, near: 0.12, over: 0.35, open: 0.2, dry: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry') { opts.dry = true; continue; }
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  if (!(k in opts)) throw new Error(`unknown ${a}`);
  opts[k] = k === 'cell' ? args[i + 1] : Number(args[i + 1]);
  args[i + 1] = '';
  i++;
}
for (const file of args.filter((a) => a && !a.startsWith('--'))) console.log(`${file}: ${shade(file, opts)} vertices`);
