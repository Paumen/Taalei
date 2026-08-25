// Verplaatst driehoeken naar een baan. Selectie: --bereik a-b (driehoekindex)
// of --asvlak z,+,1.0 (normaal langs as, teken, centroid voorbij afstand).
import { writeFileSync } from 'node:fs';
import { leesGlb, schrijfGlb, leesAccessor } from '../catalog/tools/glb.mjs';
const W=512,H=512,CB=32,CH=128;
const arg=process.argv.slice(2);
let pad=null,naar=null,bereik=null,asvlak=null,hoek=40,van=null;
for(let i=0;i<arg.length;i++){
  if(arg[i]==='--naar') naar=arg[++i].split(',').map(Number);
  else if(arg[i]==='--bereik') bereik=arg[++i].split('-').map(Number);
  else if(arg[i]==='--asvlak') asvlak=arg[++i].split(',');
  else if(arg[i]==='--hoek') hoek=Number(arg[++i]);
  else if(arg[i]==='--van') van=arg[++i].split(',').map(Number);
  else pad=arg[i];
}
const glb=leesGlb(pad);
const stukken=[glb.bin]; let lengte=glb.bin.length;
const nieuweView=(buf,doel)=>{const vul=(4-(lengte%4))%4; if(vul){stukken.push(Buffer.alloc(vul,0));lengte+=vul;}
  const v=glb.json.bufferViews.push({buffer:0,byteOffset:lengte,byteLength:buf.length,...(doel?{target:doel}:{})})-1;
  stukken.push(buf); lengte+=buf.length; return v;};
let verhuisd=0,gesplitst=0;
for(const mesh of glb.json.meshes ?? []) for(const prim of mesh.primitives ?? []){
  const attrs={}; for(const [n,i] of Object.entries(prim.attributes)) attrs[n]=leesAccessor(glb,i);
  const idx=leesAccessor(glb,prim.indices), pos=attrs.POSITION, uv=attrs.TEXCOORD_0;
  const inVan=(t)=>!van||[idx.data[t],idx.data[t+1],idx.data[t+2]].every(i=>{const x=Math.min(Math.max(uv.data[i*2]*W,0),W-1e-6),y=Math.min(Math.max(uv.data[i*2+1]*H,0),H-1e-6);return Math.floor(x/CB)===van[0]&&Math.floor(y/CH)===van[1];});
  const kies=new Set();
  for(let t=0;t<idx.count;t+=3){
    const tri=t/3;
    if(!inVan(t)) continue;
    if(bereik){ if(tri>=bereik[0]&&tri<bereik[1]) kies.add(t); continue; }
    const as={x:0,y:1,z:2}[asvlak[0]], teken=asvlak[1]==='+'?1:-1, grens=Number(asvlak[2]);
    const d=[idx.data[t],idx.data[t+1],idx.data[t+2]].map(i=>[pos.data[i*3],pos.data[i*3+1],pos.data[i*3+2]]);
    const u=[0,1,2].map(k=>d[1][k]-d[0][k]), v=[0,1,2].map(k=>d[2][k]-d[0][k]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const L=Math.hypot(...n); if(!L) continue;
    const c=teken*n[as]/L, ca=d.reduce((a,q)=>a+q[as],0)/3;
    if(c>Math.cos(hoek*Math.PI/180) && teken*ca>grens) kies.add(t);
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
console.log(`${pad}: ${verhuisd} driehoeken naar ${naar.join(',')}, ${gesplitst} vertices bijgemaakt`);
