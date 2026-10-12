import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, faceNormal, welder, edgeKey } from './mesh-edit.mjs';

const HELP = `end-grain.mjs [--band <band>] [--rings <n>] [--up] [--to <band>] <workfile.glb> [...]

Gives the cut ends of logs an end-grain look. An end is a near-flat face in <band>
(default tan) of kits/colormap.png that faces along the long axis of its part
(shells welded on shared positions). Each end is rebuilt as a fan around its
centre with <n> (default 4) rings between centre and rim, and the rings step
between the light and dark end of the band, so the end reads as growth rings
around a darker pith. An end whose rim does not wind once around its centre
is left as it is. --up takes faces that face up instead, for stump tops. --to moves the
ends into another band, for ends that are bark like the rest of the log.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const FLAT = 0.95;
const ALONG = 0.7;
const UP = 0.95;
const LIGHT = 0.2;
const DARK = 0.8;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

function mainAxis(points) {
  const m = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  const c = [0, 1, 2].map((i) => [0, 1, 2].map((j) => points.reduce((s, p) => s + (p[i] - m[i]) * (p[j] - m[j]), 0)));
  let v = [0.577, 0.577, 0.577];
  for (let k = 0; k < 60; k++) v = unit([0, 1, 2].map((i) => dot(c[i], v)));
  return v;
}

function rimLoop(group, idx, weld) {
  const count = new Map();
  const dir = new Map();
  for (const t of group) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t * 3 + k], b = idx[t * 3 + (k + 1) % 3];
      const key = edgeKey(weld(a), weld(b));
      count.set(key, (count.get(key) ?? 0) + 1);
      dir.set(key, [a, b]);
    }
  }
  const next = new Map();
  for (const [key, n] of count) {
    if (n !== 1) continue;
    const [a, b] = dir.get(key);
    if (next.has(weld(a))) return null;
    next.set(weld(a), b);
  }
  if (next.size < 3) return null;
  const start = next.keys().next().value;
  const loop = [];
  let w = start;
  do {
    const v = next.get(w);
    if (v === undefined || loop.length > next.size) return null;
    loop.push(v);
    w = weld(v);
  } while (w !== start);
  return loop.length === next.size ? loop : null;
}

function grain(file, cell, rings, up, to = cell) {
  const glb = readGlb(file);
  const replaced = new Map();
  let ends = 0;
  const inCell = (u, v) => Math.floor(u * 16) === cell[0] && Math.floor(v * 4) === cell[1];
  const uvAt = (t) => [(to[0] + 0.5) / 16, (to[1] + t) / 4];
  const steps = Array.from({ length: rings + 2 }, (_, k) => k / (rings + 1));
  const shade = steps.map((_, k) => ((rings + 1 - k) % 2 ? DARK : LIGHT));
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const triCount = idx.length / 3;
    const p = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const { weld } = welder(pos);

    const shell = new Map();
    const findShell = (w) => (shell.get(w) === w ? w : (shell.set(w, findShell(shell.get(w))), shell.get(w)));
    for (let v = 0; v < pos.length / 3; v++) if (!shell.has(weld(v))) shell.set(weld(v), weld(v));
    for (let t = 0; t < triCount; t++) {
      const w = [0, 1, 2].map((k) => findShell(weld(idx[t * 3 + k])));
      shell.set(w[1], w[0]);
      shell.set(findShell(w[2]), findShell(w[0]));
    }
    const shellPoints = new Map();
    for (let v = 0; v < pos.length / 3; v++) {
      const s = findShell(weld(v));
      if (!shellPoints.has(s)) shellPoints.set(s, []);
      shellPoints.get(s).push(p(v));
    }
    const axes = new Map([...shellPoints].map(([s, pts]) => [s, mainAxis(pts)]));

    const tris = [];
    for (let t = 0; t < triCount; t++) {
      const c = [0, 1, 2].map((k) => idx[t * 3 + k]);
      if (c.every((v) => inCell(uv[v * 2], uv[v * 2 + 1]))) tris.push(t);
    }
    if (!tris.length) continue;
    const normals = new Map(tris.map((t) => [t, unit(faceNormal(pos, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]))]));
    const edgeTris = new Map();
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(weld(idx[t * 3 + k]), weld(idx[t * 3 + (k + 1) % 3]));
        if (!edgeTris.has(key)) edgeTris.set(key, []);
        edgeTris.get(key).push(t);
      }
    }
    const parent = new Map(tris.map((t) => [t, t]));
    const find = (t) => (parent.get(t) === t ? t : (parent.set(t, find(parent.get(t))), parent.get(t)));
    for (const list of edgeTris.values()) {
      for (let i = 1; i < list.length; i++) {
        if (dot(normals.get(list[0]), normals.get(list[i])) >= FLAT) parent.set(find(list[i]), find(list[0]));
      }
    }
    const groups = new Map();
    for (const t of tris) {
      const r = find(t);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(t);
    }

    const adder = vertexAdder(glb, prim);
    const drop = new Set();
    const added = [];
    for (const group of groups.values()) {
      const n = unit(group.reduce((s, t) => s.map((x, k) => x + normals.get(t)[k]), [0, 0, 0]));
      const axis = up ? [0, 1, 0] : axes.get(findShell(weld(idx[group[0] * 3])));
      if (up ? dot(n, axis) < UP : Math.abs(dot(n, axis)) < ALONG) continue;
      const loop = rimLoop(group, idx, weld);
      if (!loop) continue;
      let area = 0;
      const centre = [0, 0, 0];
      for (const t of group) {
        const [a, b, c] = [0, 1, 2].map((k) => p(idx[t * 3 + k]));
        const ab = sub(b, a), ac = sub(c, a);
        const s = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
        area += s;
        for (let k = 0; k < 3; k++) centre[k] += (s * (a[k] + b[k] + c[k])) / 3;
      }
      for (let k = 0; k < 3; k++) centre[k] /= area;
      const folds = loop.some((v, i) => {
        const a = sub(p(v), centre), b = sub(p(loop[(i + 1) % loop.length]), centre);
        return dot([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], n) <= 0;
      });
      if (folds) continue;
      const rows = steps.map((f, k) => {
        if (k === 0) return [adder.add(loop[0], { POSITION: centre, TEXCOORD_0: uvAt(shade[0]) })];
        return loop.map((v) => adder.add(v, {
          POSITION: p(v).map((x, j) => centre[j] + f * (x - centre[j])),
          TEXCOORD_0: uvAt(shade[k]),
        }));
      });
      const at = (k, i) => rows[k][k === 0 ? 0 : i % loop.length];
      for (let i = 0; i < loop.length; i++) {
        added.push([at(0, 0), at(1, i), at(1, i + 1)]);
        for (let k = 1; k < rows.length - 1; k++) {
          added.push([at(k, i), at(k + 1, i), at(k + 1, i + 1)], [at(k, i), at(k + 1, i + 1), at(k, i + 1)]);
        }
      }
      group.forEach((t) => drop.add(t));
      ends++;
    }
    if (!drop.size) continue;
    const out = [];
    for (let t = 0; t < triCount; t++) if (!drop.has(t)) out.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
    for (const tri of added) out.push(...tri);
    adder.commit(out, replaced);
  }
  if (!ends) return 0;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return ends;
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = {};
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--up') options.up = true;
  else if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
  else files.push(argv[i]);
}
const band = options.band ?? 'tan';
if (!BANDS[band]) throw new Error(`no such band: ${band}`);
const cell = BANDS[band].split(',').map(Number);
const rings = Number(options.rings ?? 4);
if (options.to && !BANDS[options.to]) throw new Error(`no such band: ${options.to}`);
const to = options.to ? BANDS[options.to].split(',').map(Number) : cell;
for (const file of files) console.log(`${file}: ${grain(file, cell, rings, options.up, to)} ends`);
