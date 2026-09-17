#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { BANDEN } from './leerbanden.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COLUMNS = 16;
const ROWS = 4;
const FLOAT = 5126;

const HELP = `reband.mjs <kit>/<model> <from>:<to> [<from>:<to> ...] [--shells 1,4] [--y a:b]
reband.mjs <kit>/<model> --list
  Moves every vertex on band <from> to band <to> in kits/workfiles/<kit>/<model>.glb,
  keeping its place within the cell.
  --at <0..1>  put them at this place in the cell instead of keeping their own, so
            parts that read as several shades of one band read as one. <from> may
            equal <to> to reposition without changing band.
  --shells  only vertices in those shells; a shell is one connected run of triangles
  --x --y --z  only vertices inside that range, in the model's own units;
            a bound may be left off (--y 1.8: is everything from 1.8 up)
  --list    number the shells with their bands, vertices and extents, and change nothing
  A vertex has to pass every filter given. --list reports the shells a filter reaches.
  Reband a whole shell where a part has to stay whole, and a range where it does not.
  Bands: ${Object.keys(BANDEN).join(' ')}`;

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return null;
  const value = argv[at + 1];
  argv.splice(at, value === undefined || value.startsWith('--') ? 1 : 2);
  return value ?? '';
};

const listOnly = flag('list') !== null;
const shellArg = flag('shells');
const atArg = flag('at');
const placeAt = atArg === null ? null : Number(atArg);
if (placeAt !== null && !(placeAt >= 0 && placeAt <= 1)) throw new Error(`--at wants 0 to 1, got: ${atArg}`);
const ranges = ['x', 'y', 'z'].map((axis) => {
  const given = flag(axis);
  if (given === null) return null;
  const [low, high] = given.split(':');
  if (low === undefined || high === undefined) throw new Error(`--${axis} wants a:b, got: ${given}`);
  const min = low === '' ? -Infinity : Number(low);
  const max = high === '' ? Infinity : Number(high);
  if (!Number.isFinite(min) && low !== '') throw new Error(`--${axis} lower bound is not a number: ${low}`);
  if (!Number.isFinite(max) && high !== '') throw new Error(`--${axis} upper bound is not a number: ${high}`);
  return { axis, min, max };
});
const [id, ...pairs] = argv;
if (!id || (!listOnly && !pairs.length)) {
  console.log(HELP);
  process.exit(1);
}

const wanted = shellArg
  ? new Set(
      shellArg.split(',').map((part) => {
        const n = Number(part.trim());
        if (!Number.isInteger(n) || n < 1) throw new Error(`--shells wants whole numbers from 1, got: ${part}`);
        return n;
      }),
    )
  : null;

const moves = pairs.map((pair) => {
  const [from, to] = pair.split(':');
  if (!BANDEN[from] || !BANDEN[to]) throw new Error(`band not known: ${pair}`);
  return { from, to, fromCell: BANDEN[from], toCell: BANDEN[to], moved: 0 };
});

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;
const bin = Buffer.from(glb.bin);

const bandOfCell = new Map(Object.entries(BANDEN).map(([name, [c, r]]) => [`${c},${r}`, name]));
const cellOf = (u, v) => [
  Math.min(Math.max(Math.floor(u * COLUMNS), 0), COLUMNS - 1),
  Math.min(Math.max(Math.floor(v * ROWS), 0), ROWS - 1),
];

// One target per primitive: where its UVs live in the buffer, and which vertices hang
// together. Shells come from the index buffer, so a welded model still separates into
// the pieces it was built from.
const targets = [];
const seen = new Set();
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const index = prim.attributes?.TEXCOORD_0;
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
    const accessor = json.accessors[index];
    if (accessor.componentType !== FLOAT || accessor.type !== 'VEC2') {
      throw new Error(`${id}: TEXCOORD_0 accessor ${index} is not float VEC2`);
    }
    const view = json.bufferViews[accessor.bufferView];
    targets.push({
      accessor,
      start: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
      step: view.byteStride ?? 8,
      count: accessor.count,
      indices: prim.indices === undefined ? null : readAccessor(glb, prim.indices),
      position: prim.attributes?.POSITION === undefined ? null : readAccessor(glb, prim.attributes.POSITION),
    });
  }
}

function shellsOf(target) {
  const parent = new Int32Array(target.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const idx = target.indices;
  if (idx) {
    for (let t = 0; t + 2 < idx.count; t += 3) {
      union(idx.data[t], idx.data[t + 1]);
      union(idx.data[t + 1], idx.data[t + 2]);
    }
  }
  // Lowest member vertex names a shell, so the numbering follows the file and not the
  // order the groups happened to close in.
  const groups = new Map();
  for (let i = 0; i < parent.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, members]) => members);
}

const shells = [];
for (const target of targets) for (const members of shellsOf(target)) shells.push({ target, members });

function describe(shell) {
  const { target, members } = shell;
  const bands = new Map();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const i of members) {
    const at = target.start + i * target.step;
    const [column, row] = cellOf(bin.readFloatLE(at), bin.readFloatLE(at + 4));
    const name = bandOfCell.get(`${column},${row}`) ?? `${column},${row}`;
    bands.set(name, (bands.get(name) ?? 0) + 1);
    if (!target.position) continue;
    for (let a = 0; a < 3; a++) {
      const value = target.position.data[i * 3 + a];
      if (value < min[a]) min[a] = value;
      if (value > max[a]) max[a] = value;
    }
  }
  const centre = target.position ? min.map((v, a) => (v + max[a]) / 2) : null;
  const size = target.position ? min.map((v, a) => +(max[a] - v).toFixed(3)).join(' × ') : '—';
  return {
    bands: [...bands.keys()].sort().join(' '),
    vertices: members.length,
    size,
    centre,
    at: centre ? centre.map((v) => +v.toFixed(3)).join(' ') : '—',
  };
}

const AXIS = { x: 0, y: 1, z: 2 };
const given = ranges.filter(Boolean);
function inRange(target, i) {
  if (!given.length) return true;
  if (!target.position) throw new Error(`${id}: --x/--y/--z need POSITION on the primitive`);
  return given.every(({ axis, min, max }) => {
    const value = target.position.data[i * 3 + AXIS[axis]];
    return value >= min && value <= max;
  });
}

const keeps = shells.map(
  (shell, n) => (!wanted || wanted.has(n + 1)) && shell.members.some((i) => inRange(shell.target, i)),
);

if (listOnly) {
  const kept = keeps.filter(Boolean).length;
  console.log(`${id}: ${shells.length} shell(s)${kept === shells.length ? '' : `, ${kept} reached by the filters`}`);
  shells.forEach((shell, n) => {
    if (!keeps[n]) return;
    const d = describe(shell);
    console.log(`  ${String(n + 1).padStart(3)}  ${String(d.vertices).padStart(5)} vtx  ${d.bands.padEnd(28)} ${d.size.padEnd(22)} at ${d.at}`);
  });
  process.exit(0);
}

if (wanted) {
  for (const n of wanted) if (n > shells.length) throw new Error(`${id}: no shell ${n}, the model has ${shells.length}`);
}

const chosen = shells.filter((_, n) => keeps[n]);
for (const { target, members } of chosen) {
  for (const i of members) {
    if (!inRange(target, i)) continue;
    const at = target.start + i * target.step;
    const u = bin.readFloatLE(at);
    const v = bin.readFloatLE(at + 4);
    const [column, row] = cellOf(u, v);
    const move = moves.find((m) => m.fromCell[0] === column && m.fromCell[1] === row);
    if (!move) continue;
    bin.writeFloatLE(Math.fround(u + (move.toCell[0] - column) / COLUMNS), at);
    bin.writeFloatLE(
      Math.fround(placeAt === null ? v + (move.toCell[1] - row) / ROWS : (move.toCell[1] + placeAt) / ROWS),
      at + 4,
    );
    move.moved++;
  }
}
for (const target of targets) {
  delete target.accessor.min;
  delete target.accessor.max;
}

const idle = moves.filter((m) => !m.moved);
if (idle.length) throw new Error(`${id}: no vertex on ${idle.map((m) => m.from).join(', ')}`);

// A triangle spanning two cells samples the atlas between them, which is unfilled and
// renders black. No model in the catalogue has one, so a move that makes one is wrong:
// the range cut through a face instead of between two.
let split = 0;
for (const target of targets) {
  if (!target.indices) continue;
  const cellAt = (i) => {
    const at = target.start + i * target.step;
    return cellOf(bin.readFloatLE(at), bin.readFloatLE(at + 4)).join(',');
  };
  const idx = target.indices;
  for (let t = 0; t + 2 < idx.count; t += 3) {
    const a = cellAt(idx.data[t]);
    if (a !== cellAt(idx.data[t + 1]) || a !== cellAt(idx.data[t + 2])) split++;
  }
}
if (split) {
  throw new Error(
    `${id}: the move leaves ${split} triangle(s) spanning two cells, which render black. ` +
      'Pick shells, or a range whose edge falls between faces, and nothing was written.',
  );
}

writeGlb(path, json, bin, writeFileSync);
const parts = [];
if (wanted) parts.push(`shell ${[...wanted].sort((a, b) => a - b).join(', ')}`);
for (const r of ranges.filter(Boolean)) parts.push(`${r.axis} ${r.min}:${r.max}`);
const where = parts.length ? ` in ${parts.join(', ')}` : '';
for (const m of moves) console.log(`${id}: ${m.from} → ${m.to}, ${m.moved} vertices${where}`);
