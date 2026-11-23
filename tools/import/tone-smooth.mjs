import { readFileSync, writeFileSync } from 'node:fs';
import { parseGlb, readAccessor, writeGlb } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, faceNormal, fixBounds, rawRows, repack, welder } from './mesh-edit.mjs';

export function toneSmooth(glb, degrees) {
  const limit = Math.cos((degrees * Math.PI) / 180);
  const flat = Math.cos((2 * Math.PI) / 180);
  const { json } = glb;
  const replaced = new Map();
  let changed = 0;
  for (const prim of editablePrimitives(json)) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    if (uvIndex === undefined || json.accessors[uvIndex].componentType !== 5126) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, uvIndex).data;
    const idx = readAccessor(glb, prim.indices).data;
    const { weld } = welder(pos);
    const faces = [];
    const around = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const n = faceNormal(pos, idx[t], idx[t + 1], idx[t + 2]);
      const len = Math.hypot(...n);
      const cu = (uv[2 * idx[t]] + uv[2 * idx[t + 1]] + uv[2 * idx[t + 2]]) / 3;
      const cv = (uv[2 * idx[t] + 1] + uv[2 * idx[t + 1] + 1] + uv[2 * idx[t + 2] + 1]) / 3;
      const face = { n: len ? n.map((v) => v / len) : [0, 0, 0], w: len, cell: `${Math.floor(cu * 16)},${Math.floor(cv * 4)}`, v: new Map() };
      faces.push(face);
      for (let k = 0; k < 3; k++) {
        const w = weld(idx[t + k]);
        face.v.set(w, uv[2 * idx[t + k] + 1]);
        if (!around.has(w)) around.set(w, []);
        around.get(w).push(face);
      }
    }
    const keys = new Map();
    const source = [];
    const vs = [];
    const indices = new Uint32Array(idx.length);
    for (let c = 0; c < idx.length; c++) {
      const face = faces[Math.floor(c / 3)];
      const w = weld(idx[c]);
      let sum = 0, weight = 0;
      for (const o of around.get(w)) {
        const d = o.n[0] * face.n[0] + o.n[1] * face.n[1] + o.n[2] * face.n[2];
        if (o.cell !== face.cell || !face.w || d < limit) continue;
        const step = Math.abs(o.v.get(w) - face.v.get(w)) * 4;
        if (step > 0.15 || (d > flat && step > 0.02)) continue;
        sum += o.v.get(w) * o.w;
        weight += o.w;
      }
      const v = weight ? sum / weight : uv[2 * idx[c] + 1];
      if (Math.abs(v - uv[2 * idx[c] + 1]) > 1e-4) changed++;
      const key = `${idx[c]}|${Math.round(v * 1e5)}`;
      if (!keys.has(key)) {
        keys.set(key, source.length);
        source.push(idx[c]);
        vs.push(v);
      }
      indices[c] = keys.get(key);
    }
    for (const [name, index] of Object.entries(prim.attributes)) {
      const accessor = json.accessors[index];
      accessor.count = source.length;
      if (name === 'TEXCOORD_0') {
        replaced.set(index, Buffer.from(new Float32Array(source.flatMap((s, i) => [uv[2 * s], vs[i]])).buffer));
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
  return changed;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [degrees, ...files] = process.argv.slice(2);
  if (!files.length) {
    console.log('tone-smooth.mjs <degrees> <file.glb> [...]\n\nBlends each corner\'s v with the corners of the faces around it that share its colormap cell and meet it under <degrees>, so painted light and dark runs smoothly over curves; u, cells and hard edges stay, and so does a tone step between faces in one plane or one over 0.15 of the cell, such as painted stripes.');
    process.exit(1);
  }
  for (const file of files) {
    const glb = parseGlb(readFileSync(file), file);
    const n = toneSmooth(glb, +degrees);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
    console.log(`${file}: ${n} corners`);
  }
}
