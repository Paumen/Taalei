import { readGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, primitiveMatrix } from '../import/mesh-edit.mjs';
import { writeFileSync } from 'node:fs';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function ray(o,d,[a,b,c]){const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-14)return null;const s=sub(o,a),u=dot(s,h)/det;if(u<-1e-6||u>1+1e-6)return null;const q=cross(s,e1),v=dot(d,q)/det;if(v<-1e-6||u+v>1+1e-6)return null;return dot(e2,q)/det;}
if(process.argv.length<4){console.log(`thinmap.mjs <in.glb> <out.json> [wall]
Writes every triangle with its own wall, for thinmap.py to draw: faces
under [wall] (0.006) red, so the part G27 means is seen, not guessed.`);process.exit(0);}
const [file,out]=process.argv.slice(2);const glb=readGlb(file);const prim=editablePrimitives(glb.json)[0];const M=primitiveMatrix(glb.json,prim);
const L=readAccessor(glb,prim.attributes.POSITION).data,idx=readAccessor(glb,prim.indices).data;
const P=[];for(let i=0;i<L.length;i+=3)P.push([0,1,2].map(r=>M[r]*L[i]+M[4+r]*L[i+1]+M[8+r]*L[i+2]+M[12+r]));
const key=p=>p.map(x=>Math.round(x*1e4)).join(',');const ids=new Map();const vid=P.map(p=>{const k=key(p);if(!ids.has(k))ids.set(k,ids.size);return ids.get(k)});
const tris=[];for(let t=0;t+2<idx.length;t+=3){const w=[idx[t],idx[t+1],idx[t+2]];const p=w.map(i=>P[i]);const n=cross(sub(p[1],p[0]),sub(p[2],p[0]));const l=Math.hypot(...n);if(l<1e-12)continue;tris.push({p,n:n.map(x=>x/l),k:w.map(i=>vid[i])});}
const par=[...ids.keys()].map((_,i)=>i);const f=i=>{while(par[i]!==i)i=par[i]=par[par[i]];return i};for(const t of tris)for(const j of[1,2]){const a=f(t.k[0]),b=f(t.k[j]);if(a!==b)par[Math.max(a,b)]=Math.min(a,b)}
const parts=new Map();for(const t of tris){t.part=f(t.k[0]);(parts.get(t.part)??parts.set(t.part,[]).get(t.part)).push(t)}
for(const t of tris){const own=parts.get(t.part);const o=[0,1,2].map(k=>(t.p[0][k]+t.p[1][k]+t.p[2][k])/3);const d=t.n.map(x=>-x);let wall=Infinity;for(const b of own){if(b===t||dot(b.n,t.n)>-0.9||b.k.some(k=>t.k.includes(k)))continue;const r=ray(o,d,b.p);if(r!==null&&r>1e-5&&r<wall)wall=r}t.wall=wall===Infinity?null:wall}
writeFileSync(out,JSON.stringify(tris.map(t=>({p:t.p,n:t.n,w:t.wall}))));
