import { readFileSync, writeFileSync } from 'node:fs';
import { parseGlb, readAccessor, writeGlb } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, faceNormal, fixBounds, rawRows, repack, welder } from './mesh-edit.mjs';

export function autosmooth(glb, degrees) {
  const limit = Math.cos((degrees * Math.PI) / 180);
  const { json } = glb;
  const replaced = new Map();
  for (const prim of editablePrimitives(json)) {
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = readAccessor(glb, prim.indices).data;
    const { weld } = welder(pos);
    const faces = [];
    const around = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const n = faceNormal(pos, idx[t], idx[t + 1], idx[t + 2]);
      const len = Math.hypot(...n);
      const face = { n: len ? n.map((v) => v / len) : [0, 0, 0], w: len };
      faces.push(face);
      for (let k = 0; k < 3; k++) {
        const w = weld(idx[t + k]);
        if (!around.has(w)) around.set(w, []);
        around.get(w).push(face);
      }
    }
    const keys = new Map();
    const source = [];
    const normals = [];
    const indices = new Uint32Array(idx.length);
    for (let c = 0; c < idx.length; c++) {
      const face = faces[Math.floor(c / 3)];
      const sum = [0, 0, 0];
      for (const o of around.get(weld(idx[c]))) {
        if (face.w && o.n[0] * face.n[0] + o.n[1] * face.n[1] + o.n[2] * face.n[2] < limit) continue;
        for (let k = 0; k < 3; k++) sum[k] += o.n[k] * o.w;
      }
      const len = Math.hypot(...sum);
      const n = len ? sum.map((v) => v / len) : [0, 1, 0];
      const key = `${idx[c]}|${n.map((v) => Math.round(v * 1e4)).join(',')}`;
      if (!keys.has(key)) {
        keys.set(key, source.length);
        source.push(idx[c]);
        normals.push(...n);
      }
      indices[c] = keys.get(key);
    }
    for (const [name, index] of Object.entries(prim.attributes)) {
      const accessor = json.accessors[index];
      accessor.count = source.length;
      if (name === 'NORMAL') {
        accessor.componentType = 5126;
        delete accessor.normalized;
        replaced.set(index, Buffer.from(new Float32Array(normals).buffer));
        continue;
      }
      const { size, row } = rawRows(glb, index);
      const bytes = Buffer.alloc(size * source.length);
      source.forEach((v, i) => row(v).copy(bytes, i * size));
      replaced.set(index, bytes);
    }
    const ia = json.accessors[prim.indices];
    const wide = source.length > 65535;
    ia.componentType = wide ? 5125 : 5123;
    replaced.set(prim.indices, Buffer.from((wide ? indices : Uint16Array.from(indices)).buffer));
  }
  repack(glb, replaced);
  fixBounds(glb);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [degrees, ...files] = process.argv.slice(2);
  if (!files.length) {
    console.log('autosmooth.mjs <degrees> <file.glb> [...]');
    process.exit(1);
  }
  for (const file of files) {
    const glb = parseGlb(readFileSync(file), file);
    if (!glb.json.meshes.every((m) => m.primitives.every((p) => p.attributes.NORMAL !== undefined))) throw new Error(`no normals: ${file}`);
    autosmooth(glb, +degrees);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
    console.log(file);
  }
}
