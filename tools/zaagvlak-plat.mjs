// Let op: werkt alleen bij een écht plat zaagvlak, zoals de achthoekige koppen
// van rechte palen. Bij grillige stammen (natuur/log-*) is de kop licht bol en
// splitst deze selectie het vlak doormidden — daar is dit dus niet bruikbaar.
//
// Selecteert een zaagvlak als vlak stuk: het kopvlak van een stam ligt in één
// plat vlak, de afschuining eromheen niet. Per uiteinde wordt het meest
// asgerichte driehoekje als zaad genomen; daarna gaan alleen die driehoeken
// mee waarvan alle drie de hoekpunten binnen een marge in datzelfde vlak
// liggen. Een afschuiningsdriehoek heeft altijd een hoekpunt dat op de flank
// ligt en valt dus af — zo blijft de rand rondom op de bronbaan staan.
//
//   node tools/zaagvlak-plat.mjs <glb> --van 2,0 --naar 0,0 --as x [--vanaf 0.28] [--marge 0.02] [--proef]
import { writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb, leesAccessor } from '../catalog/tools/glb.mjs';

const W = 512, H = 512, CB = 32, CH = 128;
const arg = process.argv.slice(2);
let van = null, naar = null, as = null, vanaf = 0, marge = 0.02, pad = null, proef = false;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--van') van = arg[++i].split(',').map(Number);
  else if (arg[i] === '--naar') naar = arg[++i].split(',').map(Number);
  else if (arg[i] === '--as') as = { x: 0, y: 1, z: 2 }[arg[++i]];
  else if (arg[i] === '--vanaf') vanaf = Number(arg[++i]);
  else if (arg[i] === '--marge') marge = Number(arg[++i]);
  else if (arg[i] === '--proef') proef = true;
  else pad = arg[i];
}
if (!pad || !van || !naar || as === null) {
  console.error('gebruik: node tools/zaagvlak-plat.mjs <glb> --van k,r --naar k,r --as x|y|z [--vanaf d] [--marge m] [--proef]');
  process.exit(1);
}

const glb = leesGlb(pad);
const stukken = [glb.bin];
let lengte = glb.bin.length;
const nieuweView = (buf, doel) => {
  const vulling = (4 - (lengte % 4)) % 4;
  if (vulling) { stukken.push(Buffer.alloc(vulling, 0)); lengte += vulling; }
  const view = glb.json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) }) - 1;
  stukken.push(buf); lengte += buf.length;
  return view;
};

let verhuisd = 0, gesplitst = 0;
for (const mesh of glb.json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.indices === undefined || prim.attributes?.TEXCOORD_0 === undefined) continue;
    const attrs = {};
    for (const [naam, i] of Object.entries(prim.attributes)) attrs[naam] = leesAccessor(glb, i);
    const idx = leesAccessor(glb, prim.indices);
    const pos = attrs.POSITION, uv = attrs.TEXCOORD_0;
    const P = (i, k) => pos.data[i * 3 + k];
    const inBron = (i) => {
      const x = Math.min(Math.max(uv.data[i * 2] * W, 0), W - 1e-6);
      const y = Math.min(Math.max(uv.data[i * 2 + 1] * H, 0), H - 1e-6);
      return Math.floor(x / CB) === van[0] && Math.floor(y / CH) === van[1];
    };
    const normaal = (d) => {
      const u = [P(d[1],0)-P(d[0],0), P(d[1],1)-P(d[0],1), P(d[1],2)-P(d[0],2)];
      const v = [P(d[2],0)-P(d[0],0), P(d[2],1)-P(d[0],1), P(d[2],2)-P(d[0],2)];
      const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const L = Math.hypot(...n) || 1;
      return [n[0]/L, n[1]/L, n[2]/L];
    };

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) { min = Math.min(min, P(i, as)); max = Math.max(max, P(i, as)); }
    const midden = (min + max) / 2;

    const driehoeken = [];
    for (let t = 0; t < idx.count; t += 3) {
      const d = [idx.data[t], idx.data[t+1], idx.data[t+2]];
      if (!d.every(inBron)) continue;
      const mid = d.reduce((s, i) => s + P(i, as), 0) / 3;
      if (Math.abs(mid - midden) < vanaf) continue;
      driehoeken.push({ t, d, n: normaal(d), mid });
    }
    if (!driehoeken.length) continue;

    const kies = new Set();
    for (const kant of [-1, 1]) {
      const groep = driehoeken.filter((a) => Math.sign(a.mid - midden) === kant);
      if (!groep.length) continue;
      // zaad: het vlakst op de as
      const zaad = groep.reduce((b, a) => (Math.abs(a.n[as]) > Math.abs(b.n[as]) ? a : b));
      const p0 = [0,1,2].map((k) => zaad.d.reduce((s, i) => s + P(i, k), 0) / 3);
      const afstand = (i) => Math.abs(
        (P(i,0)-p0[0])*zaad.n[0] + (P(i,1)-p0[1])*zaad.n[1] + (P(i,2)-p0[2])*zaad.n[2]);
      for (const a of groep) if (a.d.every((i) => afstand(i) <= marge)) kies.add(a.t);
    }
    if (!kies.size) continue;
    verhuisd += kies.size;
    if (proef) continue;

    const kaart = new Map(); const bron = []; const mee = []; const nieuweIdx = [];
    for (let t = 0; t < idx.count; t += 3) {
      const gaat = kies.has(t);
      for (const i of [idx.data[t], idx.data[t+1], idx.data[t+2]]) {
        const sleutel = `${i}|${gaat ? 1 : 0}`;
        let n = kaart.get(sleutel);
        if (n === undefined) { n = bron.length; kaart.set(sleutel, n); bron.push(i); mee.push(gaat); }
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
          const x = Math.min(Math.max(uit[n*2]*W, 0), W-1e-6);
          const y = Math.min(Math.max(uit[n*2+1]*H, 0), H-1e-6);
          uit[n*2] = (naar[0]*CB + (x%CB))/W;
          uit[n*2+1] = (naar[1]*CH + (y%CH))/H;
        }
      }
      const view = nieuweView(Buffer.from(uit.buffer, uit.byteOffset, uit.byteLength), 34962);
      const acc = { bufferView: view, componentType: 5126, count: bron.length, type: b===3?'VEC3':b===2?'VEC2':b===4?'VEC4':'SCALAR' };
      if (naam === 'POSITION') {
        const mn=[Infinity,Infinity,Infinity], mx=[-Infinity,-Infinity,-Infinity];
        for (let n=0;n<bron.length;n++) for (let k=0;k<3;k++){ mn[k]=Math.min(mn[k],uit[n*3+k]); mx[k]=Math.max(mx[k],uit[n*3+k]); }
        acc.min=mn; acc.max=mx;
      }
      prim.attributes[naam] = glb.json.accessors.push(acc) - 1;
    }
    const groot = bron.length > 65535;
    const iu = groot ? new Uint32Array(nieuweIdx) : new Uint16Array(nieuweIdx);
    const iview = nieuweView(Buffer.from(iu.buffer, iu.byteOffset, iu.byteLength), 34963);
    prim.indices = glb.json.accessors.push({ bufferView: iview, componentType: groot?5125:5123, count: nieuweIdx.length, type: 'SCALAR' }) - 1;
  }
}
glb.json.buffers[0].byteLength = lengte;
if (!proef) schrijfGlb(pad, glb.json, Buffer.concat(stukken), writeFileSync);
console.log(`${pad}: ${verhuisd} driehoeken, ${gesplitst} vertices bijgemaakt${proef ? ' (proef)' : ''}`);
