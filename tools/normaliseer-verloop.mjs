// Ankert per baan het gebruikte verloopvenster van dit model op het midden van
// de baan: het centrum verschuift naar 0,5, de eigen schaduwspan blijft staan
// (alleen gekrompen als hij niet in de baan past). Zo toont dezelfde baan op
// elk model dezelfde kleur, zonder de gebakken schaduw te verliezen.
//
//   node tools/normaliseer-verloop.mjs model.glb --baan 0,0 --baan 1,0 --baan 2,0
import { writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16, RIJEN = 4, W = 512, H = 512;
const CB = W / KOLOMMEN, CH = H / RIJEN;

const argumenten = process.argv.slice(2);
const banen = []; let bereik = [0.02, 0.98]; let pad = null;
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--baan') banen.push(argumenten[++i].split(',').map(Number));
  else if (argumenten[i] === '--bereik') bereik = argumenten[++i].split(':').map(Number);
  else pad = argumenten[i];
}
if (!pad || banen.length === 0) {
  console.error('gebruik: node tools/normaliseer-verloop.mjs <glb> --baan k,r [--baan k,r] [--bereik lo:hi]');
  process.exit(1);
}

const glb = leesGlb(pad);
const { json, bin } = glb;
for (const [bk, br] of banen) {
  const uvs = [];
  const gedaan = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const index = prim.attributes?.TEXCOORD_0;
      if (index === undefined || gedaan.has(index)) continue;
      gedaan.add(index);
      const accessor = json.accessors[index];
      const bufferView = json.bufferViews[accessor.bufferView];
      const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stap = bufferView.byteStride ?? 8;
      for (let i = 0; i < accessor.count; i++) {
        const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const x = Math.min(Math.max(uv[0] * W, 0), W - 1e-6);
        const y = Math.min(Math.max(uv[1] * H, 0), H - 1e-6);
        if (Math.floor(x / CB) === bk && Math.floor(y / CH) === br) uvs.push(uv);
      }
    }
  }
  if (!uvs.length) continue;
  const vs = uvs.map((uv) => Math.min(Math.max(uv[1] * H, 0), H - 1e-6) / CH - br);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const centrum = (lo + hi) / 2, span = hi - lo;
  const doelCentrum = (bereik[0] + bereik[1]) / 2, doelBreedte = bereik[1] - bereik[0];
  const schaal = span > doelBreedte ? doelBreedte / span : 1;
  for (const uv of uvs) {
    const v = Math.min(Math.max(uv[1] * H, 0), H - 1e-6) / CH - br;
    const nieuw = Math.min(Math.max(doelCentrum + (v - centrum) * schaal, 0.02), 0.98);
    uv[1] = ((br + nieuw) * CH) / H;
  }
  console.log(`${pad}: baan ${bk},${br} venster [${lo.toFixed(2)},${hi.toFixed(2)}] -> centrum ${doelCentrum}`);
}
schrijfGlb(pad, json, bin, writeFileSync);
