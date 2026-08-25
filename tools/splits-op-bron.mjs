// Verplaatst precies die driehoeken die in het BRONMODEL op cel --broncel
// staan naar baan --naar, met behoud van hun verlooppositie.
// De driehoekvolgorde van bron en werkbestand moet gelijk zijn; dat wordt
// gecontroleerd op aantallen per primitive.
//
//   node splits-op-bron.mjs <werk.glb> --bron <bron.glb> --broncel 11,3 --naar 1,0 [--proef]
import { writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb, leesAccessor } from '../catalog/tools/glb.mjs';

const W = 512, H = 512, CB = 32, CH = 128;
const arg = process.argv.slice(2);
let bronPad = null, broncel = null, naar = null, pad = null, proef = false;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--bron') bronPad = arg[++i];
  else if (arg[i] === '--broncel') broncel = arg[++i].split(',').map(Number);
  else if (arg[i] === '--naar') naar = arg[++i].split(',').map(Number);
  else if (arg[i] === '--proef') proef = true;
  else pad = arg[i];
}
if (!pad || !bronPad || !broncel || !naar) { console.error('zie kop'); process.exit(1); }

const bron = leesGlb(bronPad);
const bronPrims = [];
for (const mesh of bron.json.meshes ?? []) for (const p of mesh.primitives ?? []) {
  const uv = leesAccessor(bron, p.attributes.TEXCOORD_0), idx = leesAccessor(bron, p.indices);
  const lijst = [];
  for (let t = 0; t < idx.count; t += 3) {
    const d = [idx.data[t], idx.data[t+1], idx.data[t+2]];
    const cx = d.reduce((a,i)=>a+Math.min(Math.max(uv.data[i*2]*W,0),W-1e-6),0)/3;
    const cy = d.reduce((a,i)=>a+Math.min(Math.max(uv.data[i*2+1]*H,0),H-1e-6),0)/3;
    lijst.push(Math.floor(cx/CB) === broncel[0] && Math.floor(cy/CH) === broncel[1]);
  }
  bronPrims.push(lijst);
}

const glb = leesGlb(pad);
const stukken = [glb.bin];
let lengte = glb.bin.length;
const nieuweView = (buf, doel) => {
  const vulling = (4 - (lengte % 4)) % 4;
  if (vulling) { stukken.push(Buffer.alloc(vulling, 0)); lengte += vulling; }
  const v = glb.json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) }) - 1;
  stukken.push(buf); lengte += buf.length;
  return v;
};

let pi = 0, verhuisd = 0, gesplitst = 0;
for (const mesh of glb.json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.indices === undefined || prim.attributes?.TEXCOORD_0 === undefined) continue;
    const attrs = {};
    for (const [naam, i] of Object.entries(prim.attributes)) attrs[naam] = leesAccessor(glb, i);
    const idx = leesAccessor(glb, prim.indices);
    const bl = bronPrims[pi++];
    if (!bl || bl.length !== idx.count / 3) { console.error(`primitive ${pi-1}: bron heeft ${bl?.length} driehoeken, werk ${idx.count/3}`); process.exit(1); }
    const kies = new Set();
    for (let t = 0; t < idx.count; t += 3) if (bl[t/3]) kies.add(t);
    if (!kies.size) continue;
    verhuisd += kies.size;
    if (proef) continue;

    const kaart = new Map(); const herkomst = []; const mee = []; const nieuweIdx = [];
    for (let t = 0; t < idx.count; t += 3) {
      const gaat = kies.has(t);
      for (const i of [idx.data[t], idx.data[t+1], idx.data[t+2]]) {
        const s = `${i}|${gaat ? 1 : 0}`;
        let n = kaart.get(s);
        if (n === undefined) { n = herkomst.length; kaart.set(s, n); herkomst.push(i); mee.push(gaat); }
        nieuweIdx.push(n);
      }
    }
    gesplitst += herkomst.length - new Set(herkomst).size;
    for (const [naam, a] of Object.entries(attrs)) {
      const b = a.breedte;
      const uit = new Float32Array(herkomst.length * b);
      for (let n = 0; n < herkomst.length; n++) for (let k = 0; k < b; k++) uit[n*b+k] = a.data[herkomst[n]*b+k];
      if (naam === 'TEXCOORD_0') {
        for (let n = 0; n < herkomst.length; n++) {
          if (!mee[n]) continue;
          const x = Math.min(Math.max(uit[n*2]*W,0), W-1e-6);
          const y = Math.min(Math.max(uit[n*2+1]*H,0), H-1e-6);
          uit[n*2] = (naar[0]*CB + (x%CB))/W;
          uit[n*2+1] = (naar[1]*CH + (y%CH))/H;
        }
      }
      const view = nieuweView(Buffer.from(uit.buffer, uit.byteOffset, uit.byteLength), 34962);
      const acc = { bufferView: view, componentType: 5126, count: herkomst.length, type: b===3?'VEC3':b===2?'VEC2':b===4?'VEC4':'SCALAR' };
      if (naam === 'POSITION') {
        const a1=[Infinity,Infinity,Infinity], a2=[-Infinity,-Infinity,-Infinity];
        for (let n=0;n<herkomst.length;n++) for (let k=0;k<3;k++){ a1[k]=Math.min(a1[k],uit[n*3+k]); a2[k]=Math.max(a2[k],uit[n*3+k]); }
        acc.min=a1; acc.max=a2;
      }
      prim.attributes[naam] = glb.json.accessors.push(acc) - 1;
    }
    const groot = herkomst.length > 65535;
    const iu = groot ? new Uint32Array(nieuweIdx) : new Uint16Array(nieuweIdx);
    const iv = nieuweView(Buffer.from(iu.buffer, iu.byteOffset, iu.byteLength), 34963);
    prim.indices = glb.json.accessors.push({ bufferView: iv, componentType: groot?5125:5123, count: nieuweIdx.length, type: 'SCALAR' }) - 1;
  }
}
glb.json.buffers[0].byteLength = lengte;
if (!proef) schrijfGlb(pad, glb.json, Buffer.concat(stukken), writeFileSync);
console.log(`${pad}: ${verhuisd} driehoeken naar ${naar.join(',')}, ${gesplitst} vertices bijgemaakt${proef ? ' (proef)' : ''}`);
