// Zoekt per boekmodel eilanden die als "dichte" paginatop of -zijde gelden en
// (met APPLY=1) herkleurt ze naar gebroken wit 5,2.
import { writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb, leesAccessor } from '/home/user/Taalei/catalog/tools/glb.mjs';
const W=512,H=512,CB=32,CH=128;
const APPLY = process.env.APPLY === '1';
const NAAR_K=5, NAAR_R=2, NAAR_V=0.68;

for (const pad of process.argv.slice(2)) {
  const glb = leesGlb(pad);
  const { json, bin } = glb;
  const stack = pad.includes('book-stack-1');
  console.log('==', pad.split('/').pop(), stack ? '(stapel: zijkanten)' : '(rechtop: tops)');
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives ?? []) {
    const index = prim.attributes.TEXCOORD_0;
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stap = bufferView.byteStride ?? 8;
    const pos = leesAccessor(glb, prim.attributes.POSITION);
    const idx = leesAccessor(glb, prim.indices);
    const rauw = (i) => new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);

    const ouder = Array.from({length: pos.count}, (_, i) => i);
    const vind = (i) => { while (ouder[i] !== i) { ouder[i] = ouder[ouder[i]]; i = ouder[i]; } return i; };
    for (let t = 0; t < idx.count; t += 3) {
      ouder[vind(idx.data[t])] = vind(idx.data[t+1]);
      ouder[vind(idx.data[t])] = vind(idx.data[t+2]);
    }
    const eiland = new Map();
    for (let i = 0; i < pos.count; i++) {
      const w = vind(i);
      if (!eiland.has(w)) eiland.set(w, {verts:[],banen:new Set(),vmin:2,min:[1e9,1e9,1e9],max:[-1e9,-1e9,-1e9],opp:0});
      const g = eiland.get(w); g.verts.push(i);
      const uv = rauw(i);
      const bx=Math.floor(Math.min(uv[0]*W,W-1e-6)/CB), by=Math.floor(Math.min(uv[1]*H,H-1e-6)/CH);
      g.banen.add(`${bx},${by}`);
      g.vmin=Math.min(g.vmin,(uv[1]*H)/CH-by);
      for (let as=0;as<3;as++){const v=pos.data[i*3+as];if(v<g.min[as])g.min[as]=v;if(v>g.max[as])g.max[as]=v;}
    }
    for (let t = 0; t < idx.count; t += 3) {
      const g = eiland.get(vind(idx.data[t]));
      const a=idx.data[t]*3,b=idx.data[t+1]*3,c=idx.data[t+2]*3;
      const u=[pos.data[b]-pos.data[a],pos.data[b+1]-pos.data[a+1],pos.data[b+2]-pos.data[a+2]];
      const v=[pos.data[c]-pos.data[a],pos.data[c+1]-pos.data[a+1],pos.data[c+2]-pos.data[a+2]];
      const kx=u[1]*v[2]-u[2]*v[1],ky=u[2]*v[0]-u[0]*v[2],kz=u[0]*v[1]-u[1]*v[0];
      g.opp += Math.hypot(kx,ky,kz)/2;
    }
    const witte=[...eiland.values()].filter(g=>g.banen.size===1&&[...g.banen][0]==='5,2');
    let geraakt=0;
    for (const g of eiland.values()) {
      if (g.banen.size !== 1) continue;
      const baan = [...g.banen][0];
      if (baan === '5,2') continue;
      if (g.vmin < 0.9) continue;
      const ext = g.max.map((v,i)=>v-g.min[i]);
      let kies=false, reden='';
      if (!stack) {
        const vul = g.opp / Math.max(ext[0]*ext[2], 1e-9);
        if (ext[1] < 0.05 && g.max[1] > 0.2 && g.opp > 0.003 && vul > 0.6) { kies=true; reden=`dichte top (vul ${vul.toFixed(2)})`; }
      } else {
        if (baan === '14,0' && ext[1] > 0.02 && (g.min[2]+g.max[2])/2 < 0.08) { kies=true; reden='dichte zijde'; }
      }
      if (!kies) continue;
      if (!stack) {
        const cx=(g.min[0]+g.max[0])/2, cz=(g.min[2]+g.max[2])/2;
        const bedekt = witte.some(w=>{
          const wx=(w.min[0]+w.max[0])/2, wz=(w.min[2]+w.max[2])/2;
          return Math.abs(wx-cx)<(g.max[0]-g.min[0])/2 && Math.abs(wz-cz)<(g.max[2]-g.min[2])/2 && Math.abs(w.max[1]-g.max[1])<0.004;
        });
        if (bedekt) { console.log(`  (overgeslagen: heeft al witte pagina-inzet) x=[${g.min[0].toFixed(3)},${g.max[0].toFixed(3)}]`); continue; }
      }
      console.log(`  ${reden} baan=${baan} opp=${g.opp.toFixed(4)} x=[${g.min[0].toFixed(3)},${g.max[0].toFixed(3)}] y=[${g.min[1].toFixed(3)},${g.max[1].toFixed(3)}] z=[${g.min[2].toFixed(3)},${g.max[2].toFixed(3)}]`);
      if (APPLY) for (const i of g.verts) {
        const uv = rauw(i);
        const uDeel = Math.min(uv[0]*W,W-1e-6)/CB % 1;
        uv[0] = ((NAAR_K + uDeel) * CB) / W;
        uv[1] = ((NAAR_R + NAAR_V) * CH) / H;
        geraakt++;
      }
    }
    if (APPLY && geraakt) { schrijfGlb(pad, json, bin, writeFileSync); console.log(`  → ${geraakt} uv's herkleurd`); }
  }
}
