// Zet zaagvlakken naar een andere baan op basis van de driehoeksnormaal:
// een zaagvlak kijkt langs de lengteas van de stam, de schors kijkt er haaks
// op. Robuuster dan vlakheid op coördinaat, omdat stamkoppen zelden precies
// haaks staan.
//
//   node tools/zaagvlak-normaal.mjs stam.glb --van 2,0 --naar 0,0 [--as x|y|z] [--hoek 35]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const W = 512, H = 512, CB = 32, CH = 128;
const arg = process.argv.slice(2);
let van = null, naar = null, as = null, hoek = 35, pad = null, proef = false;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--van') van = arg[++i].split(',').map(Number);
  else if (arg[i] === '--naar') naar = arg[++i].split(',').map(Number);
  else if (arg[i] === '--as') as = { x: 0, y: 1, z: 2 }[arg[++i]];
  else if (arg[i] === '--hoek') hoek = Number(arg[++i]);
  else if (arg[i] === '--proef') proef = true;
  else pad = arg[i];
}
if (!pad || !van || !naar) {
  console.error('gebruik: node tools/zaagvlak-normaal.mjs <glb> --van k,r --naar k,r [--as x|y|z] [--hoek 35] [--proef]');
  process.exit(1);
}

const glb = readGlb(pad);
const { json, bin } = glb;
const drempel = Math.cos((hoek * Math.PI) / 180);
let geraakt = 0;

for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.attributes?.TEXCOORD_0 === undefined || prim.indices === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION);
    const idx = readAccessor(glb, prim.indices);

    let richting = as;
    if (richting === null) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.count; i++)
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], pos.data[i * 3 + a]);
          max[a] = Math.max(max[a], pos.data[i * 3 + a]);
        }
      const lengte = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      richting = lengte.indexOf(Math.max(...lengte));
    }

    const accessor = json.accessors[prim.attributes.TEXCOORD_0];
    const bv = json.bufferViews[accessor.bufferView];
    const start = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stap = bv.byteStride ?? 8;
    const uvVan = (i) => new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);

    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.data[t], idx.data[t + 1], idx.data[t + 2]];
      const p = (i, k) => pos.data[i * 3 + k];
      const u = [p(b,0)-p(a,0), p(b,1)-p(a,1), p(b,2)-p(a,2)];
      const v = [p(c,0)-p(a,0), p(c,1)-p(a,1), p(c,2)-p(a,2)];
      const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const lengte = Math.hypot(...n);
      if (lengte === 0) continue;
      if (Math.abs(n[richting] / lengte) < drempel) continue;

      // alleen driehoeken die volledig in de bronbaan liggen
      const inBron = [a, b, c].every((i) => {
        const uv = uvVan(i);
        const x = Math.min(Math.max(uv[0] * W, 0), W - 1e-6);
        const y = Math.min(Math.max(uv[1] * H, 0), H - 1e-6);
        return Math.floor(x / CB) === van[0] && Math.floor(y / CH) === van[1];
      });
      if (!inBron) continue;

      for (const i of [a, b, c]) {
        const uv = uvVan(i);
        const x = Math.min(Math.max(uv[0] * W, 0), W - 1e-6);
        const y = Math.min(Math.max(uv[1] * H, 0), H - 1e-6);
        uv[0] = (naar[0] * CB + (x % CB)) / W;
        uv[1] = (naar[1] * CH + (y % CH)) / H;
        geraakt++;
      }
    }
  }
}
if (!proef) writeGlb(pad, json, bin, writeFileSync);
console.log(`${pad}: ${geraakt} zaagvlak-uv's ${van.join(',')} -> ${naar.join(',')}${proef ? ' (proef)' : ''}`);
