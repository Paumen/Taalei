// Zet kopvlakken (zaagvlakken) van stammen en balken naar een andere baan:
// driehoeken die vlak liggen langs de opgegeven as ("-as y" voor stronktoppen,
// anders de lange as van het model) en nu in de bronbaan staan.
//
//   node tools/kopvlakken.mjs stam.glb --van 2,0 --naar 0,0 [--as x|y|z] [--tolerantie 0.01]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16, RIJEN = 4, W = 512, H = 512;
const CB = W / KOLOMMEN, CH = H / RIJEN;

const argumenten = process.argv.slice(2);
let van = null, naar = null, as = null, tolerantie = 0.01, pad = null;
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--van') van = argumenten[++i].split(',').map(Number);
  else if (argumenten[i] === '--naar') naar = argumenten[++i].split(',').map(Number);
  else if (argumenten[i] === '--as') as = { x: 0, y: 1, z: 2 }[argumenten[++i]];
  else if (argumenten[i] === '--tolerantie') tolerantie = Number(argumenten[++i]);
  else pad = argumenten[i];
}
if (!pad || !van || !naar) {
  console.error('gebruik: node tools/kopvlakken.mjs <glb> --van k,r --naar k,r [--as x|y|z] [--tolerantie 0.01]');
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

    let kopAs = as;
    if (kopAs === null || kopAs === undefined) {
      // lange as van het model: daar zitten de zaagvlakken haaks op
      const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
      for (let i = 0; i < pos.count; i++) for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], pos.data[i * 3 + a]);
        max[a] = Math.max(max[a], pos.data[i * 3 + a]);
      }
      const ext = max.map((v, a) => v - min[a]);
      kopAs = ext[0] >= ext[2] ? 0 : 2;
    }

    for (let t = 0; t < idx.count; t += 3) {
      const hoeken = [idx.data[t], idx.data[t + 1], idx.data[t + 2]];
      const w = hoeken.map((i) => pos.data[i * 3 + kopAs]);
      if (Math.max(...w) - Math.min(...w) > tolerantie) continue;
      for (const i of hoeken) {
        const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const x = Math.min(Math.max(uv[0] * W, 0), W - 1e-6);
        const y = Math.min(Math.max(uv[1] * H, 0), H - 1e-6);
        if (Math.floor(x / CB) !== van[0] || Math.floor(y / CH) !== van[1]) continue;
        uv[0] = ((naar[0] + (x / CB - van[0])) * CB) / W;
        uv[1] = ((naar[1] + (y / CH - van[1])) * CH) / H;
        geraakt++;
      }
    }
  }
}
writeGlb(pad, json, bin, writeFileSync);
console.log(`${pad}: ${geraakt} kopvlak-uv's ${van.join(',')} -> ${naar.join(',')}`);
