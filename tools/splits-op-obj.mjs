// Verplaatst de driehoeken die in een bron-OBJ het materiaal --materiaal
// dragen naar baan --naar. De koppeling gaat op zwaartepunt, niet op
// volgorde: de werkbestanden zijn opnieuw opgebouwd en hun driehoekvolgorde
// wijkt af van de bron. Gedeelde hoekpunten worden gesplitst.
//
//   node tools/splits-op-obj.mjs <werk.glb> --obj <bron.obj> --materiaal Wood_Light --naar 0,0
import { readFileSync, writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb, leesAccessor } from '../catalog/tools/glb.mjs';
const W=512,H=512,CB=32,CH=128;
const arg=process.argv.slice(2);
let pad=null,naar=null,objPad=null,materiaal=null;
for(let i=0;i<arg.length;i++){
  if(arg[i]==='--naar') naar=arg[++i].split(',').map(Number);
  else if(arg[i]==='--obj') objPad=arg[++i];
  else if(arg[i]==='--materiaal') materiaal=arg[++i];
  else pad=arg[i];
}
if(!pad||!naar||!objPad||!materiaal){ console.error('zie kop'); process.exit(1); }
const sleutel=(c)=>c.map(v=>v.toFixed(4)).join('|');
const bronMat=new Map();
{
  const V=[]; let m=null;
  for(const line of readFileSync(objPad,'utf8').split('\n')){
    const p=line.trim().split(/\s+/);
    if(p[0]==='v') V.push(p.slice(1,4).map(Number));
    else if(p[0]==='usemtl') m=p[1];
    else if(p[0]==='f'){
      const idx=p.slice(1).filter(Boolean).map(q=>parseInt(q.split('/')[0])-1);
      for(let k=1;k<idx.length-1;k++){
        const d=[idx[0],idx[k],idx[k+1]].map(i=>V[i]);
        bronMat.set(sleutel([0,1,2].map(j=>d.reduce((a,q)=>a+q[j],0)/3)), m);
      }
    }
  }
}
const glb=leesGlb(pad);
const stukken=[glb.bin]; let lengte=glb.bin.length;
const nieuweView=(buf,doel)=>{const vul=(4-(lengte%4))%4; if(vul){stukken.push(Buffer.alloc(vul,0));lengte+=vul;}
  const v=glb.json.bufferViews.push({buffer:0,byteOffset:lengte,byteLength:buf.length,...(doel?{target:doel}:{})})-1;
  stukken.push(buf); lengte+=buf.length; return v;};
let verhuisd=0,gesplitst=0,ongekoppeld=0;
for(const mesh of glb.json.meshes ?? []) for(const prim of mesh.primitives ?? []){
  const attrs={}; for(const [n,i] of Object.entries(prim.attributes)) attrs[n]=leesAccessor(glb,i);
  const idx=leesAccessor(glb,prim.indices), pos=attrs.POSITION;
  const kies=new Set();
  for(let t=0;t<idx.count;t+=3){
    const d=[idx.data[t],idx.data[t+1],idx.data[t+2]];
    const c=[0,1,2].map(k=>d.reduce((a,i)=>a+pos.data[i*3+k],0)/3);
    const m=bronMat.get(sleutel(c));
    if(m===undefined){ ongekoppeld++; continue; }
    if(m===materiaal) kies.add(t);
  }
  if(!kies.size) continue; verhuisd+=kies.size;
  const kaart=new Map(),herk=[],mee=[],nidx=[];
  for(let t=0;t<idx.count;t+=3){const gaat=kies.has(t);
    for(const i of [idx.data[t],idx.data[t+1],idx.data[t+2]]){const s=`${i}|${gaat?1:0}`;
      let n=kaart.get(s); if(n===undefined){n=herk.length;kaart.set(s,n);herk.push(i);mee.push(gaat);} nidx.push(n);}}
  gesplitst+=herk.length-new Set(herk).size;
  for(const [naam,a] of Object.entries(attrs)){
    const b=a.breedte, uit=new Float32Array(herk.length*b);
    for(let n=0;n<herk.length;n++) for(let k=0;k<b;k++) uit[n*b+k]=a.data[herk[n]*b+k];
    if(naam==='TEXCOORD_0') for(let n=0;n<herk.length;n++){ if(!mee[n]) continue;
      const x=Math.min(Math.max(uit[n*2]*W,0),W-1e-6), y=Math.min(Math.max(uit[n*2+1]*H,0),H-1e-6);
      uit[n*2]=(naar[0]*CB+(x%CB))/W; uit[n*2+1]=(naar[1]*CH+(y%CH))/H; }
    const view=nieuweView(Buffer.from(uit.buffer,uit.byteOffset,uit.byteLength),34962);
    const acc={bufferView:view,componentType:5126,count:herk.length,type:b===3?'VEC3':b===2?'VEC2':b===4?'VEC4':'SCALAR'};
    if(naam==='POSITION'){const a1=[Infinity,Infinity,Infinity],a2=[-Infinity,-Infinity,-Infinity];
      for(let n=0;n<herk.length;n++) for(let k=0;k<3;k++){a1[k]=Math.min(a1[k],uit[n*3+k]);a2[k]=Math.max(a2[k],uit[n*3+k]);}
      acc.min=a1;acc.max=a2;}
    prim.attributes[naam]=glb.json.accessors.push(acc)-1;
  }
  const groot=herk.length>65535, iu=groot?new Uint32Array(nidx):new Uint16Array(nidx);
  const iv=nieuweView(Buffer.from(iu.buffer,iu.byteOffset,iu.byteLength),34963);
  prim.indices=glb.json.accessors.push({bufferView:iv,componentType:groot?5125:5123,count:nidx.length,type:'SCALAR'})-1;
}
glb.json.buffers[0].byteLength=lengte;
schrijfGlb(pad,glb.json,Buffer.concat(stukken),writeFileSync);
if(ongekoppeld) console.error(`LET OP: ${ongekoppeld} driehoeken niet in de bron teruggevonden`);
console.log(`${pad}: ${verhuisd} driehoeken naar ${naar.join(',')}, ${gesplitst} vertices bijgemaakt`);
