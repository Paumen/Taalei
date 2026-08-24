// Herkleurt binnen één model de UV's van één colormap-baan naar een deel van
// een doelbaan. Fijner dan herkleur-baan.mjs: het doelbereik binnen het verloop
// is instelbaar, en met --uit schrijf je naar een kopie (voor debug-weergaven).
//
//   node tools/herkleur-selectie.mjs model.glb --van 14,0 --naar 5,2 --bereik 0.65:0.95
//   node tools/herkleur-selectie.mjs model.glb --van 14,0 --naar 6,0 --bereik 0:0.2 --uit /tmp/debug.glb
//
// Selectie kan verder worden beperkt met --box xmin:xmax,ymin:ymax,zmin:zmax
// (wereldloze meshcoördinaten, "-" = geen grens), zodat pagina's en kaften die
// dezelfde baan delen uit elkaar te houden zijn.
import { writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb, leesAccessor } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const W = 512, H = 512;
const CB = W / KOLOMMEN, CH = H / RIJEN;

const argumenten = process.argv.slice(2);
let van = null, naar = null, bereik = [0, 1], uit = null, box = null, pad = null;
for (let i = 0; i < argumenten.length; i++) {
  const a = argumenten[i];
  if (a === '--van') van = argumenten[++i];
  else if (a === '--naar') naar = argumenten[++i];
  else if (a === '--bereik') bereik = argumenten[++i].split(':').map(Number);
  else if (a === '--uit') uit = argumenten[++i];
  else if (a === '--box') {
    box = argumenten[++i].split(',').map((as) =>
      as.split(':').map((v) => (v === '-' ? null : Number(v))));
  } else pad = a;
}
if (!pad || !van || !naar) {
  console.error('gebruik: node tools/herkleur-selectie.mjs <glb> --van k,r --naar k,r [--bereik lo:hi] [--box x:x,y:y,z:z] [--uit kopie.glb]');
  process.exit(1);
}

const [vanK, vanR] = van.split(',').map(Number);
const [naarK, naarR] = naar.split(',').map(Number);

const glb = leesGlb(pad);
const { json, bin } = glb;
let geraakt = 0;

const gedaan = new Set();
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const index = prim.attributes?.TEXCOORD_0;
    if (index === undefined || gedaan.has(index)) continue;
    gedaan.add(index);

    const accessor = json.accessors[index];
    if (accessor.componentType !== 5126) throw new Error(`${pad}: TEXCOORD_0 is geen float`);
    const bufferView = json.bufferViews[accessor.bufferView];
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stap = bufferView.byteStride ?? 8;

    const posAcc = prim.attributes.POSITION !== undefined && box
      ? leesAccessor(glb, prim.attributes.POSITION) : null;

    for (let i = 0; i < accessor.count; i++) {
      const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
      const x = Math.min(Math.max(uv[0] * W, 0), W - 1e-6);
      const y = Math.min(Math.max(uv[1] * H, 0), H - 1e-6);
      if (Math.floor(x / CB) !== vanK || Math.floor(y / CH) !== vanR) continue;
      if (posAcc) {
        let binnen = true;
        for (let as = 0; as < 3; as++) {
          const v = posAcc.data[i * 3 + as];
          if (box[as][0] !== null && v < box[as][0]) binnen = false;
          if (box[as][1] !== null && v > box[as][1]) binnen = false;
        }
        if (!binnen) continue;
      }
      const uDeel = x / CB - vanK;
      const vDeel = y / CH - vanR;
      uv[0] = ((naarK + uDeel) * CB) / W;
      uv[1] = ((naarR + bereik[0] + vDeel * (bereik[1] - bereik[0])) * CH) / H;
      geraakt++;
    }
  }
}

schrijfGlb(uit ?? pad, json, bin, writeFileSync);
console.log(`${uit ?? pad}: ${geraakt} uv's ${van} → ${naar} [${bereik.join(':')}]${box ? ' (met box)' : ''}`);
