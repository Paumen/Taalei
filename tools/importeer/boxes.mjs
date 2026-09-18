#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, meshShells } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FLOAT = 5126;
const ATTRIBUTES = ['POSITION', 'NORMAL', 'TEXCOORD_0'];
const WIDTH = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2 };

const HELP = `boxes.mjs <kit>/<model> --list
boxes.mjs <kit>/<model> --remove all|<n,m,...>
  Finds the crates standing on a model in kits/workfiles/<kit>/<model>.glb and takes
  them out. A crate is a box-shaped body with slats and battens sitting inside its own
  bounds: that is what keeps roof tiles, rocks and barrels out of the list.
  --list    number the crates with their size and place, and change nothing
  --remove  take out those crates, body and slats, by the numbers --list gives,
            and with them whatever stands on them
  --shells  print the shell numbers of those crates for render.mjs --mark, and
            change nothing`;

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return null;
  const value = argv[at + 1];
  argv.splice(at, value === undefined || value.startsWith('--') ? 1 : 2);
  return value ?? '';
};

const listOnly = flag('list') !== null;
const shellsOnly = flag('shells');
const removeArg = flag('remove');
const [id] = argv;
if (!id || (!listOnly && shellsOnly === null && removeArg === null)) {
  console.log(HELP);
  process.exit(1);
}

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;
if (json.animations?.length || json.skins?.length) throw new Error(`${id}: animated or skinned models are not touched`);

// The objects a model is built from. Flat shading splits a vertex along every hard edge,
// so one object is many shells; welding the shells that share a vertex position puts an
// object back together while two that only intersect in space stay apart.
function objects() {
  const out = [];
  let first = 0;
  for (const group of meshShells(glb)) {
    const pos = readAccessor(glb, group.prim.attributes.POSITION);
    const idx = readAccessor(glb, group.prim.indices);
    const key = (i) => [0, 1, 2].map((k) => Math.round(pos.data[i * 3 + k] * 1e4)).join(',');
    const parent = group.members.map((_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const owner = new Map();
    group.members.forEach((members, s) => {
      for (const v of members) {
        const k = key(v);
        if (owner.has(k)) {
          const a = find(owner.get(k));
          const b = find(s);
          if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
        } else owner.set(k, s);
      }
    });
    const of = new Map();
    group.members.forEach((members, s) => {
      for (const v of members) of.set(v, find(s));
    });
    const byRoot = new Map();
    for (let t = 0; t + 2 < idx.count; t += 3) {
      const root = of.get(idx.data[t]);
      if (!byRoot.has(root)) byRoot.set(root, { vertices: new Set(), triangles: [] });
      const part = byRoot.get(root);
      part.triangles.push(t);
      for (let k = 0; k < 3; k++) part.vertices.add(idx.data[t + k]);
    }
    for (const [root, part] of byRoot) {
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const v of part.vertices) {
        for (let k = 0; k < 3; k++) {
          const c = pos.data[v * 3 + k];
          if (c < lo[k]) lo[k] = c;
          if (c > hi[k]) hi[k] = c;
        }
      }
      // how square the object reads from above: a box measures √2 between its corners and
      // its faces whichever way it is turned, a barrel or an urn stays nearer its middle
      const centre = [0, 2].map((k) => (lo[k] + hi[k]) / 2);
      const smallest = Math.min(...[0, 1, 2].map((k) => hi[k] - lo[k]));
      const radii = [...part.vertices]
        .map((v) => Math.hypot(pos.data[v * 3] - centre[0], pos.data[v * 3 + 2] - centre[1]))
        .filter((r) => r > 0.2 * smallest);
      out.push({
        prim: group.prim,
        vertices: part.vertices,
        square: radii.length ? Math.max(...radii) / Math.min(...radii) : 0,
        lo,
        hi,
        size: [0, 1, 2].map((k) => hi[k] - lo[k]),
        shells: group.members.map((_, s) => s).filter((s) => find(s) === root).map((s) => first + s + 1),
      });
    }
    first += group.members.length;
  }
  return out;
}

const parts = objects();
const span = Math.max(
  ...[0, 1, 2].map((k) => Math.max(...parts.map((p) => p.hi[k])) - Math.min(...parts.map((p) => p.lo[k]))),
);

const inside = (a, b, pad) => [0, 1, 2].every((k) => a.lo[k] >= b.lo[k] - pad && a.hi[k] <= b.hi[k] + pad);

const found = [];
for (const body of parts) {
  const sides = [...body.size].sort((a, b) => a - b);
  if (!(sides[0] > 0.02 * span && sides[2] < 0.25 * span && sides[2] / sides[0] < 2.4)) continue;
  if (!(body.square > 1.35 && body.square < 1.6)) continue;
  // the slats run the full height of a crate, so what marks them is that they are thin,
  // not that they are small, and that they stay within the body they are nailed to
  const slats = parts.filter((p) => p !== body && Math.min(...p.size) < 0.25 * sides[2] && inside(p, body, 0.15 * sides[0]));
  if (slats.length < 3) continue;
  found.push({ body, slats });
}
const crates = found
  .filter((c) => !found.some((d) => d !== c && Math.max(...d.body.size) > Math.max(...c.body.size) && inside(c.body, d.body, 0)))
  .sort((a, b) => a.body.lo[0] - b.body.lo[0] || a.body.lo[2] - b.body.lo[2]);

// which crate a crate stands on: taking the bottom one away without the ones above it
// leaves them hanging in the air
const overlaps = (a, b) => [0, 2].every((k) => a.body.lo[k] < b.body.hi[k] && a.body.hi[k] > b.body.lo[k]);
const standsOn = crates.map((c) =>
  crates.findIndex((under) => under !== c && Math.abs(c.body.lo[1] - under.body.hi[1]) < 0.02 * span && overlaps(c, under)),
);
const withStack = (chosen) => {
  const out = new Set(chosen);
  for (let again = true; again; ) {
    again = false;
    standsOn.forEach((under, n) => {
      if (under !== -1 && out.has(under + 1) && !out.has(n + 1)) {
        out.add(n + 1);
        again = true;
      }
    });
  }
  return [...out].sort((a, b) => a - b);
};

const pick = (arg) => {
  if (arg === 'all') return crates.map((_, i) => i + 1);
  const wanted = arg.split(',').map((part) => {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1) throw new Error(`--remove wants whole numbers from 1 or all, got: ${part}`);
    if (n > crates.length) throw new Error(`${id}: no crate ${n}, the model has ${crates.length}`);
    return n;
  });
  return withStack([...new Set(wanted)]);
};

if (listOnly || shellsOnly !== null) {
  const chosen = pick(shellsOnly || 'all');
  if (shellsOnly !== null) {
    const taken = crates.filter((_, i) => chosen.includes(i + 1));
    console.log([...new Set(taken.flatMap((c) => [c.body, ...c.slats].flatMap((p) => p.shells)))].join(','));
    process.exit(0);
  }
  console.log(`${id}: ${crates.length} crate(s)`);
  crates.forEach((c, n) => {
    const size = c.body.size.map((v) => +v.toFixed(3)).join(' × ');
    const at = [0, 1, 2].map((k) => +((c.body.lo[k] + c.body.hi[k]) / 2).toFixed(3)).join(' ');
    const on = standsOn[n] === -1 ? 'on the ground' : `on ${standsOn[n] + 1}`;
    console.log(`  ${String(n + 1).padStart(3)}  ${size.padEnd(22)} at ${at.padEnd(22)} ${String(c.slats.length).padStart(2)} slat(s)  ${on}`);
  });
  process.exit(0);
}

const taken = crates.filter((_, n) => pick(removeArg).includes(n + 1));
if (!taken.length) throw new Error(`${id}: no crate to take out`);

const gone = new Map();
for (const crate of taken) {
  for (const part of [crate.body, ...crate.slats]) {
    if (!gone.has(part.prim)) gone.set(part.prim, new Set());
    for (const v of part.vertices) gone.get(part.prim).add(v);
  }
}

const chunks = [];
const bufferViews = [];
const accessors = [];
let length = 0;

const add = (data, target, componentType, type, count, bounds) => {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const padding = (4 - (length % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    length += padding;
  }
  bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buf.length, target });
  chunks.push(buf);
  length += buf.length;
  accessors.push({ bufferView: bufferViews.length - 1, componentType, count, type, ...bounds });
  return accessors.length - 1;
};

const bounds = (data, width) => {
  const min = new Array(width).fill(Infinity);
  const max = new Array(width).fill(-Infinity);
  for (let i = 0; i < data.length; i++) {
    const k = i % width;
    if (data[i] < min[k]) min[k] = data[i];
    if (data[i] > max[k]) max[k] = data[i];
  }
  return { min, max };
};

let removed = 0;
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if ((prim.mode ?? 4) !== 4) throw new Error(`${id}: primitive mode ${prim.mode} is not triangles`);
    const extra = Object.keys(prim.attributes).filter((a) => !ATTRIBUTES.includes(a));
    if (extra.length) throw new Error(`${id}: primitive carries ${extra.join(', ')}, which this tool does not rewrite`);
    const source = Object.fromEntries(ATTRIBUTES.map((a) => [a, readAccessor(glb, prim.attributes[a]).data]));
    const idx = readAccessor(glb, prim.indices);
    const drop = gone.get(prim) ?? new Set();

    const keep = [];
    for (let t = 0; t + 2 < idx.count; t += 3) {
      if ([0, 1, 2].some((k) => drop.has(idx.data[t + k]))) {
        removed++;
        continue;
      }
      keep.push(idx.data[t], idx.data[t + 1], idx.data[t + 2]);
    }

    const moved = new Map();
    const data = Object.fromEntries(ATTRIBUTES.map((a) => [a, []]));
    const indices = keep.map((v) => {
      if (!moved.has(v)) {
        moved.set(v, moved.size);
        for (const a of ATTRIBUTES) {
          const width = WIDTH[a];
          for (let k = 0; k < width; k++) data[a].push(source[a][v * width + k]);
        }
      }
      return moved.get(v);
    });

    for (const a of ATTRIBUTES) {
      const width = WIDTH[a];
      prim.attributes[a] = add(
        Float32Array.from(data[a]),
        34962,
        FLOAT,
        width === 3 ? 'VEC3' : 'VEC2',
        data[a].length / width,
        a === 'POSITION' ? bounds(data[a], width) : {},
      );
    }
    const narrow = moved.size <= 0xffff;
    prim.indices = add(
      narrow ? Uint16Array.from(indices) : Uint32Array.from(indices),
      34963,
      narrow ? 5123 : 5125,
      'SCALAR',
      indices.length,
      {},
    );
  }
}

json.accessors = accessors;
json.bufferViews = bufferViews;
const bin = Buffer.concat(chunks);
json.buffers = [{ byteLength: bin.length }];
writeGlb(path, json, bin, writeFileSync);
console.log(`${id}: ${taken.length} of ${crates.length} crate(s) out, ${removed} triangles`);
