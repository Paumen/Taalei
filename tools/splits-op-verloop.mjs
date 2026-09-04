// Splitst een model op de kleurgroepen die de maker zelf heeft gelegd: alle
// driehoeken met een verlooppositie onder de grens gaan naar de lichte baan,
// de rest blijft staan.
//
// Waarom zo: in het origineel staat een stam op één baan, maar liggen de
// zaagvlakken hoger in het verloop dan de schors. Die grens is exact — geen
// benadering met hoeken of vlakken — en volgt dus precies wat de maker als
// licht en donker bedoeld heeft.
//
//   node tools/splits-op-verloop.mjs <glb> --van 2,0 --naar 0,0 --grens 0.6 [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const W = 512, H = 512, CB = 32, CH = 128;
const arg = process.argv.slice(2);
let van = null, naar = null, grens = 0.6, pad = null, proef = false;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--van') van = arg[++i].split(',').map(Number);
  else if (arg[i] === '--naar') naar = arg[++i].split(',').map(Number);
  else if (arg[i] === '--grens') grens = Number(arg[++i]);
  else if (arg[i] === '--proef') proef = true;
  else pad = arg[i];
}
if (!pad || !van || !naar) {
  console.error('gebruik: node tools/splits-op-verloop.mjs <glb> --van k,r --naar k,r [--grens 0.6] [--proef]');
  process.exit(1);
}

const glb = readGlb(pad);
const stukken = [glb.bin];
let lengte = glb.bin.length;
const nieuweView = (buf, doel) => {
  const vulling = (4 - (lengte % 4)) % 4;
  if (vulling) { stukken.push(Buffer.alloc(vulling, 0)); lengte += vulling; }
  const v = glb.json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) }) - 1;
  stukken.push(buf); lengte += buf.length;
  return v;
};

let verhuisd = 0, gesplitst = 0;
for (const mesh of glb.json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.indices === undefined || prim.attributes?.TEXCOORD_0 === undefined) continue;
    const attrs = {};
    for (const [naam, i] of Object.entries(prim.attributes)) attrs[naam] = readAccessor(glb, i);
    const idx = readAccessor(glb, prim.indices);
    const uv = attrs.TEXCOORD_0;
    const cel = (i) => {
      const x = Math.min(Math.max(uv.data[i*2]*W, 0), W-1e-6);
      const y = Math.min(Math.max(uv.data[i*2+1]*H, 0), H-1e-6);
      return { kol: Math.floor(x/CB), rij: Math.floor(y/CH), v: (y % CH) / CH };
    };
    const kies = new Set();
    for (let t = 0; t < idx.count; t += 3) {
      const d = [idx.data[t], idx.data[t+1], idx.data[t+2]].map(cel);
      if (!d.every((c) => c.kol === van[0] && c.rij === van[1])) continue;
      const v = d.reduce((s, c) => s + c.v, 0) / 3;
      if (v < grens) kies.add(t);
    }
    if (!kies.size) continue;
    verhuisd += kies.size;
    if (proef) continue;

    const kaart = new Map(); const bron = []; const mee = []; const nieuweIdx = [];
    for (let t = 0; t < idx.count; t += 3) {
      const gaat = kies.has(t);
      for (const i of [idx.data[t], idx.data[t+1], idx.data[t+2]]) {
        const s = `${i}|${gaat ? 1 : 0}`;
        let n = kaart.get(s);
        if (n === undefined) { n = bron.length; kaart.set(s, n); bron.push(i); mee.push(gaat); }
        nieuweIdx.push(n);
      }
    }
    gesplitst += bron.length - new Set(bron).size;
    for (const [naam, a] of Object.entries(attrs)) {
      const b = a.width;
      const uit = new Float32Array(bron.length * b);
      for (let n = 0; n < bron.length; n++) for (let k = 0; k < b; k++) uit[n*b+k] = a.data[bron[n]*b+k];
      if (naam === 'TEXCOORD_0') {
        for (let n = 0; n < bron.length; n++) {
          if (!mee[n]) continue;
          const x = Math.min(Math.max(uit[n*2]*W,0), W-1e-6);
          const y = Math.min(Math.max(uit[n*2+1]*H,0), H-1e-6);
          uit[n*2] = (naar[0]*CB + (x%CB))/W;
          uit[n*2+1] = (naar[1]*CH + (y%CH))/H;
        }
      }
      const view = nieuweView(Buffer.from(uit.buffer, uit.byteOffset, uit.byteLength), 34962);
      const acc = { bufferView: view, componentType: 5126, count: bron.length, type: b===3?'VEC3':b===2?'VEC2':b===4?'VEC4':'SCALAR' };
      if (naam === 'POSITION') {
        const a1=[Infinity,Infinity,Infinity], a2=[-Infinity,-Infinity,-Infinity];
        for (let n=0;n<bron.length;n++) for (let k=0;k<3;k++){ a1[k]=Math.min(a1[k],uit[n*3+k]); a2[k]=Math.max(a2[k],uit[n*3+k]); }
        acc.min=a1; acc.max=a2;
      }
      prim.attributes[naam] = glb.json.accessors.push(acc) - 1;
    }
    const groot = bron.length > 65535;
    const iu = groot ? new Uint32Array(nieuweIdx) : new Uint16Array(nieuweIdx);
    const iv = nieuweView(Buffer.from(iu.buffer, iu.byteOffset, iu.byteLength), 34963);
    prim.indices = glb.json.accessors.push({ bufferView: iv, componentType: groot?5125:5123, count: nieuweIdx.length, type: 'SCALAR' }) - 1;
  }
}
glb.json.buffers[0].byteLength = lengte;
if (!proef) writeGlb(pad, glb.json, Buffer.concat(stukken), writeFileSync);
console.log(`${pad}: ${verhuisd} driehoeken naar ${naar.join(',')}, ${gesplitst} vertices bijgemaakt${proef ? ' (proef)' : ''}`);
