import { readGlb, readAccessor, writeGlb } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, primitiveMatrix, repack, fixBounds } from '../import/mesh-edit.mjs';
import { writeFileSync } from 'node:fs';
const args=process.argv.slice(2);
if(!args.length||args.includes('--help')){console.log(`cap.mjs <in.glb> <out.glb> [--drop-inner <d>] [--box x0,y0,z0,x1,y1,z1]
Closes the open holes of a model with fans of its own points, and removes
triangles left doubled back to back. --drop-inner first removes faces that
face into the model within <d> (the inside of a hollow straw or tube), so
the closed part is solid. --box limits both to that region.`);process.exit(0);}const [file,out]=args;const inner=args.includes('--drop-inner')?Number(args[args.indexOf('--drop-inner')+1]):0;
const box=args.includes('--box')?args[args.indexOf('--box')+1].split(',').map(Number):null;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function ray(o,d,[a,b,c]){const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-14)return null;const s=sub(o,a),u=dot(s,h)/det;if(u<0||u>1)return null;const q=cross(s,e1),v=dot(d,q)/det;if(v<0||u+v>1)return null;return dot(e2,q)/det;}
const glb=readGlb(file);const prim=editablePrimitives(glb.json)[0];const M=primitiveMatrix(glb.json,prim);
const L=readAccessor(glb,prim.attributes.POSITION).data;const ia=glb.json.accessors[prim.indices];let idx=Array.from(readAccessor(glb,prim.indices).data);
const P=[];for(let i=0;i<L.length;i+=3)P.push([0,1,2].map(r=>M[r]*L[i]+M[4+r]*L[i+1]+M[8+r]*L[i+2]+M[12+r]));
const key=p=>p.map(x=>Math.round(x*1e4)).join(',');const ids=new Map();const vid=P.map(p=>{const k=key(p);if(!ids.has(k))ids.set(k,ids.size);return ids.get(k)});
const inBox=p=>!box||(p[0]>=box[0]&&p[0]<=box[3]&&p[1]>=box[1]&&p[1]<=box[4]&&p[2]>=box[2]&&p[2]<=box[5]);
let tris=[];for(let t=0;t+2<idx.length;t+=3)tris.push([idx[t],idx[t+1],idx[t+2]]);
const nrm=w=>{const p=w.map(i=>P[i]);const n=cross(sub(p[1],p[0]),sub(p[2],p[0]));const l=Math.hypot(...n);return l?n.map(x=>x/l):null};
let dropped=0;
if(inner){const keep=[];for(const w of tris){const n=nrm(w);const p=w.map(i=>P[i]);const o=[0,1,2].map(k=>(p[0][k]+p[1][k]+p[2][k])/3);
 let hit=Infinity;if(n&&p.every(inBox))for(const b of tris){if(b===w)continue;const r=ray(o,n,b.map(i=>P[i]));if(r!==null&&r>1e-6&&r<hit)hit=r}
 if(hit<inner){dropped++;continue}keep.push(w)}tris=keep}
const edges=new Map();for(const w of tris)for(let k=0;k<3;k++){const a=vid[w[k]],b=vid[w[(k+1)%3]];const e=a<b?a+','+b:b+','+a;const l=edges.get(e)??[];l.push([w[k],w[(k+1)%3]]);edges.set(e,l)}
const next=new Map();for(const [,l] of edges)if(l.length===1){const [a,b]=l[0];if(box&&!(inBox(P[a])&&inBox(P[b])))continue;next.set(vid[b],a)}
const byV=new Map();for(const [,l] of edges)if(l.length===1){const [a,b]=l[0];if(box&&!(inBox(P[a])&&inBox(P[b])))continue;byV.set(vid[a],[a,b])}
let caps=0;const seen=new Set();
for(const [start] of byV){if(seen.has(start))continue;const loop=[];let v=start;let guard=0;
 while(!seen.has(v)&&guard++<1000){seen.add(v);const e=byV.get(v);if(!e)break;loop.push(e[0]);v=vid[e[1]]}
 if(loop.length<3||v!==start)continue;
 for(let i=1;i+1<loop.length;i++)tris.push([loop[0],loop[i+1],loop[i]]);caps++}
const base=tris.length-[...Array(0)].length;
const pk=w=>w.map(i=>vid[i]).slice().sort((a,b)=>a-b).join(',');const seenT=new Map();tris.forEach((w,i)=>{const k=pk(w);(seenT.get(k)??seenT.set(k,[]).get(k)).push(i)});
const drop=new Set();for(const [,l] of seenT)if(l.length>1)l.slice(0,-1).forEach(i=>drop.add(i));
tris=tris.filter((_,i)=>!drop.has(i));console.log('removed doubles',drop.size);
const flat=tris.flat();const C=ia.componentType===5125?Uint32Array:Uint16Array;if(C===Uint16Array&&Math.max(...flat)>65535)throw 0;
ia.count=flat.length;if(ia.componentType===5121)ia.componentType=5123;
repack(glb,new Map([[prim.indices,Buffer.from(new (ia.componentType===5125?Uint32Array:Uint16Array)(flat).buffer)]]));fixBounds(glb);
writeGlb(out,glb.json,glb.bin,writeFileSync);console.log('dropped',dropped,'capped loops',caps);
