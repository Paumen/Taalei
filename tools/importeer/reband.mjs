#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, meshShells } from '../../catalog/tools/glb.mjs';
import { BANDEN } from './leerbanden.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COLUMNS = 16;
const ROWS = 4;
const FLOAT = 5126;
// A place of exactly 1 reads as the first row of the cell below, so --fit leaves
// this much of the cell free at either end.
const INSET = 0.02;

const HELP = `reband.mjs <kit>/<model> <from>:<to> [<from>:<to> ...] [--shells 1,4] [--y a:b]
reband.mjs <kit>/<model> --list
  Moves every vertex on band <from> to band <to> in kits/workfiles/<kit>/<model>.glb,
  keeping its place within the cell.
  --at <0..1>  put them at this place in the cell instead of keeping their own, so
            parts that read as several shades of one band read as one. <from> may
            equal <to> to reposition without changing band.
  --centre <0..1>  shift them so their average place in the cell is this one,
            keeping the spread between them, so models level against each other
            without losing their own shading. The average weighs each place by
            the face area carrying it, which is what the eye reads. The shift is
            held back where it would push a vertex out of the cell.
  --fit     with --centre, narrow the spread around the new centre until it fits
            the cell instead of holding the shift back, so a model whose vertices
            already reach both ends of the cell still lands on the centre asked for.
            The spread is only ever narrowed, never widened.
  --shells  only vertices in those shells; a shell is one connected run of triangles
  --mesh    only the mesh of that name, for a model whose parts are separate nodes
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
const meshArg = flag('mesh');
const atArg = flag('at');
const placeAt = atArg === null ? null : Number(atArg);
if (placeAt !== null && !(placeAt >= 0 && placeAt <= 1)) throw new Error(`--at wants 0 to 1, got: ${atArg}`);
const centreArg = flag('centre');
const centreOn = centreArg === null ? null : Number(centreArg);
if (centreOn !== null && !(centreOn >= 0 && centreOn <= 1)) throw new Error(`--centre wants 0 to 1, got: ${centreArg}`);
if (placeAt !== null && centreOn !== null) throw new Error('--at and --centre ask for different things; give one');
const fitSpread = flag('fit') !== null;
if (fitSpread && centreOn === null) throw new Error('--fit narrows the spread around --centre; give --centre too');
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

// One target per UV-carrying primitive: where its UVs live in the buffer, plus the
// accessors the filters read. meshShells gives the shell numbering, so reband and
// render.mjs address the same parts by the same numbers.
const prims = meshShells(glb);
const targets = prims.map(({ mesh, prim, uv, count }) => {
  const accessor = json.accessors[uv];
  if (accessor.componentType !== FLOAT || accessor.type !== 'VEC2') {
    throw new Error(`${id}: TEXCOORD_0 accessor ${uv} is not float VEC2`);
  }
  const view = json.bufferViews[accessor.bufferView];
  return {
    accessor,
    mesh,
    start: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    step: view.byteStride ?? 8,
    count,
    indices: prim.indices === undefined ? null : readAccessor(glb, prim.indices),
    position: prim.attributes?.POSITION === undefined ? null : readAccessor(glb, prim.attributes.POSITION),
  };
});

const shells = [];
prims.forEach((prim, n) => {
  for (const members of prim.members) shells.push({ target: targets[n], members });
});

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

// A vertex carries a third of the area of every face on it. Levelling weighs the
// places by that, because a band reads as the surface it covers, not as the number
// of vertices holding it: dense detail carries many vertices over little area and a
// broad face few over a lot.
function faceAreas(target) {
  if (!target.position) return null;
  const weights = new Float64Array(target.count);
  const idx = target.indices;
  const corners = idx ? idx.count : target.count;
  const corner = (t) => (idx ? idx.data[t] : t);
  const at = (i, a) => target.position.data[i * 3 + a];
  for (let t = 0; t + 2 < corners; t += 3) {
    const [a, b, c] = [corner(t), corner(t + 1), corner(t + 2)];
    const u = [0, 1, 2].map((k) => at(b, k) - at(a, k));
    const v = [0, 1, 2].map((k) => at(c, k) - at(a, k));
    const share =
      Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 6;
    weights[a] += share;
    weights[b] += share;
    weights[c] += share;
  }
  return weights;
}

for (const target of targets) target.weights = faceAreas(target);

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

if (meshArg !== null && !targets.some((t) => t.mesh === meshArg)) {
  const names = [...new Set(targets.map((t) => t.mesh || '(unnamed)'))].join(', ');
  throw new Error(`${id}: no mesh named ${meshArg}. This model has: ${names}`);
}

const keeps = shells.map(
  (shell, n) =>
    (!wanted || wanted.has(n + 1)) &&
    (meshArg === null || shell.target.mesh === meshArg) &&
    shell.members.some((i) => inRange(shell.target, i)),
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
const picked = [];
for (const { target, members } of chosen) {
  for (const i of members) {
    if (!inRange(target, i)) continue;
    const at = target.start + i * target.step;
    const u = bin.readFloatLE(at);
    const v = bin.readFloatLE(at + 4);
    const [column, row] = cellOf(u, v);
    const move = moves.find((m) => m.fromCell[0] === column && m.fromCell[1] === row);
    if (!move) continue;
    picked.push({ at, u, v, column, row, move, place: v * ROWS - row, weight: target.weights ? target.weights[i] : 1 });
    move.moved++;
  }
}

let mean = 0;
let shift = 0;
let scale = 1;
if (centreOn !== null && picked.length) {
  const places = picked.map((p) => p.place);
  const carried = picked.reduce((sum, p) => sum + p.weight, 0);
  mean = carried > 0
    ? picked.reduce((sum, p) => sum + p.place * p.weight, 0) / carried
    : places.reduce((sum, p) => sum + p, 0) / places.length;
  const low = Math.min(...places);
  const high = Math.max(...places);
  if (fitSpread) {
    shift = centreOn - mean;
    const below = mean - low;
    const above = high - mean;
    scale = Math.min(
      1,
      below > 0 ? (centreOn - INSET) / below : Infinity,
      above > 0 ? (1 - INSET - centreOn) / above : Infinity,
    );
    if (!(scale > 0)) throw new Error(`${id}: --centre ${centreOn} leaves no room in the cell for the spread`);
  } else {
    shift = Math.min(Math.max(centreOn - mean, -low), 1 - high);
  }
}

for (const { at, u, v, column, row, move, place } of picked) {
  bin.writeFloatLE(Math.fround(u + (move.toCell[0] - column) / COLUMNS), at);
  let place2 = placeAt === null ? place : placeAt;
  if (centreOn !== null) place2 = mean + shift + (place - mean) * scale;
  bin.writeFloatLE(
    Math.fround(placeAt === null && centreOn === null ? v + (move.toCell[1] - row) / ROWS : (move.toCell[1] + place2) / ROWS),
    at + 4,
  );
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
if (meshArg !== null) parts.push(`mesh ${meshArg}`);
for (const r of ranges.filter(Boolean)) parts.push(`${r.axis} ${r.min}:${r.max}`);
const where = parts.length ? ` in ${parts.join(', ')}` : '';
const narrowed = scale === 1 ? '' : `, spread × ${scale.toFixed(3)}`;
const levelled = centreOn === null ? '' : `, centred on ${centreOn} by ${shift.toFixed(3)}${narrowed}`;
for (const m of moves) console.log(`${id}: ${m.from} → ${m.to}, ${m.moved} vertices${where}${levelled}`);
