// Zet de zaagvlakken aan de uiteinden van stammen naar een andere baan:
// driehoeken die langs x of z kijken, boven een minimumhoogte liggen en op de
// uiterste maat van het model zitten. De ronde flanken van stammen en palen
// kijken ook wel eens langs een as, maar liggen niet op het uiteinde — die
// blijven dus staan.
//
//   node tools/kopvlak-uiteinden.mjs <glb> --van 2,0 --naar 0,0 [--minhoogte 0.75] [--rand 0.05] [--hoek 35] [--proef]
//
// Bij grillige stammen ligt het kopvlak niet strak op de buitenmaat; gebruik
// dan --as x --vanaf 0.30: alle driehoeken die langs die as kijken en verder
// dan die afstand van het midden liggen.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const W = 512, H = 512, CB = 32, CH = 128;
const arg = process.argv.slice(2);
let van = null, naar = null, minhoogte = -Infinity, rand = 0.05, hoek = 35, pad = null, proef = false;
let as = null, vanaf = null;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--van') van = arg[++i].split(',').map(Number);
  else if (arg[i] === '--naar') naar = arg[++i].split(',').map(Number);
  else if (arg[i] === '--minhoogte') minhoogte = Number(arg[++i]);
  else if (arg[i] === '--rand') rand = Number(arg[++i]);
  else if (arg[i] === '--hoek') hoek = Number(arg[++i]);
  else if (arg[i] === '--as') as = { x: 0, y: 1, z: 2 }[arg[++i]];
  else if (arg[i] === '--vanaf') vanaf = Number(arg[++i]);
  else if (arg[i] === '--proef') proef = true;
  else pad = arg[i];
}
if (!pad || !van || !naar) {
  console.error('gebruik: node tools/kopvlak-uiteinden.mjs <glb> --van k,r --naar k,r [--minhoogte h] [--rand r] [--hoek g] [--proef]');
  process.exit(1);
}

const glb = readGlb(pad);
const drempel = Math.cos((hoek * Math.PI) / 180);
let geraakt = 0;

for (const mesh of glb.json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.indices === undefined || prim.attributes?.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION);
    const idx = readAccessor(glb, prim.indices);
    const accessor = glb.json.accessors[prim.attributes.TEXCOORD_0];
    const bv = glb.json.bufferViews[accessor.bufferView];
    const start = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stap = bv.byteStride ?? 8;
    const uvVan = (i) => new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + i * stap, 2);

    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.count; i++)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], pos.data[i * 3 + a]);
        max[a] = Math.max(max[a], pos.data[i * 3 + a]);
      }

    const inBron = (i) => {
      const uv = uvVan(i);
      const x = Math.min(Math.max(uv[0] * W, 0), W - 1e-6);
      const y = Math.min(Math.max(uv[1] * H, 0), H - 1e-6);
      return Math.floor(x / CB) === van[0] && Math.floor(y / CH) === van[1];
    };

    for (let t = 0; t < idx.count; t += 3) {
      const d = [idx.data[t], idx.data[t + 1], idx.data[t + 2]];
      if (!d.every(inBron)) continue;
      const P = (i, k) => pos.data[i * 3 + k];
      const u = [P(d[1],0)-P(d[0],0), P(d[1],1)-P(d[0],1), P(d[1],2)-P(d[0],2)];
      const v = [P(d[2],0)-P(d[0],0), P(d[2],1)-P(d[0],1), P(d[2],2)-P(d[0],2)];
      const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const lengte = Math.hypot(...n);
      if (lengte === 0) continue;
      const hoogte = d.reduce((s, i) => s + P(i, 1), 0) / 3;
      if (hoogte < minhoogte) continue;

      let raak = false;
      for (const a of as !== null ? [as] : [0, 2]) {
        if (Math.abs(n[a] / lengte) < drempel) continue;
        const mid = d.reduce((s, i) => s + P(i, a), 0) / 3;
        if (vanaf !== null) {
          // afstand tot het midden van het model langs deze as
          const midden = (min[a] + max[a]) / 2;
          if (Math.abs(mid - midden) >= vanaf) { raak = true; break; }
        } else if (mid <= min[a] + rand || mid >= max[a] - rand) { raak = true; break; }
      }
      if (!raak) continue;

      for (const i of d) {
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
if (!proef) writeGlb(pad, glb.json, glb.bin, writeFileSync);
console.log(`${pad}: ${geraakt} uv's ${van.join(',')} -> ${naar.join(',')}${proef ? ' (proef)' : ''}`);
