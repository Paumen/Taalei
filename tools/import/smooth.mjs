import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, rawRows, repack, faceNormal, welder, fixBounds } from './mesh-edit.mjs';

const HELP = `smooth.mjs [--angle <degrees>] <workfile.glb> [...]

Sets every normal again: a corner takes the angle-weighted mean of the faces
around its position that lie within --angle (50 by default) of its own face, so
folds sharper than that stay hard and the rest are smoothed. Positions, UVs and
triangles are kept. Primitives with morph targets are left alone.`;

const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l ? [v[0] / l, v[1] / l, v[2] / l] : null;
};

function cornerAngle(p, a, b, c) {
  const u = unit([0, 1, 2].map((k) => p[b * 3 + k] - p[a * 3 + k]));
  const v = unit([0, 1, 2].map((k) => p[c * 3 + k] - p[a * 3 + k]));
  if (!u || !v) return 0;
  return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
}

function smoothPrimitive(glb, prim, cos, replaced) {
  const { json } = glb;
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const old = readAccessor(glb, prim.attributes.NORMAL).data;
  const idx = readAccessor(glb, prim.indices).data;
  const { weld } = welder(pos);
  const faces = idx.length / 3;

  const normal = [];
  const around = new Map();
  for (let f = 0; f < faces; f++) {
    const c = [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]];
    normal[f] = unit(faceNormal(pos, ...c));
    if (!normal[f]) continue;
    for (let k = 0; k < 3; k++) {
      const w = weld(c[k]);
      if (!around.has(w)) around.set(w, []);
      around.get(w).push({ f, angle: cornerAngle(pos, c[k], c[(k + 1) % 3], c[(k + 2) % 3]) });
    }
  }

  const rows = Object.entries(prim.attributes).filter(([name]) => name !== 'NORMAL').map(([, index]) => rawRows(glb, index).row);
  const same = (v) => rows.map((row) => row(v).toString('hex')).join('|');
  const from = [];
  const normals = [];
  const known = new Map();
  const triangles = new Uint32Array(idx.length);
  for (let f = 0; f < faces; f++) {
    const own = normal[f];
    for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k];
      let n = null;
      if (own) {
        const sum = [0, 0, 0];
        for (const { f: g, angle } of around.get(weld(v))) {
          const m = normal[g];
          if (own[0] * m[0] + own[1] * m[1] + own[2] * m[2] < cos) continue;
          for (let i = 0; i < 3; i++) sum[i] += m[i] * angle;
        }
        n = unit(sum) ?? own;
      } else {
        n = unit([old[v * 3], old[v * 3 + 1], old[v * 3 + 2]]) ?? [0, 1, 0];
      }
      const key = `${same(v)},${n.map((x) => x.toFixed(5)).join(',')}`;
      let at = known.get(key);
      if (at === undefined) {
        at = from.length;
        known.set(key, at);
        from.push(v);
        normals.push(...n);
      }
      triangles[f * 3 + k] = at;
    }
  }

  for (const [name, index] of Object.entries(prim.attributes)) {
    const accessor = json.accessors[index];
    let bytes;
    if (name === 'NORMAL') {
      const data = Float32Array.from(normals);
      bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    } else {
      const { size, row } = rawRows(glb, index);
      bytes = Buffer.alloc(size * from.length);
      from.forEach((v, i) => row(v).copy(bytes, i * size));
    }
    accessor.count = from.length;
    replaced.set(index, bytes);
  }
  const indexAccessor = json.accessors[prim.indices];
  const narrow = from.length <= 0xffff;
  const data = narrow ? Uint16Array.from(triangles) : triangles;
  indexAccessor.componentType = narrow ? 5123 : 5125;
  replaced.set(prim.indices, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  return { before: old.length / 3, after: from.length };
}

function smooth(file, cos) {
  const glb = readGlb(file);
  const replaced = new Map();
  let before = 0;
  let after = 0;
  let skipped = 0;
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.targets?.length || prim.attributes.NORMAL === undefined) { skipped++; continue; }
    const r = smoothPrimitive(glb, prim, cos, replaced);
    before += r.before;
    after += r.after;
  }
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return { before, after, skipped };
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const at = argv.indexOf('--angle');
const angle = at < 0 ? 50 : Number(argv[at + 1]);
if (!(angle > 0 && angle < 180)) throw new Error('--angle must be between 0 and 180');
const files = argv.filter((_, i) => at < 0 || (i !== at && i !== at + 1));
const cos = Math.cos((angle * Math.PI) / 180);

for (const file of files) {
  const { before, after, skipped } = smooth(file, cos);
  console.log(`${file}: ${before} -> ${after} vertices${skipped ? `, ${skipped} primitive(s) left alone` : ''}`);
}
