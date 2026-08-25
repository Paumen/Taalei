// Selecteert een zaagvlak door vanaf een zaaddriehoek over gedeelde randen
// door te groeien en te stoppen bij de knik naar de afschuining.
//
// Waarom zo: het kopvlak van een stam is licht bol, dus "vlak op de as" of
// "in één plat vlak" pakt hem nooit precies. De grens die er wél is, is de
// knik: binnen het kopvlak staan buurdriehoeken vrijwel in elkaars verlengde,
// bij de rand springt de hoek. Groeien tot die knik volgt dus de echte rand.
//
//   node tools/zaagvlak-groei.mjs <glb> --van 2,0 --naar 0,0 --as x [--vanaf 0.28] [--knik 30] [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const W = 512, H = 512, CB = 32, CH = 128;
const arg = process.argv.slice(2);
let van = null, naar = null, as = null, vanaf = 0, knik = 30, pad = null, proef = false;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--van') van = arg[++i].split(',').map(Number);
  else if (arg[i] === '--naar') naar = arg[++i].split(',').map(Number);
  else if (arg[i] === '--as') as = { x: 0, y: 1, z: 2 }[arg[++i]];
  else if (arg[i] === '--vanaf') vanaf = Number(arg[++i]);
  else if (arg[i] === '--knik') knik = Number(arg[++i]);
  else if (arg[i] === '--proef') proef = true;
  else pad = arg[i];
}
if (!pad || !van || !naar || as === null) {
  console.error('gebruik: node tools/zaagvlak-groei.mjs <glb> --van k,r --naar k,r --as x|y|z [--vanaf d] [--knik g] [--proef]');
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
    const pos = attrs.POSITION, uv = attrs.TEXCOORD_0;
    const P = (i, k) => pos.data[i * 3 + k];
    const sleutel = (i) => `${P(i,0).toFixed(5)},${P(i,1).toFixed(5)},${P(i,2).toFixed(5)}`;
    const inBron = (i) => {
      const x = Math.min(Math.max(uv.data[i*2]*W, 0), W-1e-6);
      const y = Math.min(Math.max(uv.data[i*2+1]*H, 0), H-1e-6);
      return Math.floor(x/CB) === van[0] && Math.floor(y/CH) === van[1];
    };

    const tris = [];
    for (let t = 0; t < idx.count; t += 3) {
      const d = [idx.data[t], idx.data[t+1], idx.data[t+2]];
      const u = [P(d[1],0)-P(d[0],0), P(d[1],1)-P(d[0],1), P(d[1],2)-P(d[0],2)];
      const v = [P(d[2],0)-P(d[0],0), P(d[2],1)-P(d[0],1), P(d[2],2)-P(d[0],2)];
      const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const L = Math.hypot(...n) || 1;
      tris.push({ t, d, n: [n[0]/L, n[1]/L, n[2]/L], bron: d.every(inBron),
                  mid: d.reduce((s,i)=>s+P(i,as),0)/3 });
    }

    // buren via gedeelde randen (op positie, niet op index)
    const randen = new Map();
    tris.forEach((a, ai) => {
      const s = a.d.map(sleutel);
      for (let k = 0; k < 3; k++) {
        const r = [s[k], s[(k+1)%3]].sort().join('|');
        if (!randen.has(r)) randen.set(r, []);
        randen.get(r).push(ai);
      }
    });
    const buren = tris.map(() => new Set());
    for (const lijst of randen.values())
      for (const a of lijst) for (const b of lijst) if (a !== b) buren[a].add(b);

    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < pos.count; i++) { mn = Math.min(mn, P(i,as)); mx = Math.max(mx, P(i,as)); }
    const midden = (mn + mx) / 2;
    const grens = Math.cos(knik * Math.PI / 180);

    const kies = new Set();
    for (const kant of [-1, 1]) {
      const kandidaat = tris
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.bron && Math.sign(a.mid - midden) === kant && Math.abs(a.mid - midden) >= vanaf);
      if (!kandidaat.length) continue;
      const zaad = kandidaat.reduce((b, c) => (Math.abs(c.a.n[as]) > Math.abs(b.a.n[as]) ? c : b));
      const stapel = [zaad.i]; const gezien = new Set([zaad.i]);
      while (stapel.length) {
        const i = stapel.pop();
        kies.add(tris[i].t);
        for (const j of buren[i]) {
          if (gezien.has(j) || !tris[j].bron) continue;
          const dot = tris[i].n[0]*tris[j].n[0] + tris[i].n[1]*tris[j].n[1] + tris[i].n[2]*tris[j].n[2];
          if (dot < grens) continue;               // knik: hier stopt het vlak
          gezien.add(j); stapel.push(j);
        }
      }
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
      const b = a.breedte;
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
console.log(`${pad}: ${verhuisd} driehoeken, ${gesplitst} vertices bijgemaakt${proef ? ' (proef)' : ''}`);
