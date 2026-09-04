// Splitst gedeelde vertices zodat een deel van de driehoeken naar een andere
// colormap-baan kan zonder dat buur-driehoeken meegesleept worden.
//
// Waarom dit nodig is: in deze modellen delen buur-driehoeken hun hoekpunten.
// Verhuis je alleen de driehoeken van een zaagvlak, dan verhuizen de gedeelde
// randvertices mee en komt de buur-driehoek over twee cellen te liggen — die
// sampelt dan een streep dwars over de colormap. Door de randvertices te
// dupliceren krijgt elke kant zijn eigen hoekpunten en blijft elke driehoek
// binnen één cel.
//
// De selectie is dezelfde als in kopvlak-uiteinden.mjs: driehoeken die langs
// een as kijken en ver genoeg van het midden liggen.
//
//   node tools/splits-vertices.mjs <glb> --van 2,0 --naar 0,0 --as x --vanaf 0.30 [--hoek 35] [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const W = 512, H = 512, CB = 32, CH = 128;
const arg = process.argv.slice(2);
let van = null, naar = null, as = null, vanaf = null, hoek = 35, pad = null, proef = false;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--van') van = arg[++i].split(',').map(Number);
  else if (arg[i] === '--naar') naar = arg[++i].split(',').map(Number);
  else if (arg[i] === '--as') as = { x: 0, y: 1, z: 2 }[arg[++i]];
  else if (arg[i] === '--vanaf') vanaf = Number(arg[++i]);
  else if (arg[i] === '--hoek') hoek = Number(arg[++i]);
  else if (arg[i] === '--proef') proef = true;
  else pad = arg[i];
}
if (!pad || !van || !naar || as === null || vanaf === null) {
  console.error('gebruik: node tools/splits-vertices.mjs <glb> --van k,r --naar k,r --as x|y|z --vanaf d [--hoek 35] [--proef]');
  process.exit(1);
}

const glb = readGlb(pad);
const { json } = glb;
const drempel = Math.cos((hoek * Math.PI) / 180);
const stukken = [glb.bin];
let lengte = glb.bin.length;

const nieuweView = (buf, doel) => {
  const vulling = (4 - (lengte % 4)) % 4;
  if (vulling) { stukken.push(Buffer.alloc(vulling, 0)); lengte += vulling; }
  const view = json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) }) - 1;
  stukken.push(buf); lengte += buf.length;
  return view;
};

let gesplitst = 0, verhuisd = 0;
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.indices === undefined || prim.attributes?.TEXCOORD_0 === undefined) continue;
    const attrs = {};
    for (const [naam, idx] of Object.entries(prim.attributes)) attrs[naam] = readAccessor(glb, idx);
    const idx = readAccessor(glb, prim.indices);
    const pos = attrs.POSITION, uv = attrs.TEXCOORD_0;

    const cel = (i) => {
      const x = Math.min(Math.max(uv.data[i * 2] * W, 0), W - 1e-6);
      const y = Math.min(Math.max(uv.data[i * 2 + 1] * H, 0), H - 1e-6);
      return [Math.floor(x / CB), Math.floor(y / CH)];
    };

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) { min = Math.min(min, pos.data[i * 3 + as]); max = Math.max(max, pos.data[i * 3 + as]); }
    const midden = (min + max) / 2;

    // welke driehoeken moeten verhuizen
    const teVerhuizen = new Set();
    for (let t = 0; t < idx.count; t += 3) {
      const d = [idx.data[t], idx.data[t + 1], idx.data[t + 2]];
      if (!d.every((i) => { const c = cel(i); return c[0] === van[0] && c[1] === van[1]; })) continue;
      const P = (i, k) => pos.data[i * 3 + k];
      const u = [P(d[1],0)-P(d[0],0), P(d[1],1)-P(d[0],1), P(d[1],2)-P(d[0],2)];
      const v = [P(d[2],0)-P(d[0],0), P(d[2],1)-P(d[0],1), P(d[2],2)-P(d[0],2)];
      const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const L = Math.hypot(...n);
      if (!L || Math.abs(n[as] / L) < drempel) continue;
      const mid = d.reduce((s, i) => s + P(i, as), 0) / 3;
      if (Math.abs(mid - midden) < vanaf) continue;
      teVerhuizen.add(t);
    }
    if (!teVerhuizen.size) continue;

    // nieuwe vertexlijst: een hoekpunt dat zowel in een verhuizende als in een
    // blijvende driehoek zit, krijgt een kopie
    const kaart = new Map();
    const bron = [];
    const verhuis = [];
    const nieuweIdx = [];
    for (let t = 0; t < idx.count; t += 3) {
      const mee = teVerhuizen.has(t);
      for (const i of [idx.data[t], idx.data[t + 1], idx.data[t + 2]]) {
        const sleutel = `${i}|${mee ? 1 : 0}`;
        let n = kaart.get(sleutel);
        if (n === undefined) { n = bron.length; kaart.set(sleutel, n); bron.push(i); verhuis.push(mee); }
        nieuweIdx.push(n);
      }
    }
    gesplitst += bron.length - new Set(bron).size;
    verhuisd += teVerhuizen.size;
    if (proef) continue;

    // attributen opnieuw opbouwen
    for (const [naam, a] of Object.entries(attrs)) {
      const b = a.width;
      const uit = new Float32Array(bron.length * b);
      for (let n = 0; n < bron.length; n++)
        for (let k = 0; k < b; k++) uit[n * b + k] = a.data[bron[n] * b + k];
      if (naam === 'TEXCOORD_0') {
        for (let n = 0; n < bron.length; n++) {
          if (!verhuis[n]) continue;
          const x = Math.min(Math.max(uit[n * 2] * W, 0), W - 1e-6);
          const y = Math.min(Math.max(uit[n * 2 + 1] * H, 0), H - 1e-6);
          uit[n * 2] = (naar[0] * CB + (x % CB)) / W;
          uit[n * 2 + 1] = (naar[1] * CH + (y % CH)) / H;
        }
      }
      const view = nieuweView(Buffer.from(uit.buffer, uit.byteOffset, uit.byteLength), 34962);
      const acc = { bufferView: view, componentType: 5126, count: bron.length, type: b === 3 ? 'VEC3' : b === 2 ? 'VEC2' : b === 4 ? 'VEC4' : 'SCALAR' };
      if (naam === 'POSITION') {
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let n = 0; n < bron.length; n++) for (let k = 0; k < 3; k++) {
          mn[k] = Math.min(mn[k], uit[n * 3 + k]); mx[k] = Math.max(mx[k], uit[n * 3 + k]);
        }
        acc.min = mn; acc.max = mx;
      }
      prim.attributes[naam] = json.accessors.push(acc) - 1;
    }
    const groot = bron.length > 65535;
    const iu = groot ? new Uint32Array(nieuweIdx) : new Uint16Array(nieuweIdx);
    const iview = nieuweView(Buffer.from(iu.buffer, iu.byteOffset, iu.byteLength), 34963);
    prim.indices = json.accessors.push({ bufferView: iview, componentType: groot ? 5125 : 5123, count: nieuweIdx.length, type: 'SCALAR' }) - 1;
  }
}

json.buffers[0].byteLength = lengte;
if (!proef) writeGlb(pad, json, Buffer.concat(stukken), writeFileSync);
console.log(`${pad}: ${verhuisd} driehoeken verhuisd, ${gesplitst} vertices bijgemaakt${proef ? ' (proef)' : ''}`);
