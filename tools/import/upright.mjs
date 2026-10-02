import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { rawRows, repack, fixBounds } from './mesh-edit.mjs';

const HELP = `upright.mjs [--up <±x|±y|±z|x,y,z>] [--front <±x|±y|±z|x,y,z>] [--dry] <workfile.glb> [...]

Turns a model so the axis named by --up points up and the one named by --front
points to the front (+z), then sets it on the ground (lowest point at y 0) and
centres it in x and z. Axes are the model's current world axes, or any
direction given as x,y,z; --front is made square to --up. --up defaults to
the longest axis, --front to the shortest of the other two, both positive. The
turn is baked into positions, normals and tangents; node transforms are kept.
--dry prints the turn and the new size without writing.`;

const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function axis(text) {
  const m = /^([+-]?)([xyz])$/.exec(text ?? '');
  if (m) return AXES[m[2]].map((v) => (m[1] === '-' ? -v : v));
  const v = (text ?? '').split(',').map(Number);
  if (v.length !== 3 || v.some((x) => !Number.isFinite(x)) || !Math.hypot(...v)) throw new Error(`not an axis: ${text}`);
  return v.map((x) => x / Math.hypot(...v));
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const apply = (m, v, w = 1) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * w);

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function invert(m) {
  const lin = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const det = lin[0][0] * (lin[1][1] * lin[2][2] - lin[1][2] * lin[2][1])
    - lin[0][1] * (lin[1][0] * lin[2][2] - lin[1][2] * lin[2][0])
    + lin[0][2] * (lin[1][0] * lin[2][1] - lin[1][1] * lin[2][0]);
  const inv = [0, 1, 2].map((r) => [0, 1, 2].map((c) => {
    const rows = [0, 1, 2].filter((i) => i !== c);
    const cols = [0, 1, 2].filter((i) => i !== r);
    const minor = lin[rows[0]][cols[0]] * lin[rows[1]][cols[1]] - lin[rows[0]][cols[1]] * lin[rows[1]][cols[0]];
    return (((r + c) % 2 ? -1 : 1) * minor) / det;
  }));
  const out = [inv[0][0], inv[1][0], inv[2][0], 0, inv[0][1], inv[1][1], inv[2][1], 0, inv[0][2], inv[1][2], inv[2][2], 0, 0, 0, 0, 1];
  const t = apply(out, [m[12], m[13], m[14]], 0);
  out[12] = -t[0]; out[13] = -t[1]; out[14] = -t[2];
  return out;
}

function meshNodes(glb) {
  const world = worldMatrices(glb.json);
  const nodes = (glb.json.nodes ?? []).map((node, i) => ({ node, world: world[i] })).filter((n) => n.node.mesh !== undefined && n.world);
  const seen = new Set();
  for (const { node } of nodes) {
    if (seen.has(node.mesh)) throw new Error(`mesh ${node.mesh} is used by more than one node`);
    seen.add(node.mesh);
  }
  if (glb.json.skins?.length) throw new Error('skinned models are not supported');
  return nodes;
}

function bounds(glb, nodes, turn) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { node, world } of nodes) {
    const m = multiply(turn, world);
    for (const prim of glb.json.meshes[node.mesh].primitives) {
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      for (let i = 0; i < pos.length; i += 3) {
        const p = apply(m, [pos[i], pos[i + 1], pos[i + 2]]);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
    }
  }
  return { min, max };
}

function rewrite(glb, index, fn, replaced, done) {
  if (done.has(index)) return;
  done.add(index);
  const accessor = glb.json.accessors[index];
  if (accessor.componentType !== 5126) throw new Error(`accessor ${index} is not float`);
  const { data, width, count } = readAccessor(glb, index);
  const out = new Float32Array(count * width);
  for (let i = 0; i < count; i++) {
    const v = fn([data[i * width], data[i * width + 1], data[i * width + 2]]);
    for (let k = 0; k < width; k++) out[i * width + k] = k < 3 ? v[k] : data[i * width + k];
  }
  const { size } = rawRows(glb, index);
  if (size !== width * 4) throw new Error(`accessor ${index} is not tightly packed`);
  replaced.set(index, Buffer.from(out.buffer, out.byteOffset, out.byteLength));
}

function upright(file, upArg, frontArg, dry) {
  const glb = readGlb(file);
  const nodes = meshNodes(glb);
  const before = bounds(glb, nodes, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const size = [0, 1, 2].map((k) => before.max[k] - before.min[k]);
  const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
  const up = upArg ? axis(upArg) : AXES['xyz'[order[0]]];
  const rest = order.filter((k) => Math.abs(up[k]) < 0.5);
  const given = frontArg ? axis(frontArg) : AXES['xyz'[rest.sort((a, b) => size[a] - size[b])[0]]];
  if (Math.abs(dot(up, given)) > 0.95) throw new Error('--up and --front must be different axes');
  const square = given.map((v, k) => v - dot(up, given) * up[k]);
  const front = square.map((v) => v / Math.hypot(...square));
  const right = cross(up, front);
  const turn = [right[0], up[0], front[0], 0, right[1], up[1], front[1], 0, right[2], up[2], front[2], 0, 0, 0, 0, 1];

  const turned = bounds(glb, nodes, turn);
  const shift = [-(turned.min[0] + turned.max[0]) / 2, -turned.min[1], -(turned.min[2] + turned.max[2]) / 2];
  const placed = multiply([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...shift, 1], turn);
  const wdh = [turned.max[0] - turned.min[0], turned.max[2] - turned.min[2], turned.max[1] - turned.min[1]].map((v) => +v.toFixed(3));
  const name = (v) => (v.filter((x) => Math.abs(x) > 1e-9).length === 1
    ? `${v.find((x) => Math.abs(x) > 1e-9) < 0 ? '-' : '+'}${'xyz'[v.findIndex((x) => Math.abs(x) > 1e-9)]}`
    : v.map((x) => +x.toFixed(3)).join(','));
  if (dry) return { up: name(up), front: name(front), wdh };

  const replaced = new Map();
  const done = new Set();
  for (const { node, world } of nodes) {
    const m = multiply(invert(world), multiply(placed, world));
    const direction = (v) => {
      const d = apply(m, v, 0);
      const l = Math.hypot(...d) || 1;
      return d.map((x) => x / l);
    };
    for (const prim of glb.json.meshes[node.mesh].primitives) {
      rewrite(glb, prim.attributes.POSITION, (v) => apply(m, v), replaced, done);
      if (prim.attributes.NORMAL !== undefined) rewrite(glb, prim.attributes.NORMAL, direction, replaced, done);
      if (prim.attributes.TANGENT !== undefined) rewrite(glb, prim.attributes.TANGENT, direction, replaced, done);
      for (const target of prim.targets ?? []) {
        for (const index of Object.values(target)) rewrite(glb, index, (v) => apply(m, v, 0), replaced, done);
      }
    }
  }
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return { up: name(up), front: name(front), wdh };
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const flag = (name) => {
  const at = argv.indexOf(name);
  if (at < 0) return undefined;
  const value = argv[at + 1];
  argv.splice(at, 2);
  return value;
};
const upArg = flag('--up');
const frontArg = flag('--front');
const dry = argv.includes('--dry');
const files = argv.filter((a) => a !== '--dry');

for (const file of files) {
  const r = upright(file, upArg, frontArg, dry);
  console.log(`${file}: up ${r.up}, front ${r.front} -> wdh ${r.wdh.join(' ')}${dry ? ' (dry)' : ''}`);
}
