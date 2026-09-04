// Zet omhoog kijkende vlakken boven een hoogte naar een andere baan: het hele
// zaagvlak van een stronk, ook de rand eromheen.
// Splitst gedeelde hoekpunten zodat geen driehoek over twee cellen komt.
//
//   node tools/kopvlak-boven.mjs <glb> --van 2,0 --naar 0,0 [--minhoogte 0.55] [--drempel 0.3] [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
const W=512,H=512,CB=32,CH=128;
const a=process.argv.slice(2);
let van=null,naar=null,minhoogte=-Infinity,drempel=0.3,pad=null,proef=false;
for(let i=0;i<a.length;i++){
  if(a[i]==='--van') van=a[++i].split(',').map(Number);
  else if(a[i]==='--naar') naar=a[++i].split(',').map(Number);
  else if(a[i]==='--minhoogte') minhoogte=Number(a[++i]);
  else if(a[i]==='--drempel') drempel=Number(a[++i]);
  else if(a[i]==='--proef') proef=true;
  else pad=a[i];
}
const glb=readGlb(pad);
const stukken=[glb.bin]; let lengte=glb.bin.length;
const nieuweView=(buf,doel)=>{const vul=(4-(lengte%4))%4; if(vul){stukken.push(Buffer.alloc(vul,0));lengte+=vul;}
  const v=glb.json.bufferViews.push({buffer:0,byteOffset:lengte,byteLength:buf.length,...(doel?{target:doel}:{})})-1;
  stukken.push(buf); lengte+=buf.length; return v;};
let verhuisd=0, gesplitst=0;
for (const mesh of glb.json.meshes ?? []) for (const prim of mesh.primitives ?? []){
  if(prim.indices===undefined||prim.attributes?.TEXCOORD_0===undefined) continue;
  const attrs={}; for(const [k,i] of Object.entries(prim.attributes)) attrs[k]=readAccessor(glb,i);
  const idx=readAccessor(glb,prim.indices);
  const pos=attrs.POSITION, uv=attrs.TEXCOORD_0;
  const P=(i,k)=>pos.data[i*3+k];
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<pos.count;i++)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],P(i,k));mx[k]=Math.max(mx[k],P(i,k));}
  const asx=(mn[0]+mx[0])/2, asz=(mn[2]+mx[2])/2;
  const inBron=i=>{const x=Math.min(Math.max(uv.data[i*2]*W,0),W-1e-6),y=Math.min(Math.max(uv.data[i*2+1]*H,0),H-1e-6);
    return Math.floor(x/CB)===van[0]&&Math.floor(y/CH)===van[1];};
  const kies=new Set();
  for(let t=0;t<idx.count;t+=3){
    const d=[idx.data[t],idx.data[t+1],idx.data[t+2]];
    if(!d.every(inBron)) continue;
    const my=d.reduce((s,i)=>s+P(i,1),0)/3; if(my<minhoogte) continue;
    const u=[P(d[1],0)-P(d[0],0),P(d[1],1)-P(d[0],1),P(d[1],2)-P(d[0],2)];
    const v=[P(d[2],0)-P(d[0],0),P(d[2],1)-P(d[0],1),P(d[2],2)-P(d[0],2)];
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const L=Math.hypot(...n)||1;
    const omhoog=n[1]/L;
    if(omhoog < drempel) continue;   // alleen wat omhoog kijkt
    kies.add(t);
  }
  if(!kies.size) continue; verhuisd+=kies.size; if(proef) continue;
  const kaart=new Map(), bron=[], mee=[], nieuw=[];
  for(let t=0;t<idx.count;t+=3){ const g=kies.has(t);
    for(const i of [idx.data[t],idx.data[t+1],idx.data[t+2]]){
      const s=`${i}|${g?1:0}`; let n2=kaart.get(s);
      if(n2===undefined){n2=bron.length;kaart.set(s,n2);bron.push(i);mee.push(g);}
      nieuw.push(n2);}}
  gesplitst+=bron.length-new Set(bron).size;
  for(const [k,acc] of Object.entries(attrs)){
    const b=acc.width; const uit=new Float32Array(bron.length*b);
    for(let n2=0;n2<bron.length;n2++) for(let j=0;j<b;j++) uit[n2*b+j]=acc.data[bron[n2]*b+j];
    if(k==='TEXCOORD_0') for(let n2=0;n2<bron.length;n2++){ if(!mee[n2])continue;
      const x=Math.min(Math.max(uit[n2*2]*W,0),W-1e-6), y=Math.min(Math.max(uit[n2*2+1]*H,0),H-1e-6);
      uit[n2*2]=(naar[0]*CB+(x%CB))/W; uit[n2*2+1]=(naar[1]*CH+(y%CH))/H;}
    const view=nieuweView(Buffer.from(uit.buffer,uit.byteOffset,uit.byteLength),34962);
    const a2={bufferView:view,componentType:5126,count:bron.length,type:b===3?'VEC3':b===2?'VEC2':b===4?'VEC4':'SCALAR'};
    if(k==='POSITION'){const q1=[1e9,1e9,1e9],q2=[-1e9,-1e9,-1e9];
      for(let n2=0;n2<bron.length;n2++) for(let j=0;j<3;j++){q1[j]=Math.min(q1[j],uit[n2*3+j]);q2[j]=Math.max(q2[j],uit[n2*3+j]);}
      a2.min=q1;a2.max=q2;}
    prim.attributes[k]=glb.json.accessors.push(a2)-1;
  }
  const groot=bron.length>65535;
  const iu=groot?new Uint32Array(nieuw):new Uint16Array(nieuw);
  const iv=nieuweView(Buffer.from(iu.buffer,iu.byteOffset,iu.byteLength),34963);
  prim.indices=glb.json.accessors.push({bufferView:iv,componentType:groot?5125:5123,count:nieuw.length,type:'SCALAR'})-1;
}
glb.json.buffers[0].byteLength=lengte;
if(!proef) writeGlb(pad,glb.json,Buffer.concat(stukken),writeFileSync);
console.log(`${pad}: ${verhuisd} driehoeken, ${gesplitst} vertices bijgemaakt${proef?' (proef)':''}`);
