// Zet staande palen en stammen (hoge eilanden) om naar de bastbaan; liggende
// planken en dwarslatten blijven staan. Een eiland telt mee als zijn hoogte
// minstens het opgegeven deel van de modelhoogte beslaat.
//
//   node tools/bast-palen.mjs hek.glb --naar 2,0 [--minhoogte 0.55]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16, RIJEN = 4, W = 512, H = 512;
const CB = W / KOLOMMEN, CH = H / RIJEN;

const argumenten = process.argv.slice(2);
let naar = null, minHoogte = 0.55, pad = null;
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--naar') naar = argumenten[++i].split(',').map(Number);
  else if (argumenten[i] === '--minhoogte') minHoogte = Number(argumenten[++i]);
  else pad = argumenten[i];
}
if (!pad || !naar) {
  console.error('gebruik: node tools/bast-palen.mjs <glb> --naar k,r [--minhoogte 0.55]');
  process.exit(1);
}

const glb = readGlb(pad);
const { json, bin } = glb;
let geraakt = 0;
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.indices === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION);
    const idx = readAccessor(glb, prim.indices);
    const accessor = json.accessors[prim.attributes.TEXCOORD_0];
    const bufferView = json.bufferViews[accessor.bufferView];
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stap = bufferView.byteStride ?? 8;

    const ouder = Array.from({ length: pos.count }, (_, i) => i);
    const vind = (i) => { while (ouder[i] !== i) { ouder[i] = ouder[ouder[i]]; i = ouder[i]; } return i; };
    for (let t = 0; t < idx.count; t += 3) {
      ouder[vind(idx.data[t])] = vind(idx.data[t + 1]);
      ouder[vind(idx.data[t])] = vind(idx.data[t + 2]);
    }
    const groepen = new Map();
    for (let i = 0; i < pos.count; i++) {
      const w = vind(i);
      if (!groepen.has(w)) groepen.set(w, { leden: [], ymin: 1e9, ymax: -1e9 });
      const g = groepen.get(w);
      g.leden.push(i);
      g.ymin = Math.min(g.ymin, pos.data[i * 3 + 1]);
      g.ymax = Math.max(g.ymax, pos.data[i * 3 + 1]);
    }
    let hoogste = 0;
    for (const g of groepen.values()) hoogste = Math.max(hoogste, g.ymax);
    for (const g of groepen.values()) {
      if (g.ymax - g.ymin < minHoogte * hoogste) continue;
      for (const i of g.leden) {
        const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const x = Math.min(Math.max(uv[0] * W, 0), W - 1e-6);
        const y = Math.min(Math.max(uv[1] * H, 0), H - 1e-6);
        uv[0] = ((naar[0] + (x / CB - Math.floor(x / CB))) * CB) / W;
        uv[1] = ((naar[1] + (y / CH - Math.floor(y / CH))) * CH) / H;
        geraakt++;
      }
    }
  }
}
writeGlb(pad, json, bin, writeFileSync);
console.log(`${pad}: ${geraakt} paal-uv's -> ${naar.join(',')}`);
