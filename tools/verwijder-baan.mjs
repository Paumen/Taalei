// Haalt de driehoeken van één colormap-baan uit een model weg, zonder het gat te
// dichten — voor een vlak dat er gewoon niet meer moet zijn, zoals een donker
// deurpaneel achter in een boognis dat een open doorgang moet worden.
//
//   node tools/verwijder-baan.mjs kits/workfiles/pirate-kit/ship-large.glb --baan 10,0
//   node tools/verwijder-baan.mjs model.glb --baan 10,0 --vak -0.2,0.8,-1.5,0.2,1.3,-1.3
//
// Een driehoek gaat alleen weg als alle drie de hoeken op de baan liggen, en met --vak
// ook alleen als hij helemaal in dat vak past. Hoekpunten, meshes, accessors en
// bufferViews waar daarna niets meer naar wijst worden opgeruimd.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { herbouwGlb } from './glb-herbouw.mjs';

const KOLOMMEN = 16, RIJEN = 4;
const EPS = 1e-5;
const arg = process.argv.slice(2);
let pad = null, baan = null, vak = null;
for (let i = 0; i < arg.length; i++) {
  if (arg[i] === '--baan') baan = arg[++i].split(',').map(Number);
  else if (arg[i] === '--vak') vak = arg[++i].split(',').map(Number);
  else pad = arg[i];
}
if (!pad || !baan) { console.error('zie kop'); process.exit(1); }

const glb = readGlb(pad);
const vervangen = new Map();
let weg = 0;
for (const mesh of glb.json.meshes) for (const prim of mesh.primitives) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const nor = readAccessor(glb, prim.attributes.NORMAL).data;
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const idx = readAccessor(glb, prim.indices).data;
  const opBaan = (v) => Math.min(Math.floor(uv[v * 2] * KOLOMMEN), KOLOMMEN - 1) === baan[0]
    && Math.min(Math.floor(uv[v * 2 + 1] * RIJEN), RIJEN - 1) === baan[1];
  const inVak = (v) => !vak || [0, 1, 2].every((j) => pos[v * 3 + j] >= vak[j] - EPS && pos[v * 3 + j] <= vak[j + 3] + EPS);

  const houd = [];
  for (let t = 0; t < idx.length / 3; t++) {
    const d = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
    if (d.every(opBaan) && d.every(inVak)) { weg++; continue; }
    houd.push(d);
  }
  if (houd.length === idx.length / 3) continue;

  const hernummer = new Map();
  const nieuwePos = [], nieuweNor = [], nieuweUv = [], nieuweIdx = [];
  for (const d of houd) for (const v of d) {
    let n = hernummer.get(v);
    if (n === undefined) {
      n = hernummer.size;
      hernummer.set(v, n);
      nieuwePos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      nieuweNor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      nieuweUv.push(uv[v * 2], uv[v * 2 + 1]);
    }
    nieuweIdx.push(n);
  }
  vervangen.set(prim.attributes.POSITION, { waarden: nieuwePos, breedte: 3, Type: Float32Array });
  vervangen.set(prim.attributes.NORMAL, { waarden: nieuweNor, breedte: 3, Type: Float32Array });
  vervangen.set(prim.attributes.TEXCOORD_0, { waarden: nieuweUv, breedte: 2, Type: Float32Array });
  vervangen.set(prim.indices, { waarden: nieuweIdx, breedte: 1, Type: Uint16Array });
}
if (!weg) { console.error(`geen driehoek op baan ${baan.join(',')}`); process.exit(1); }

const bin = herbouwGlb(glb, { vervangen });
writeGlb(pad, glb.json, bin, writeFileSync);
console.log(`${weg} driehoeken weg`);
