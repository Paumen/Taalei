// Verplaatst UV's van één of meer colormap-cellen naar een andere cel, met
// behoud van de positie binnen de cel (geen richtingsdetectie — gebruik dit
// alleen tussen banen die dezelfde kant op lopen, zoals de houtbanen).
//
//   node tools/verplaats-cel.mjs model.glb --van 5,0 --van 14,0 --naar 0,0
import { writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16, RIJEN = 4, W = 512, H = 512;
const CB = W / KOLOMMEN, CH = H / RIJEN;

const argumenten = process.argv.slice(2);
const van = []; let naar = null; let pad = null;
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--van') van.push(argumenten[++i]);
  else if (argumenten[i] === '--naar') naar = argumenten[++i].split(',').map(Number);
  else pad = argumenten[i];
}
if (!pad || van.length === 0 || !naar) {
  console.error('gebruik: node tools/verplaats-cel.mjs <glb> --van k,r [--van k,r] --naar k,r');
  process.exit(1);
}

const glb = leesGlb(pad);
const { json, bin } = glb;
const gedaan = new Set();
let geraakt = 0;
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
      const cel = `${Math.floor(x / CB)},${Math.floor(y / CH)}`;
      if (!van.includes(cel)) continue;
      uv[0] = ((naar[0] + (x / CB - Math.floor(x / CB))) * CB) / W;
      uv[1] = ((naar[1] + (y / CH - Math.floor(y / CH))) * CH) / H;
      geraakt++;
    }
  }
}
schrijfGlb(pad, json, bin, writeFileSync);
console.log(`${pad}: ${geraakt} uv's ${van.join('+')} -> ${naar.join(',')}`);
